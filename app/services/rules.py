"""Pure habit calculation rules: what is due, what failed, percentages and streaks.

No database or clock access here, so every rule is testable with fixed dates.
"""

from collections.abc import Mapping
from dataclasses import dataclass, field
from datetime import date, datetime, time, timedelta
from enum import StrEnum
from typing import Literal
from zoneinfo import ZoneInfo

ScheduleType = Literal["daily", "weekdays", "times_per_period"]
PeriodUnit = Literal["week", "month"]


class DayStatus(StrEnum):
    DONE = "done"
    FAILED = "failed"
    SKIPPED = "skipped"
    PENDING = "pending"
    NOT_DUE = "not_due"


@dataclass(frozen=True)
class Schedule:
    effective_from: date
    type: ScheduleType
    times_per_day: int = 1
    weekdays: frozenset[int] = frozenset()
    period_unit: PeriodUnit | None = None
    period_target: int | None = None


@dataclass(frozen=True)
class DayLog:
    done_count: int
    skipped: bool


@dataclass(frozen=True)
class HabitTimeline:
    start_date: date
    end_date: date | None
    stats_start_date: date | None
    schedules: tuple[Schedule, ...]
    logs: Mapping[date, DayLog] = field(default_factory=dict)


@dataclass(frozen=True)
class TodayEntry:
    due: bool
    status: DayStatus
    done_count: int
    times_per_day: int
    period_done: int | None = None
    period_target: int | None = None


@dataclass(frozen=True)
class Unit:
    """One countable unit for statistics: a due day, or a period for times_per_period."""

    first_day: date
    last_day: date
    outcome: DayStatus


@dataclass(frozen=True)
class Stats:
    done: int
    failed: int
    skipped: int
    percentage: float | None
    current_streak: int
    best_streak: int


def logical_date(now: datetime, timezone_name: str, day_cutoff: time) -> date:
    local = now.astimezone(ZoneInfo(timezone_name))
    if local.time() < day_cutoff:
        return local.date() - timedelta(days=1)
    return local.date()


def schedule_on(schedules: tuple[Schedule, ...], day: date) -> Schedule | None:
    current = None
    for schedule in sorted(schedules, key=lambda s: s.effective_from):
        if schedule.effective_from <= day:
            current = schedule
    return current


def period_bounds(unit: PeriodUnit, day: date) -> tuple[date, date]:
    if unit == "week":
        start = day - timedelta(days=day.weekday())
        return start, start + timedelta(days=6)
    start = day.replace(day=1)
    next_month = (start + timedelta(days=32)).replace(day=1)
    return start, next_month - timedelta(days=1)


def _in_range(habit: HabitTimeline, day: date) -> bool:
    return habit.start_date <= day and (habit.end_date is None or day <= habit.end_date)


def _log(habit: HabitTimeline, day: date) -> DayLog:
    return habit.logs.get(day, DayLog(done_count=0, skipped=False))


def _is_done(habit: HabitTimeline, day: date, schedule: Schedule) -> bool:
    return _log(habit, day).done_count >= schedule.times_per_day


def _scheduled_weekday(schedule: Schedule, day: date) -> bool:
    return schedule.type == "daily" or day.weekday() in schedule.weekdays


def _period_days(habit: HabitTimeline, schedule: Schedule, day: date) -> tuple[date, date]:
    """Days of the period around `day` that share its schedule version and the habit's range."""
    assert schedule.period_unit is not None
    start, end = period_bounds(schedule.period_unit, day)
    start = max(start, schedule.effective_from, habit.start_date)
    later = [
        s.effective_from for s in habit.schedules if s.effective_from > schedule.effective_from
    ]
    if later:
        end = min(end, min(later) - timedelta(days=1))
    if habit.end_date is not None:
        end = min(end, habit.end_date)
    return start, end


def _days(first: date, last: date):
    day = first
    while day <= last:
        yield day
        day += timedelta(days=1)


def _period_done(
    habit: HabitTimeline, schedule: Schedule, day: date, exclude: date | None = None
) -> int:
    start, end = _period_days(habit, schedule, day)
    return sum(1 for d in _days(start, end) if d != exclude and _is_done(habit, d, schedule))


