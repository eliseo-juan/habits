"""Remote MCP: a thin layer over the same services the REST API uses."""

from collections.abc import Callable, Iterator
from contextlib import contextmanager
from contextvars import ContextVar
from datetime import date
from typing import Any, Literal

from mcp.server.mcpserver import MCPServer
from mcp.server.mcpserver.exceptions import ToolError
from sqlalchemy.orm import Session
from starlette.responses import JSONResponse
from starlette.types import ASGIApp, Receive, Scope, Send

from app.auth.security import Principal, principal_from_token
from app.clock import utcnow
from app.db import get_sessionmaker
from app.errors import AppError
from app.schemas import HabitCreate, HabitUpdate, LogPut, ScheduleCreate, ScheduleIn
from app.services import habits, logs, views
from app.services.habits import user_today

_principal: ContextVar[Principal | None] = ContextVar("mcp_principal", default=None)

mcp = MCPServer(
    name="habits",
    instructions=(
        "Habit tracker. Dates are ISO (YYYY-MM-DD) in the user's timezone; omit a date to mean today. "
        "Past dates can be marked or corrected. Skipped days do not count for or against stats."
    ),
)


@contextmanager
def _session(write: bool = False) -> Iterator[tuple[Session, Principal]]:
    principal = _principal.get()
    if principal is None:
        raise ToolError("not authenticated")
    if write and not principal.can_write:
        raise ToolError("this token is read-only")
    with get_sessionmaker()() as db:
        bound = db.merge(principal.user, load=False)
        try:
            yield db, Principal(user=bound, can_write=principal.can_write, source="mcp")
        except AppError as error:
            raise ToolError(error.message) from error


def _day(principal: Principal, value: str | None) -> date:
    return date.fromisoformat(value) if value else user_today(principal.user, utcnow())


def _habit_line(habit, today: date) -> dict[str, Any]:
    out = habits.habit_out(habit, today)
    return {"id": out.id, "name": out.name, "schedule": out.schedule.model_dump(exclude_none=True)}


@mcp.tool()
def list_habits(include_archived: bool = False) -> list[dict[str, Any]]:
    """List the user's habits with their current schedule."""
    with _session() as (db, principal):
        today = user_today(principal.user, utcnow())
        return [_habit_line(h, today) for h in habits.list_habits(db, principal.user, include_archived)]


@mcp.tool()
def today(day: str | None = None) -> dict[str, Any]:
    """What is due on a day (default today) and its progress."""
    with _session() as (db, principal):
        view = views.today_view(db, principal.user, utcnow(), _day(principal, day))
        return {
            "date": view.date.isoformat(),
            "items": [
                {
                    "id": i.habit_id,
                    "name": i.name,
                    "status": i.status.value,
                    "done": f"{i.done_count}/{i.times_per_day}",
                    **({"period": f"{i.period_done}/{i.period_target}"} if i.period_target else {}),
                }
                for i in view.items
            ],
        }


def _log_result(log) -> dict[str, Any]:
    return {"habit_id": log.habit_id, "date": log.date.isoformat(), "done_count": log.done_count, "skipped": log.skipped}


@mcp.tool()
def mark_done(habit_id: int, day: str | None = None, count: int = 1) -> dict[str, Any]:
    """Add `count` completions to a habit on a day (default today); works for past days."""
    with _session(write=True) as (db, principal):
        return _log_result(logs.add_done(db, principal, habit_id, _day(principal, day), count, utcnow()))


@mcp.tool()
def set_day(habit_id: int, day: str, done_count: int, note: str | None = None) -> dict[str, Any]:
    """Set the exact number of completions of a habit on a day, to correct the past."""
    with _session(write=True) as (db, principal):
        data = LogPut(done_count=done_count, note=note)
        return _log_result(logs.set_log(db, principal, habit_id, date.fromisoformat(day), data, utcnow()))


@mcp.tool()
def skip(habit_id: int, day: str | None = None) -> dict[str, Any]:
    """Mark a habit as skipped on a day (default today); skipped days don't count."""
    with _session(write=True) as (db, principal):
        data = LogPut(done_count=0, skipped=True)
        return _log_result(logs.set_log(db, principal, habit_id, _day(principal, day), data, utcnow()))


@mcp.tool()
def clear_day(habit_id: int, day: str | None = None) -> str:
    """Remove whatever was recorded for a habit on a day (default today)."""
    with _session(write=True) as (db, principal):
        logs.delete_log(db, principal, habit_id, _day(principal, day))
        return "cleared"


ScheduleType = Literal["daily", "weekdays", "times_per_period"]


