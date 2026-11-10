from datetime import date, datetime

from sqlalchemy.orm import Session

from app.auth.security import Principal
from app.errors import Invalid, NotFound
from app.models import Log
from app.schemas import LogPut
from app.services.habits import get_habit, user_today
from app.services.webhooks import notify_changed


def _reject_future_done(principal: Principal, day: date, done_count: int, now: datetime) -> None:
    if done_count > 0 and day > user_today(principal.user, now):
        raise Invalid("cannot mark a future day as done")


def set_log(
    db: Session, principal: Principal, habit_id: int, day: date, data: LogPut, now: datetime
) -> Log:
    get_habit(db, principal.user, habit_id)
    _reject_future_done(principal, day, data.done_count, now)
    log = db.get(Log, (habit_id, day)) or Log(habit_id=habit_id, date=day)
    log.done_count = data.done_count
    log.skipped = data.skipped
    log.note = data.note
    log.source = principal.source
    log.updated_at = now
    db.add(log)
    db.commit()
    notify_changed(db, principal.user.id)
    return log


def add_done(
    db: Session, principal: Principal, habit_id: int, day: date, count: int, now: datetime
) -> Log:
    get_habit(db, principal.user, habit_id)
    _reject_future_done(principal, day, count, now)
    log = db.get(Log, (habit_id, day)) or Log(habit_id=habit_id, date=day, done_count=0)
    log.done_count = (log.done_count or 0) + count
    log.skipped = False
    log.source = principal.source
    log.updated_at = now
    db.add(log)
    db.commit()
    notify_changed(db, principal.user.id)
    return log


def get_log(db: Session, principal: Principal, habit_id: int, day: date) -> Log:
    get_habit(db, principal.user, habit_id)
    log = db.get(Log, (habit_id, day))
    if log is None:
        raise NotFound(f"no log for habit {habit_id} on {day}")
    return log


def delete_log(db: Session, principal: Principal, habit_id: int, day: date) -> None:
    get_habit(db, principal.user, habit_id)
    log = db.get(Log, (habit_id, day))
    if log is None:
        raise NotFound(f"no log for habit {habit_id} on {day}")
    db.delete(log)
    db.commit()
    notify_changed(db, principal.user.id)