def day_status(habit: HabitTimeline, day: date, today: date) -> DayStatus:
    schedule = schedule_on(habit.schedules, day)
    if schedule is None or not _in_range(habit, day):
        return DayStatus.NOT_DUE
    log = _log(habit, day)
    if log.skipped:
        return DayStatus.SKIPPED
    if _is_done(habit, day, schedule):
        return DayStatus.DONE
    if schedule.type == "times_per_period":
        assert schedule.period_target is not None
        if day < today or _period_done(habit, schedule, day) >= schedule.period_target:
            return DayStatus.NOT_DUE
        return DayStatus.PENDING
    if not _scheduled_weekday(schedule, day):
        return DayStatus.NOT_DUE
    return DayStatus.FAILED if day < today else DayStatus.PENDING


def today_entry(habit: HabitTimeline, today: date) -> TodayEntry:
    schedule = schedule_on(habit.schedules, today)
    log = _log(habit, today)
    if schedule is None or not _in_range(habit, today):
        return TodayEntry(False, DayStatus.NOT_DUE, log.done_count, 1)
    status = day_status(habit, today, today)
    if schedule.type == "times_per_period":
        assert schedule.period_target is not None
        due = _period_done(habit, schedule, today, exclude=today) < schedule.period_target
        return TodayEntry(
            due=due,
            status=status if due else DayStatus.NOT_DUE,
            done_count=log.done_count,
            times_per_day=schedule.times_per_day,
            period_done=_period_done(habit, schedule, today),
            period_target=schedule.period_target,
        )
    return TodayEntry(
        due=_scheduled_weekday(schedule, today),
        status=status,
        done_count=log.done_count,
        times_per_day=schedule.times_per_day,
    )


def _units(habit: HabitTimeline, last: date, today: date) -> list[Unit]:
    """Every countable unit from the start of the habit (or of its stats) up to `last`."""
    first = max(habit.start_date, habit.stats_start_date or habit.start_date)
    if habit.end_date is not None:
        last = min(last, habit.end_date)
    units: list[Unit] = []
    seen_periods: set[tuple[date, date]] = set()
    for day in _days(first, last):
        schedule = schedule_on(habit.schedules, day)
        if schedule is None:
            continue
        if schedule.type != "times_per_period":
            if _scheduled_weekday(schedule, day):
                units.append(Unit(day, day, day_status(habit, day, today)))
            continue
        assert schedule.period_target is not None
        period = _period_days(habit, schedule, day)
        if period in seen_periods:
            continue
        seen_periods.add(period)
        counted = sum(
            1 for d in _days(max(period[0], first), period[1]) if _is_done(habit, d, schedule)
        )
        if counted >= schedule.period_target:
            outcome = DayStatus.DONE
        elif period[1] < today:
            outcome = DayStatus.FAILED
        else:
            outcome = DayStatus.PENDING
        units.append(Unit(period[0], period[1], outcome))
    return units


def _streaks(units: list[Unit], today: date) -> tuple[int, int]:
    counted = [u.outcome for u in units if u.first_day <= today]
    current = 0
    for outcome in reversed(counted):
        if outcome is DayStatus.FAILED:
            break
        if outcome is DayStatus.DONE:
            current += 1
    best = run = 0
    for outcome in counted:
        if outcome is DayStatus.DONE:
            run += 1
            best = max(best, run)
        elif outcome is DayStatus.FAILED:
            run = 0
    return current, best


def summarize(habit: HabitTimeline, first: date, last: date, today: date) -> Stats:
    """Stats over [first, last]; a period belongs to the range that holds its last day."""
    all_units = _units(habit, max(last, today) + timedelta(days=31), today)
    in_range = [u for u in all_units if first <= u.last_day <= last]
    done = sum(1 for u in in_range if u.outcome is DayStatus.DONE)
    failed = sum(1 for u in in_range if u.outcome is DayStatus.FAILED)
    skipped = sum(1 for u in in_range if u.outcome is DayStatus.SKIPPED)
    percentage = round(100 * done / (done + failed), 1) if done + failed else None
    current, best = _streaks(all_units, today)
    return Stats(done, failed, skipped, percentage, current, best)
