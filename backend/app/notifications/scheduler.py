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


@dataclass(frozen=True)
class Delivery:
    channel: NotificationChannel
    error: str | None = None


def enabled_channels(db: Session, user_id: int) -> list[NotificationChannel]:
    return list(
        db.scalars(
            select(NotificationChannel).where(
                NotificationChannel.user_id == user_id, NotificationChannel.enabled.is_(True)
            )
        )
    )


def deliver(
    db: Session,
    channels: list[NotificationChannel],
    notification: Notification,
    sender: Sender | None = None,
) -> list[Delivery]:
    """Sends to every channel and drops push devices the push service no longer knows."""
    results = []
    for channel in channels:
        try:
            (sender or SENDERS[channel.type])(channel.config, notification)
            results.append(Delivery(channel))
        except DeviceNotRegistered:
            log.info("dropping dead push device %s", channel.id)
            db.delete(channel)
            db.commit()
            results.append(Delivery(channel, "device is no longer registered and was removed"))
        except Exception as error:
            log.exception("channel %s failed", channel.id)
            results.append(Delivery(channel, str(error) or type(error).__name__))
    return results


def send_reminder(
    db: Session,
    item: DueReminder,
    now: datetime,
    secret_key: str,
    public_url: str,
    sender: Sender | None = None,
) -> list[Delivery] | None:
    """None when nothing was sent: the user has no channel or the reminder already went out that day.

    The day's claim is released only if every channel failed, so the next run retries.
    """
    channels = enabled_channels(db, item.user.id)
    if not channels or not _claim(db, item.reminder.id, item.day, now):
        return None
    token = action_token(secret_key, item.reminder.id, item.day)
    notification = Notification(
        title=item.habit.name,
        message="Pendiente de hoy",
        done_url=f"{public_url}/notifications/actions/{token}/done",
        habit_id=item.habit.id,
    )
    results = deliver(db, channels, notification, sender)
    if all(result.error for result in results):
        db.delete(db.get(NotificationLog, (item.reminder.id, item.day)))
        db.commit()
    return results


def send_due_reminders(
    db: Session, now: datetime, secret_key: str, public_url: str, sender: Sender | None = None
) -> int:
    """Sends each due reminder at most once per day."""
    sent = 0
    for item in due_reminders(db, now):
        results = send_reminder(db, item, now, secret_key, public_url, sender)
        if results and any(result.error is None for result in results):
            sent += 1
    return sent
