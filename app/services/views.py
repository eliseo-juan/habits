from datetime import date, datetime, timedelta

from sqlalchemy.orm import Session

from app.models import User
from app.schemas import (
    AwtrixHabit,
    AwtrixOut,
    AwtrixStreak,
    HabitMonth,
    HabitStatsOut,
    HabitYear,
    MonthOut,
    MonthPercentage,
    TodayItem,
    TodayOut,
    YearOut,
)
from app.services import rules
from app.services.habits import get_habit, list_habits, timelines, user_today


def _month_bounds(year: int, month: int) -> tuple[date, date]:
    return rules.period_bounds("month", date(year, month, 1))


def _days(first: date, last: date) -> list[date]:
    return [first + timedelta(days=i) for i in range((last - first).days + 1)]


def today_view(db: Session, user: User, now: datetime, day: date | None = None) -> TodayOut:
    day = day or user_today(user, now)
    habits = list_habits(db, user)
    by_id = timelines(db, habits)
    items = []
    for habit in habits:
        entry = rules.today_entry(by_id[habit.id], day)
        if not entry.due:
            continue
        items.append(
            TodayItem(
                habit_id=habit.id,
                name=habit.name,
                kind=habit.kind,
                color=habit.color,
                icon=habit.icon,
                priority=habit.priority,
                status=entry.status,
                done_count=entry.done_count,
                times_per_day=entry.times_per_day,
                period_done=entry.period_done,
                period_target=entry.period_target,
            )
        )
    return TodayOut(date=day, items=items)


def month_view(db: Session, user: User, year: int, month: int, now: datetime) -> MonthOut:
    today = user_today(user, now)
    first, last = _month_bounds(year, month)
    habits = list_habits(db, user)
    by_id = timelines(db, habits)
    result = []
    for habit in habits:
        line = by_id[habit.id]
        result.append(
            HabitMonth(
                habit_id=habit.id,
                name=habit.name,
                percentage=rules.summarize(line, first, last, today).percentage,
                days={d: rules.day_status(line, d, today) for d in _days(first, last)},
            )
        )
    return MonthOut(month=f"{year:04d}-{month:02d}", habits=result)


def year_view(db: Session, user: User, year: int, now: datetime) -> YearOut:
    today = user_today(user, now)
    first, last = date(year, 1, 1), date(year, 12, 31)
    habits = list_habits(db, user)
    by_id = timelines(db, habits)
    result = []
    for habit in habits:
        line = by_id[habit.id]
        months = []
        for month in range(1, 13):
            m_first, m_last = _month_bounds(year, month)
            months.append(
                MonthPercentage(
                    month=f"{year:04d}-{month:02d}",
                    percentage=rules.summarize(line, m_first, m_last, today).percentage,
                )
            )
        result.append(
            HabitYear(
                habit_id=habit.id,
                name=habit.name,
                percentage=rules.summarize(line, first, last, today).percentage,
                months=months,
                days={d: rules.day_status(line, d, today) for d in _days(first, last)},
            )
        )
    return YearOut(year=year, habits=result)


def habit_stats(
    db: Session, user: User, habit_id: int, now: datetime, first: date | None, last: date | None
) -> HabitStatsOut:
    habit = get_habit(db, user, habit_id)
    today = user_today(user, now)
    first = first or habit.stats_start_date or habit.start_date
    last = last or today
    stats = rules.summarize(timelines(db, [habit])[habit.id], first, last, today)
    return HabitStatsOut(
        habit_id=habit.id,
        from_date=first,
        to_date=last,
        done=stats.done,
        failed=stats.failed,
        skipped=stats.skipped,
        percentage=stats.percentage,
        current_streak=stats.current_streak,
        best_streak=stats.best_streak,
    )


def awtrix_summary(db: Session, user: User, now: datetime, top: int = 3) -> AwtrixOut:
    today = user_today(user, now)
    habits = list_habits(db, user)
    by_id = timelines(db, habits)
    pending, done, streaks = [], [], []
    for habit in habits:
        line = by_id[habit.id]
        entry = rules.today_entry(line, today)
        to_do = habit.kind == "build" and entry.due
        item = AwtrixHabit(id=habit.id, name=habit.name, icon=habit.icon, color=habit.color)
        if to_do and entry.status is rules.DayStatus.PENDING:
            pending.append(item)
        elif to_do and entry.status is rules.DayStatus.DONE:
            done.append(item)
        streak = rules.summarize(line, today, today, today).current_streak
        if streak:
            streaks.append(AwtrixStreak(name=habit.name, streak=streak))
    streaks.sort(key=lambda s: s.streak, reverse=True)
    return AwtrixOut(
        date=today,
        pending=len(pending),
        done=len(done),
        total=len(pending) + len(done),
        pending_habits=pending,
        done_habits=done,
        top_streaks=streaks[:top],
    )
