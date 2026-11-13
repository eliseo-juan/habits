from sqlalchemy import select
from sqlalchemy.orm import Session

from app.errors import NotFound
from app.models import Habit, NotificationChannel, Reminder, User
from app.schemas import (
    PushDeviceIn,
    ReminderIn,
    ReminderOut,
    ReminderUpdate,
)
from app.services.habits import get_habit, mask_to_weekdays, weekdays_to_mask


def reminder_out(reminder: Reminder) -> ReminderOut:
    return ReminderOut(
        id=reminder.id,
        habit_id=reminder.habit_id,
        time_local=reminder.time_local,
        weekdays=mask_to_weekdays(reminder.weekdays),
        enabled=reminder.enabled,
    )


def get_reminder(db: Session, user: User, reminder_id: int) -> Reminder:
    reminder = db.scalar(
        select(Reminder).join(Habit).where(Reminder.id == reminder_id, Habit.user_id == user.id)
    )
    if reminder is None:
        raise NotFound(f"reminder {reminder_id} not found")
    return reminder


def list_reminders(db: Session, user: User, habit_id: int) -> list[Reminder]:
    get_habit(db, user, habit_id)
    return list(
        db.scalars(
            select(Reminder).where(Reminder.habit_id == habit_id).order_by(Reminder.time_local)
        )
    )


def create_reminder(db: Session, user: User, habit_id: int, data: ReminderIn) -> Reminder:
    get_habit(db, user, habit_id)
    reminder = Reminder(
        habit_id=habit_id,
        time_local=data.time_local.replace(second=0, microsecond=0),
        weekdays=weekdays_to_mask(data.weekdays),
        enabled=data.enabled,
    )
    db.add(reminder)
    db.commit()
    return reminder


def update_reminder(db: Session, user: User, reminder_id: int, data: ReminderUpdate) -> Reminder:
    reminder = get_reminder(db, user, reminder_id)
    changes = data.model_dump(exclude_unset=True)
    if changes.get("time_local") is not None:
        reminder.time_local = changes["time_local"].replace(second=0, microsecond=0)
    if "weekdays" in changes:
        reminder.weekdays = weekdays_to_mask(changes["weekdays"])
    if changes.get("enabled") is not None:
        reminder.enabled = changes["enabled"]
    db.commit()
    return reminder


def delete_reminder(db: Session, user: User, reminder_id: int) -> None:
    db.delete(get_reminder(db, user, reminder_id))
    db.commit()


def _devices(db: Session, token: str) -> list[NotificationChannel]:
    return [
        c
        for c in db.scalars(select(NotificationChannel).where(NotificationChannel.type == "expo"))
        if c.config.get("token") == token
    ]


def register_push_device(db: Session, user: User, data: PushDeviceIn) -> None:
    """Idempotent. A token belongs to one account: signing in elsewhere on the same phone moves it."""
    mine = None
    for channel in _devices(db, data.token):
        if channel.user_id == user.id and mine is None:
            mine = channel
        else:
            db.delete(channel)
    if mine is None:
        db.add(
            NotificationChannel(
                user_id=user.id, type="expo", config={"token": data.token}, enabled=True
            )
        )
    else:
        mine.enabled = True
    db.commit()


def unregister_push_device(db: Session, user: User, token: str) -> None:
    for channel in _devices(db, token):
        if channel.user_id == user.id:
            db.delete(channel)
    db.commit()
