from datetime import date, datetime, time
from typing import Literal, Self
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from pydantic import BaseModel, ConfigDict, Field, HttpUrl, field_validator, model_validator

from app.services.rules import DayStatus, HabitKind

Weekday = int
Weekdays = list[Weekday] | None


def _check_weekdays(days: Weekdays) -> Weekdays:
    if days is None:
        return None
    if not days or any(d < 0 or d > 6 for d in days):
        raise ValueError("weekdays must be a non-empty list of 0 (Monday) to 6 (Sunday)")
    return sorted(set(days))


class ScheduleIn(BaseModel):
    type: Literal["daily", "weekdays", "times_per_period"]
    times_per_day: int = Field(1, ge=1, le=50)
    weekdays: Weekdays = Field(
        None, description="0 = Monday … 6 = Sunday; only for type 'weekdays'"
    )
    period_unit: Literal["week", "month"] | None = None
    period_target: int | None = Field(None, ge=1, le=31)

    _weekdays = field_validator("weekdays")(_check_weekdays)

    @model_validator(mode="after")
    def _consistent(self) -> Self:
        if self.type == "weekdays" and not self.weekdays:
            raise ValueError("type 'weekdays' needs weekdays")
        if self.type != "weekdays" and self.weekdays:
            raise ValueError("weekdays only apply to type 'weekdays'")
        is_period = self.type == "times_per_period"
        if is_period != (self.period_unit is not None and self.period_target is not None):
            raise ValueError(
                "period_unit and period_target are required for, and only for, 'times_per_period'"
            )
        if self.period_unit == "week" and self.period_target and self.period_target > 7:
            raise ValueError("a week holds at most 7 days")
        return self


class ScheduleCreate(ScheduleIn):
    effective_from: date


class ScheduleOut(ScheduleIn):
    effective_from: date


class HabitCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    kind: HabitKind = Field(
        "build",
        description="'build': success is doing it. 'limit': success is not doing it; "
        "times_per_period then means at most period_target days per period",
    )
    color: str | None = Field(None, max_length=16)
    icon: str | None = Field(None, max_length=64)
    priority: int = Field(0, ge=0, le=2)
    start_date: date | None = Field(None, description="Defaults to the user's today")
    end_date: date | None = None
    stats_start_date: date | None = None
    sort_order: int = 0
    schedule: ScheduleIn

    @model_validator(mode="after")
    def _limit_counts_days(self) -> Self:
        if self.kind == "limit" and self.schedule.times_per_day != 1:
            raise ValueError("limit habits count days, so times_per_day must be 1")
        return self


class HabitUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=120)
    color: str | None = Field(None, max_length=16)
    icon: str | None = Field(None, max_length=64)
    priority: int | None = Field(None, ge=0, le=2)
    start_date: date | None = None
    end_date: date | None = None
    stats_start_date: date | None = None
    sort_order: int | None = None
    archived: bool | None = None


class HabitOut(BaseModel):
    id: int
    name: str
    kind: HabitKind
    color: str | None
    icon: str | None
    priority: int
    start_date: date
    end_date: date | None
    stats_start_date: date | None
    archived: bool
    sort_order: int
    schedule: ScheduleOut
    schedules: list[ScheduleOut]


class LogPut(BaseModel):
    done_count: int = Field(0, ge=0, le=100)
    skipped: bool = False
    note: str | None = Field(None, max_length=2000)


class LogDone(BaseModel):
    count: int = Field(1, ge=1, le=100)


class LogOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    habit_id: int
    date: date
    done_count: int
    skipped: bool
    note: str | None
    source: str | None
    updated_at: datetime


class ReminderIn(BaseModel):
    time_local: time
    weekdays: Weekdays = None
    enabled: bool = True

    _weekdays = field_validator("weekdays")(_check_weekdays)


class ReminderUpdate(BaseModel):
    time_local: time | None = None
    weekdays: Weekdays = None
    enabled: bool | None = None

    _weekdays = field_validator("weekdays")(_check_weekdays)


class ReminderOut(BaseModel):
    id: int
    habit_id: int
    time_local: time
    weekdays: Weekdays
    enabled: bool


class NtfyConfig(BaseModel):
    server: HttpUrl = HttpUrl("https://ntfy.sh")
    topic: str = Field(min_length=1, max_length=64, pattern=r"^[A-Za-z0-9_-]+$")
    access_token: str | None = None


class ChannelIn(BaseModel):
    type: Literal["ntfy"] = "ntfy"
    config: NtfyConfig
    enabled: bool = True


class ChannelUpdate(BaseModel):
    config: NtfyConfig | None = None
    enabled: bool | None = None


class ChannelOut(BaseModel):
    id: int
    type: str
    server: str
    topic: str
    has_access_token: bool
    enabled: bool


class WebhookIn(BaseModel):
    url: HttpUrl


class WebhookOut(BaseModel):
    id: int
    url: str
    created_at: datetime


class LoginIn(BaseModel):
    email: str
    password: str


class TokenCreate(BaseModel):
    name: str = Field(min_length=1, max_length=64)
    scope: Literal["read", "write"]


class TokenOut(BaseModel):
    id: int
    name: str
    scope: Literal["read", "write"]
    created_at: datetime
    last_used: datetime | None


class TokenCreated(TokenOut):
    token: str = Field(description="Shown only once")


class MeOut(BaseModel):
    id: int
    email: str
    display_name: str
    timezone: str
    day_cutoff: time
    role: str


class MeUpdate(BaseModel):
    display_name: str | None = Field(None, min_length=1, max_length=120)
    timezone: str | None = None
    day_cutoff: time | None = None

    @field_validator("timezone")
    @classmethod
    def _known_timezone(cls, value: str | None) -> str | None:
        if value is None:
            return None
        try:
            ZoneInfo(value)
        except (ZoneInfoNotFoundError, ValueError) as error:
            raise ValueError(f"unknown timezone {value!r}") from error
        return value


class TodayItem(BaseModel):
    habit_id: int
    name: str
    kind: HabitKind
    color: str | None
    icon: str | None
    priority: int
    status: DayStatus
    done_count: int
    times_per_day: int
    period_done: int | None
    period_target: int | None


class TodayOut(BaseModel):
    date: date
    items: list[TodayItem]


class HabitMonth(BaseModel):
    habit_id: int
    name: str
    percentage: float | None
    days: dict[date, DayStatus]


class MonthOut(BaseModel):
    month: str
    habits: list[HabitMonth]


class MonthPercentage(BaseModel):
    month: str
    percentage: float | None


class HabitYear(BaseModel):
    habit_id: int
    name: str
    percentage: float | None
    months: list[MonthPercentage]
    days: dict[date, DayStatus]


class YearOut(BaseModel):
    year: int
    habits: list[HabitYear]


class HabitStatsOut(BaseModel):
    habit_id: int
    from_date: date
    to_date: date
    done: int
    failed: int
    skipped: int
    percentage: float | None
    current_streak: int
    best_streak: int


class AwtrixHabit(BaseModel):
    id: int
    name: str
    icon: str | None
    color: str | None


class AwtrixStreak(BaseModel):
    name: str
    streak: int


class AwtrixOut(BaseModel):
    date: date
    pending: int
    done: int
    total: int
    pending_habits: list[AwtrixHabit]
    done_habits: list[AwtrixHabit]
    top_streaks: list[AwtrixStreak]


class ErrorOut(BaseModel):
    code: str
    message: str
