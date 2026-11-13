from datetime import date, datetime, time

from sqlalchemy import (
    JSON,
    Boolean,
    Date,
    ForeignKey,
    Integer,
    String,
    Text,
    Time,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base, UTCDateTime


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(320), unique=True)
    display_name: Mapped[str] = mapped_column(String(120))
    password_hash: Mapped[str | None] = mapped_column(String(255))
    timezone: Mapped[str] = mapped_column(String(64))
    day_cutoff: Mapped[time] = mapped_column(Time, default=time(0, 0))
    role: Mapped[str] = mapped_column(String(16), default="user")
    created_at: Mapped[datetime] = mapped_column(UTCDateTime)
    disabled: Mapped[bool] = mapped_column(Boolean, default=False)


class Habit(Base):
    __tablename__ = "habits"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    name: Mapped[str] = mapped_column(String(120))
    kind: Mapped[str] = mapped_column(String(8), default="build", server_default="build")
    color: Mapped[str | None] = mapped_column(String(16))
    icon: Mapped[str | None] = mapped_column(String(64))
    priority: Mapped[int] = mapped_column(Integer, default=0)
    start_date: Mapped[date] = mapped_column(Date)
    end_date: Mapped[date | None] = mapped_column(Date)
    stats_start_date: Mapped[date | None] = mapped_column(Date)
    archived: Mapped[bool] = mapped_column(Boolean, default=False)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime)

    schedules: Mapped[list[HabitSchedule]] = relationship(
        order_by="HabitSchedule.effective_from", cascade="all, delete-orphan", lazy="selectin"
    )


class HabitSchedule(Base):
    __tablename__ = "habit_schedules"
    __table_args__ = (UniqueConstraint("habit_id", "effective_from"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    habit_id: Mapped[int] = mapped_column(ForeignKey("habits.id"), index=True)
    effective_from: Mapped[date] = mapped_column(Date)
    schedule_type: Mapped[str] = mapped_column(String(32))
    times_per_day: Mapped[int] = mapped_column(Integer, default=1)
    weekdays: Mapped[int | None] = mapped_column(Integer)
    period_unit: Mapped[str | None] = mapped_column(String(8))
    period_target: Mapped[int | None] = mapped_column(Integer)


class Log(Base):
    __tablename__ = "logs"

    habit_id: Mapped[int] = mapped_column(ForeignKey("habits.id"), primary_key=True)
    date: Mapped[date] = mapped_column(Date, primary_key=True)
    done_count: Mapped[int] = mapped_column(Integer, default=0)
    skipped: Mapped[bool] = mapped_column(Boolean, default=False)
    note: Mapped[str | None] = mapped_column(Text)
    source: Mapped[str | None] = mapped_column(String(64))
    updated_at: Mapped[datetime] = mapped_column(UTCDateTime)


class Reminder(Base):
    __tablename__ = "reminders"

    id: Mapped[int] = mapped_column(primary_key=True)
    habit_id: Mapped[int] = mapped_column(ForeignKey("habits.id"), index=True)
    time_local: Mapped[time] = mapped_column(Time)
    weekdays: Mapped[int | None] = mapped_column(Integer)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)


class NotificationLog(Base):
    __tablename__ = "notification_log"

    reminder_id: Mapped[int] = mapped_column(
        ForeignKey("reminders.id", ondelete="CASCADE"), primary_key=True
    )
    date: Mapped[date] = mapped_column(Date, primary_key=True)
    sent_at: Mapped[datetime] = mapped_column(UTCDateTime)
    action_used_at: Mapped[datetime | None] = mapped_column(UTCDateTime)
    snoozed_until: Mapped[datetime | None] = mapped_column(UTCDateTime)


class NotificationChannel(Base):
    __tablename__ = "notification_channels"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    type: Mapped[str] = mapped_column(String(32))
    config: Mapped[dict] = mapped_column(JSON)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)


class Webhook(Base):
    __tablename__ = "webhooks"
    __table_args__ = (UniqueConstraint("user_id", "url"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    url: Mapped[str] = mapped_column(String(2048))
    created_at: Mapped[datetime] = mapped_column(UTCDateTime)


class ApiToken(Base):
    __tablename__ = "api_tokens"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    name: Mapped[str] = mapped_column(String(64))
    token_hash: Mapped[str] = mapped_column(String(64), unique=True)
    scopes: Mapped[str] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(UTCDateTime)
    last_used: Mapped[datetime | None] = mapped_column(UTCDateTime)
    revoked_at: Mapped[datetime | None] = mapped_column(UTCDateTime)


class WebSession(Base):
    __tablename__ = "sessions"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    expires_at: Mapped[datetime] = mapped_column(UTCDateTime)


class OAuthClient(Base):
    __tablename__ = "oauth_clients"

    client_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    info: Mapped[dict] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime)


class OAuthGrant(Base):
    """An /authorize request waiting for the user to log in, then its single-use code."""

    __tablename__ = "oauth_grants"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    client_id: Mapped[str] = mapped_column(
        ForeignKey("oauth_clients.client_id", ondelete="CASCADE")
    )
    params: Mapped[dict] = mapped_column(JSON)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    code_hash: Mapped[str | None] = mapped_column(String(64), unique=True)
    expires_at: Mapped[datetime] = mapped_column(UTCDateTime)
