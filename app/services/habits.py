from collections.abc import Iterable
from datetime import date, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.errors import Invalid, NotFound
from app.models import Habit, HabitSchedule, Log, User
from app.schemas import HabitCreate, HabitOut, HabitUpdate, ScheduleCreate, ScheduleIn, ScheduleOut
from app.services import rules
from app.services.webhooks import notify_changed


def weekdays_to_mask(days: list[int] | None) -> int | None:
    return None if days is None else sum(1 << d for d in days)


def mask_to_weekdays(mask: int | None) -> list[int] | None:
    return None if mask is None else [d for d in range(7) if mask & (1 << d)]


def user_today(user: User, now: datetime) -> date:
    return rules.logical_date(now, user.timezone, user.day_cutoff)


def get_habit(db: Session, user: User, habit_id: int) -> Habit:
    habit = db.get(Habit, habit_id)
    if habit is None or habit.user_id != user.id:
        raise NotFound(f"habit {habit_id} not found")
    return habit


def list_habits(db: Session, user: User, include_archived: bool = False) -> list[Habit]:
    query = select(Habit).where(Habit.user_id == user.id)
    if not include_archived:
        query = query.where(Habit.archived.is_(False))
    return list(db.scalars(query.order_by(Habit.sort_order, Habit.id)))


def _check_dates(start: date, end: date | None) -> None:
    if end is not None and end < start:
        raise Invalid("end_date cannot be before start_date")


def _schedule_row(schedule: ScheduleIn, effective_from: date) -> HabitSchedule:
    return HabitSchedule(
        effective_from=effective_from,
        schedule_type=schedule.type,
        times_per_day=schedule.times_per_day,
        weekdays=weekdays_to_mask(schedule.weekdays),
        period_unit=schedule.period_unit,
        period_target=schedule.period_target,
    )


def create_habit(db: Session, user: User, data: HabitCreate, now: datetime) -> Habit:
    start = data.start_date or user_today(user, now)
    _check_dates(start, data.end_date)
    habit = Habit(
        user_id=user.id,
        name=data.name,
        color=data.color,
        icon=data.icon,
        priority=data.priority,
        start_date=start,
        end_date=data.end_date,
        stats_start_date=data.stats_start_date,
        sort_order=data.sort_order,
        archived=False,
        created_at=now,
    )
    habit.schedules.append(_schedule_row(data.schedule, start))
    db.add(habit)
    db.commit()
    notify_changed(db, user.id)
    return habit


def update_habit(db: Session, user: User, habit_id: int, data: HabitUpdate) -> Habit:
    habit = get_habit(db, user, habit_id)
    changes = data.model_dump(exclude_unset=True)
    for required in ("name", "priority", "start_date", "sort_order", "archived"):
        if required in changes and changes[required] is None:
            raise Invalid(f"{required} cannot be null")
    for field, value in changes.items():
        setattr(habit, field, value)
    _check_dates(habit.start_date, habit.end_date)
    db.commit()
    notify_changed(db, user.id)
    return habit


def archive_habit(db: Session, user: User, habit_id: int) -> None:
    habit = get_habit(db, user, habit_id)
    habit.archived = True
    db.commit()
    notify_changed(db, user.id)


def set_schedule(db: Session, user: User, habit_id: int, data: ScheduleCreate) -> Habit:
    """Adds a schedule version; a version on the same effective_from is replaced. Logs are never touched."""
    habit = get_habit(db, user, habit_id)
    for existing in list(habit.schedules):
        if existing.effective_from == data.effective_from:
            habit.schedules.remove(existing)
    db.flush()
    habit.schedules.append(_schedule_row(data, data.effective_from))
    db.commit()
    notify_changed(db, user.id)
    db.refresh(habit)
    return habit


def schedule_out(row: HabitSchedule) -> ScheduleOut:
    return ScheduleOut(
        effective_from=row.effective_from,
        type=row.schedule_type,
        times_per_day=row.times_per_day,
        weekdays=mask_to_weekdays(row.weekdays),
        period_unit=row.period_unit,
        period_target=row.period_target,
    )


def habit_out(habit: Habit, today: date) -> HabitOut:
    schedules = [schedule_out(s) for s in habit.schedules]
    current = next((s for s in reversed(schedules) if s.effective_from <= today), schedules[0])
    return HabitOut(
        id=habit.id,
        name=habit.name,
        color=habit.color,
        icon=habit.icon,
        priority=habit.priority,
        start_date=habit.start_date,
        end_date=habit.end_date,
        stats_start_date=habit.stats_start_date,
        archived=habit.archived,
        sort_order=habit.sort_order,
        schedule=current,
        schedules=schedules,
    )


def _rule_schedule(row: HabitSchedule) -> rules.Schedule:
    return rules.Schedule(
        effective_from=row.effective_from,
        type=row.schedule_type,  # type: ignore[arg-type]
        times_per_day=row.times_per_day,
        weekdays=frozenset(mask_to_weekdays(row.weekdays) or ()),
        period_unit=row.period_unit,  # type: ignore[arg-type]
        period_target=row.period_target,
    )


def timeline(habit: Habit, logs: Iterable[Log]) -> rules.HabitTimeline:
    return rules.HabitTimeline(
        start_date=habit.start_date,
        end_date=habit.end_date,
        stats_start_date=habit.stats_start_date,
        schedules=tuple(_rule_schedule(s) for s in habit.schedules),
        logs={
            log.date: rules.DayLog(done_count=log.done_count, skipped=log.skipped) for log in logs
        },
    )


def timelines(db: Session, habits: list[Habit]) -> dict[int, rules.HabitTimeline]:
    by_habit: dict[int, list[Log]] = {h.id: [] for h in habits}
    if habits:
        for log in db.scalars(select(Log).where(Log.habit_id.in_(by_habit))):
            by_habit[log.habit_id].append(log)
    return {h.id: timeline(h, by_habit[h.id]) for h in habits}
