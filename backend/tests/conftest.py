import os
from dataclasses import dataclass
from datetime import UTC, datetime

import pytest
from fastapi.testclient import TestClient

os.environ.setdefault("HABITS_SECRET_KEY", "test-secret")
os.environ["HABITS_SCHEDULER_ENABLED"] = "false"
os.environ["HABITS_COOKIE_SECURE"] = "false"

from app import clock as clock_module
from app.auth import deps
from app.auth.security import create_api_token
from app.config import get_settings
from app.db import Base, get_sessionmaker
from app.services.users import create_user

NOW = datetime(2026, 11, 9, 10, 0, tzinfo=UTC)


class Clock:
    def __init__(self, now: datetime):
        self.now = now

    def __call__(self) -> datetime:
        return self.now


@pytest.fixture
def clock(monkeypatch) -> Clock:
    fake = Clock(NOW)
    monkeypatch.setattr(clock_module, "utcnow", fake)
    for module in ("app.mcp.server", "app.main", "app.cli", "app.admin"):
        monkeypatch.setattr(f"{module}.utcnow", fake)
    return fake


@pytest.fixture
def db_url(tmp_path, monkeypatch) -> str:
    url = f"sqlite:///{tmp_path / 'habits.db'}"
    monkeypatch.setenv("HABITS_DATABASE_URL", url)
    monkeypatch.setenv("HABITS_BACKUP_DIR", str(tmp_path / "backups"))
    get_settings.cache_clear()
    get_sessionmaker.cache_clear()
    yield url
    get_settings.cache_clear()
    get_sessionmaker.cache_clear()


@pytest.fixture
def db(db_url):
    sessions = get_sessionmaker()
    Base.metadata.create_all(sessions.kw["bind"])
    with sessions() as session:
        yield session


@dataclass
class Account:
    id: int
    email: str
    write: str
    read: str

    def auth(self, scope: str = "write") -> dict[str, str]:
        return {"Authorization": f"Bearer {self.write if scope == 'write' else self.read}"}


def make_account(db, email: str, password: str = "secret-password") -> Account:
    user = create_user(db, email, email.split("@")[0], password, "Europe/Madrid", "user", NOW)
    _, write = create_api_token(db, user, "test-write", "write", NOW)
    _, read = create_api_token(db, user, "awtrix", "read", NOW)
    db.commit()
    return Account(user.id, email, write, read)


@pytest.fixture
def client(db, clock):
    from app.main import create_app

    app = create_app()
    app.dependency_overrides[deps.utcnow] = clock
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture
def alice(db) -> Account:
    return make_account(db, "alice@example.com")


@pytest.fixture
def bob(db) -> Account:
    return make_account(db, "bob@example.com")