@mcp.tool()
def create_habit(
    name: str,
    schedule_type: ScheduleType = "daily",
    times_per_day: int = 1,
    weekdays: list[int] | None = None,
    period_unit: Literal["week", "month"] | None = None,
    period_target: int | None = None,
    start_date: str | None = None,
    icon: str | None = None,
    color: str | None = None,
) -> dict[str, Any]:
    """Create a habit. weekdays: 0 = Monday … 6 = Sunday. times_per_period needs period_unit and period_target."""
    with _session(write=True) as (db, principal):
        data = HabitCreate(
            name=name,
            icon=icon,
            color=color,
            start_date=date.fromisoformat(start_date) if start_date else None,
            schedule=ScheduleIn(
                type=schedule_type,
                times_per_day=times_per_day,
                weekdays=weekdays,
                period_unit=period_unit,
                period_target=period_target,
            ),
        )
        habit = habits.create_habit(db, principal.user, data, utcnow())
        return _habit_line(habit, user_today(principal.user, utcnow()))


@mcp.tool()
def update_habit(
    habit_id: int,
    name: str | None = None,
    icon: str | None = None,
    color: str | None = None,
    end_date: str | None = None,
    stats_start_date: str | None = None,
    archived: bool | None = None,
) -> dict[str, Any]:
    """Edit a habit's details. Only the arguments given change. Use change_schedule for frequency."""
    given = {
        "name": name,
        "icon": icon,
        "color": color,
        "end_date": date.fromisoformat(end_date) if end_date else None,
        "stats_start_date": date.fromisoformat(stats_start_date) if stats_start_date else None,
        "archived": archived,
    }
    with _session(write=True) as (db, principal):
        data = HabitUpdate(**{k: v for k, v in given.items() if v is not None})
        habit = habits.update_habit(db, principal.user, habit_id, data)
        return _habit_line(habit, user_today(principal.user, utcnow()))


@mcp.tool()
def change_schedule(
    habit_id: int,
    effective_from: str,
    schedule_type: ScheduleType,
    times_per_day: int = 1,
    weekdays: list[int] | None = None,
    period_unit: Literal["week", "month"] | None = None,
    period_target: int | None = None,
) -> dict[str, Any]:
    """Change a habit's frequency from a date on (past dates allowed); recorded days are never changed."""
    with _session(write=True) as (db, principal):
        data = ScheduleCreate(
            effective_from=date.fromisoformat(effective_from),
            type=schedule_type,
            times_per_day=times_per_day,
            weekdays=weekdays,
            period_unit=period_unit,
            period_target=period_target,
        )
        habit = habits.set_schedule(db, principal.user, habit_id, data)
        return _habit_line(habit, user_today(principal.user, utcnow()))


_SHORT = {"done": "x", "failed": "-", "skipped": "s", "pending": ".", "not_due": " "}


@mcp.tool()
def month_stats(month: str) -> dict[str, Any]:
    """Monthly view (month = YYYY-MM). days is one character per day: x done, - failed, s skipped, . pending, space not due."""
    year, number = (int(part) for part in month.split("-"))
    with _session() as (db, principal):
        view = views.month_view(db, principal.user, year, number, utcnow())
        return {
            "month": view.month,
            "habits": [
                {"id": h.habit_id, "name": h.name, "percentage": h.percentage, "days": "".join(_SHORT[s] for s in h.days.values())}
                for h in view.habits
            ],
        }


@mcp.tool()
def year_stats(year: int) -> dict[str, Any]:
    """Yearly view: overall and per-month completion percentage per habit."""
    with _session() as (db, principal):
        view = views.year_view(db, principal.user, year, utcnow())
        return {
            "year": view.year,
            "habits": [
                {
                    "id": h.habit_id,
                    "name": h.name,
                    "percentage": h.percentage,
                    "months": {m.month[-2:]: m.percentage for m in h.months if m.percentage is not None},
                }
                for h in view.habits
            ],
        }


@mcp.tool()
def habit_stats(habit_id: int, from_date: str | None = None, to_date: str | None = None) -> dict[str, Any]:
    """Percentage, streaks and counts for one habit over a date range (default: all of it up to today)."""
    with _session() as (db, principal):
        stats = views.habit_stats(
            db,
            principal.user,
            habit_id,
            utcnow(),
            date.fromisoformat(from_date) if from_date else None,
            date.fromisoformat(to_date) if to_date else None,
        )
        return stats.model_dump(mode="json")


class BearerAuth:
    """Resolves the bearer token once per request and exposes it to the tools through a context variable."""

    def __init__(self, app: ASGIApp, sessions: Callable[[], Session] | None = None):
        self.app = app
        self.sessions = sessions

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        header = dict(scope["headers"]).get(b"authorization", b"").decode()
        scheme, _, token = header.partition(" ")
        principal = None
        if scheme.lower() == "bearer" and token.strip():
            with (self.sessions or get_sessionmaker())() as db:
                principal = principal_from_token(db, token.strip(), utcnow())
        if principal is None:
            response = JSONResponse({"code": "unauthorized", "message": "missing or invalid token"}, status_code=401)
            await response(scope, receive, send)
            return
        reset = _principal.set(principal)
        try:
            await self.app(scope, receive, send)
        finally:
            _principal.reset(reset)
