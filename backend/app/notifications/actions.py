"""Signed, single-use links for the notification's buttons (done, skip, snooze), so they never carry a personal token."""

import hashlib
import hmac
from datetime import date, datetime, timedelta

from sqlalchemy.orm import Session

from app.auth.security import Principal
from app.errors import NotFound
from app.models import Habit, NotificationLog, Reminder, User
from app.schemas import LogPut
from app.services.logs import add_done, set_log


def _signature(secret_key: str, reminder_id: int, day: date) -> str:
    message = f"action:{reminder_id}:{day.isoformat()}".encode()
    return hmac.new(secret_key.encode(), message, hashlib.sha256).hexdigest()[:32]


def action_token(secret_key: str, reminder_id: int, day: date) -> str:
    return f"{reminder_id}.{day.isoformat()}.{_signature(secret_key, reminder_id, day)}"


SNOOZE = timedelta(hours=1)


def use_action_token(
    db: Session, secret_key: str, token: str, now: datetime, action: str = "done"
) -> None:
    """One token covers the buttons of a notification; the first one tapped uses it up."""
    invalid = NotFound("unknown or used action link")
    try:
        raw_id, raw_day, signature = token.split(".")
        reminder_id, day = int(raw_id), date.fromisoformat(raw_day)
    except ValueError:
        raise invalid from None
    if not hmac.compare_digest(signature, _signature(secret_key, reminder_id, day)):
        raise invalid
    sent = db.get(NotificationLog, (reminder_id, day))
    reminder = db.get(Reminder, reminder_id)
    if sent is None or sent.action_used_at is not None or reminder is None:
        raise invalid
    habit = db.get(Habit, reminder.habit_id)
    user = db.get(User, habit.user_id) if habit else None
    if habit is None or user is None or user.disabled:
        raise invalid
    sent.action_used_at = now
    principal = Principal(user=user, can_write=True, source="notification")
    if action == "snooze":
        sent.snoozed_until = now + SNOOZE
        db.commit()
    elif action == "skip":
        db.flush()
        set_log(db, principal, habit.id, day, LogPut(skipped=True), now)
    else:
        db.flush()
        add_done(db, principal, habit.id, day, 1, now)
