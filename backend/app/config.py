import os
from dataclasses import dataclass
from functools import cache


@dataclass(frozen=True)
class Settings:
    database_url: str
    secret_key: str
    default_timezone: str
    public_url: str
    backup_dir: str
    scheduler_enabled: bool
    cookie_secure: bool
    web_dir: str | None


def _flag(name: str, default: bool) -> bool:
    return os.environ.get(name, str(default)).lower() in {"1", "true", "yes"}


@cache
def get_settings() -> Settings:
    secret_key = os.environ.get("HABITS_SECRET_KEY")
    if not secret_key:
        raise RuntimeError("HABITS_SECRET_KEY must be set")
    return Settings(
        database_url=os.environ.get("HABITS_DATABASE_URL", "sqlite:///./data/habits.db"),
        secret_key=secret_key,
        default_timezone=os.environ.get("HABITS_DEFAULT_TIMEZONE", "Europe/Madrid"),
        public_url=os.environ.get("HABITS_PUBLIC_URL", "http://localhost:8000").rstrip("/"),
        backup_dir=os.environ.get("HABITS_BACKUP_DIR", "./data/backups"),
        scheduler_enabled=_flag("HABITS_SCHEDULER_ENABLED", True),
        cookie_secure=_flag("HABITS_COOKIE_SECURE", True),
        web_dir=os.environ.get("HABITS_WEB_DIR") or None,
    )
