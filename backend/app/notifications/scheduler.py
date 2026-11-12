import logging
from collections.abc import Callable
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models import Habit, NotificationChannel, NotificationLog, Reminder, User
from app.notifications.actions import action_token
from app.notifications.expo import DeviceNotRegistered, send_expo
from app.notifications.ntfy import Notification, send_ntfy
from app.services import rules
from app.services.habits import timelines

log = logging.getLogger(__name__)

GRACE = timedelta(minutes=10)
Sender = Callable[[dict, Notification], None]
SENDERS: dict[str, Sender] = {"ntfy": send_ntfy, "expo": send_expo}


@dataclass(frozen=True)
class DueReminder:
    reminder: Reminder
    habit: Habit
    user: User
    day: date


def due_reminders(db: Session, now: datetime) -> list[DueReminder]:
    rows = db.execute(
        select(Reminder, Habit, User)
        .join(Habit, Reminder.habit_id == Habit.id)
        .join(User, Habit.user_id == User.id)
        .where(Reminder.enabled.is_(True), Habit.archived.is_(False), User.disabled.is_(False))
    ).all()
    due = []
    for reminder, habit, user in rows:
        zone = ZoneInfo(user.timezone)
        fire_at = datetime.combine(now.astimezone(zone).date(), reminder.time_local, tzinfo=zone)
        if not fire_at <= now < fire_at + GRACE:
            continue
        day = rules.logical_date(now, user.timezone, user.day_cutoff)
        if reminder.weekdays is not None and not reminder.weekdays & (1 << day.weekday()):
            continue
        if db.get(NotificationLog, (reminder.id, day)) is not None:
            continue
        if habit.kind == "limit":
            continue
        entry = rules.today_entry(timelines(db, [habit])[habit.id], day)
        if entry.due and entry.status is rules.DayStatus.PENDING:
            due.append(DueReminder(reminder, habit, user, day))
    return due


def _claim(db: Session, reminder_id: int, day: date, now: datetime) -> bool:
    db.add(NotificationLog(reminder_id=reminder_id, date=day, sent_at=now))
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        return False
    return True


def send_due_reminders(
    db: Session, now: datetime, secret_key: str, public_url: str, sender: Sender | None = None
) -> int:
    """Sends each due reminder at most once per day; a claim is released only if every channel failed."""
    sent = 0
    for item in due_reminders(db, now):
        channels = list(
            db.scalars(
                select(NotificationChannel).where(
                    NotificationChannel.user_id == item.user.id,
                    NotificationChannel.enabled.is_(True),
                )
            )
        )
        if not channels or not _claim(db, item.reminder.id, item.day, now):
            continue
        token = action_token(secret_key, item.reminder.id, item.day)
        notification = Notification(
            title=item.habit.name,
            message="Pendiente de hoy",
            done_url=f"{public_url}/notifications/actions/{token}/done",
            habit_id=item.habit.id,
        )
        delivered = False
        for channel in channels:
            try:
                (sender or SENDERS[channel.type])(channel.config, notification)
                delivered = True
            except DeviceNotRegistered:
                log.info("reminder %s: dropping dead push device %s", item.reminder.id, channel.id)
                db.delete(channel)
                db.commit()
            except Exception:
                log.exception("reminder %s: channel %s failed", item.reminder.id, channel.id)
        if delivered:
            sent += 1
        else:
            db.delete(db.get(NotificationLog, (item.reminder.id, item.day)))
            db.commit()
    return sent
