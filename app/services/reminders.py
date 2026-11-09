from sqlalchemy import select
from sqlalchemy.orm import Session

from app.errors import NotFound
from app.models import Habit, NotificationChannel, Reminder, User
from app.schemas import (
    ChannelIn,
    ChannelOut,
    ChannelUpdate,
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


def channel_out(channel: NotificationChannel) -> ChannelOut:
    return ChannelOut(
        id=channel.id,
        type=channel.type,
        server=channel.config["server"],
        topic=channel.config["topic"],
        has_access_token=bool(channel.config.get("access_token")),
        enabled=channel.enabled,
    )


def get_channel(db: Session, user: User, channel_id: int) -> NotificationChannel:
    channel = db.get(NotificationChannel, channel_id)
    if channel is None or channel.user_id != user.id:
        raise NotFound(f"channel {channel_id} not found")
    return channel


def list_channels(db: Session, user: User) -> list[NotificationChannel]:
    return list(
        db.scalars(select(NotificationChannel).where(NotificationChannel.user_id == user.id))
    )


def create_channel(db: Session, user: User, data: ChannelIn) -> NotificationChannel:
    channel = NotificationChannel(
        user_id=user.id,
        type=data.type,
        config=data.config.model_dump(mode="json"),
        enabled=data.enabled,
    )
    db.add(channel)
    db.commit()
    return channel


def update_channel(
    db: Session, user: User, channel_id: int, data: ChannelUpdate
) -> NotificationChannel:
    channel = get_channel(db, user, channel_id)
    if data.config is not None:
        channel.config = data.config.model_dump(mode="json")
    if data.enabled is not None:
        channel.enabled = data.enabled
    db.commit()
    return channel


def delete_channel(db: Session, user: User, channel_id: int) -> None:
    db.delete(get_channel(db, user, channel_id))
    db.commit()
