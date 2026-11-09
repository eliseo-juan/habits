from datetime import date, datetime, time, timedelta, timezone

from app.services.rules import (
    DayLog,
    DayStatus,
    HabitTimeline,
    Schedule,
    day_status,
    logical_date,
    summarize,
    today_entry,
)

MON = date(2026, 11, 2)


def daily(effective_from=date(2026, 1, 1), times_per_day=1):
    return Schedule(effective_from=effective_from, type="daily", times_per_day=times_per_day)


def weekdays(*days, effective_from=date(2026, 1, 1)):
    return Schedule(effective_from=effective_from, type="weekdays", weekdays=frozenset(days))


def per_week(target, effective_from=date(2026, 1, 1)):
    return Schedule(effective_from=effective_from, type="times_per_period", period_unit="week", period_target=target)


def timeline(schedules, logs=None, start=date(2026, 1, 1), end=None, stats_start=None):
    return HabitTimeline(
        start_date=start,
        end_date=end,
        stats_start_date=stats_start,
        schedules=tuple(schedules),
        logs=logs or {},
    )


def done(n=1):
    return DayLog(done_count=n, skipped=False)


SKIP = DayLog(done_count=0, skipped=True)


def test_twice_a_day_needs_two_marks():
    h = timeline([daily(times_per_day=2)], {MON: done(1)})
    assert day_status(h, MON, today=MON) is DayStatus.PENDING
    assert day_status(h, MON, today=MON + timedelta(days=1)) is DayStatus.FAILED

    h = timeline([daily(times_per_day=2)], {MON: done(2)})
    assert day_status(h, MON, today=MON) is DayStatus.DONE


def test_weekdays_off_day_is_not_due_and_not_a_failure():
    h = timeline([weekdays(0, 2, 4)])
    tuesday = MON + timedelta(days=1)
    assert day_status(h, tuesday, today=MON + timedelta(days=7)) is DayStatus.NOT_DUE
    stats = summarize(h, MON, MON + timedelta(days=6), today=MON + timedelta(days=7))
    assert stats.failed == 3
    assert stats.done == 0


def test_times_per_week_leaves_today_after_target_and_short_week_fails():
    logs = {MON: done(), MON + timedelta(days=1): done(), MON + timedelta(days=2): done()}
    h = timeline([per_week(3)], logs)
    wednesday, thursday = MON + timedelta(days=2), MON + timedelta(days=3)
    assert today_entry(h, wednesday).due
    assert today_entry(h, wednesday).period_done == 3
    assert not today_entry(h, thursday).due

    short = timeline([per_week(3)], {MON: done(), MON + timedelta(days=1): done()})
    assert today_entry(short, thursday).due
    open_week = summarize(short, MON, MON + timedelta(days=6), today=thursday)
    assert open_week.failed == 0
    closed_week = summarize(short, MON, MON + timedelta(days=6), today=MON + timedelta(days=7))
    assert closed_week.failed == 1
    assert closed_week.done == 0


def test_skipped_day_keeps_streak_and_percentage():
    logs = {MON: done(), MON + timedelta(days=1): SKIP, MON + timedelta(days=2): done()}
    h = timeline([daily()], logs, start=MON)
    stats = summarize(h, MON, MON + timedelta(days=2), today=MON + timedelta(days=2))
    assert stats.percentage == 100.0
    assert stats.current_streak == 2
    assert stats.skipped == 1


def test_moving_stats_start_changes_stats_without_touching_logs():
    logs = {MON + timedelta(days=2): done(), MON + timedelta(days=3): done()}
    end = MON + timedelta(days=3)
    full = timeline([daily()], logs, start=MON)
    assert summarize(full, MON, end, today=end).percentage == 50.0

    moved = timeline([daily()], logs, start=MON, stats_start=MON + timedelta(days=2))
    stats = summarize(moved, MON, end, today=end)
    assert stats.percentage == 100.0
    assert stats.current_streak == 2
    assert moved.logs == logs


def test_new_schedule_from_past_date_keeps_logs():
    logs = {MON: done(), MON + timedelta(days=1): done()}
    h = timeline([daily(), weekdays(0, effective_from=MON)], logs)
    assert h.logs == logs
    tuesday = MON + timedelta(days=1)
    assert day_status(h, tuesday, today=MON + timedelta(days=7)) is DayStatus.DONE
    stats = summarize(h, MON, MON + timedelta(days=6), today=MON + timedelta(days=7))
    assert stats.done == 1
    assert stats.failed == 0


def test_log_after_midnight_belongs_to_new_day():
    madrid_0030 = datetime(2026, 11, 9, 23, 30, tzinfo=timezone.utc)
    assert logical_date(madrid_0030, "Europe/Madrid", time(0, 0)) == date(2026, 11, 10)


def test_cutoff_after_midnight_keeps_previous_day():
    madrid_0030 = datetime(2026, 11, 9, 23, 30, tzinfo=timezone.utc)
    assert logical_date(madrid_0030, "Europe/Madrid", time(3, 0)) == date(2026, 11, 9)


def test_today_pending_is_not_a_failure():
    h = timeline([daily()], {MON: done()}, start=MON)
    tuesday = MON + timedelta(days=1)
    stats = summarize(h, MON, tuesday, today=tuesday)
    assert stats.percentage == 100.0
    assert stats.current_streak == 1


def test_failure_breaks_streak_and_best_streak_is_kept():
    logs = {MON: done(), MON + timedelta(days=1): done(), MON + timedelta(days=3): done()}
    h = timeline([daily()], logs, start=MON)
    stats = summarize(h, MON, MON + timedelta(days=3), today=MON + timedelta(days=3))
    assert stats.current_streak == 1
    assert stats.best_streak == 2
    assert stats.percentage == 75.0


def test_days_outside_start_and_end_are_not_due():
    h = timeline([daily()], start=MON, end=MON + timedelta(days=1))
    assert day_status(h, MON - timedelta(days=1), today=MON + timedelta(days=5)) is DayStatus.NOT_DUE
    assert day_status(h, MON + timedelta(days=2), today=MON + timedelta(days=5)) is DayStatus.NOT_DUE
    assert summarize(h, MON - timedelta(days=3), MON + timedelta(days=5), today=MON + timedelta(days=5)).failed == 2


def test_week_periods_start_on_monday_and_count_streaks():
    logs = {}
    for week in range(3):
        for day in range(2):
            logs[MON + timedelta(days=7 * week + day)] = done()
    h = timeline([per_week(2)], logs, start=MON)
    today = MON + timedelta(days=21)
    stats = summarize(h, MON, today, today=today)
    assert stats.done == 3
    assert stats.current_streak == 3
    assert stats.percentage == 100.0


def test_future_days_are_pending_not_failed():
    h = timeline([daily()], start=MON)
    assert day_status(h, MON + timedelta(days=3), today=MON) is DayStatus.PENDING
    assert summarize(h, MON, MON + timedelta(days=6), today=MON).percentage is None
