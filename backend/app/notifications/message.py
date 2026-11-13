from dataclasses import dataclass


@dataclass(frozen=True)
class Notification:
    title: str
    message: str = ""
    done_url: str | None = None
    habit_id: int | None = None
    skip_url: str | None = None
    snooze_url: str | None = None
