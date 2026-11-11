import io
from datetime import UTC, datetime, timedelta

from alembic import command
from alembic.autogenerate import compare_metadata
from alembic.config import Config
from alembic.migration import MigrationContext
from fastapi.testclient import TestClient
from sqlalchemy import inspect

from app import cli
from app.backup import KEEP, backup_sqlite
from app.config import get_settings
from app.db import Base, make_engine
from app.main import create_app


def test_migrations_build_the_models_schema(tmp_path, monkeypatch):
    url = f"sqlite:///{tmp_path / 'nested' / 'habits.db'}"
    monkeypatch.setenv("HABITS_DATABASE_URL", url)
    command.upgrade(Config("alembic.ini"), "head")
    engine = make_engine(url)
    with engine.connect() as connection:
        assert compare_metadata(MigrationContext.configure(connection), Base.metadata) == []
    assert "alembic_version" in inspect(engine).get_table_names()


def test_backup_keeps_one_copy_per_day_and_the_newest(tmp_path, db_url, alice):
    backups = tmp_path / "backups"
    start = datetime(2026, 11, 1, tzinfo=UTC)
    first = backup_sqlite(db_url, str(backups), start)
    assert first is not None and first.stat().st_size > 0
    assert backup_sqlite(db_url, str(backups), start) is None
    for offset in range(1, KEEP + 3):
        backup_sqlite(db_url, str(backups), start + timedelta(days=offset))
    kept = sorted(p.name for p in backups.glob("habits-*.db"))
    assert len(kept) == KEEP
    assert kept[-1] == f"habits-{start + timedelta(days=KEEP + 2):%Y-%m-%d}.db"


def test_backup_ignores_other_databases(tmp_path):
    assert backup_sqlite("postgresql://u@h/db", str(tmp_path), datetime.now(UTC)) is None


def test_cli_creates_user_and_token(db, monkeypatch, capsys, client):
    monkeypatch.setattr("sys.stdin", io.StringIO("a-password\n"))
    assert cli.main(["create-user", "Carol@Example.com", "--password-stdin"]) == 0
    assert (
        cli.main(["create-token", "carol@example.com", "--name", "awtrix", "--scope", "read"]) == 0
    )
    token = capsys.readouterr().out.strip().splitlines()[-1]
    assert (
        client.get("/awtrix/today", headers={"Authorization": f"Bearer {token}"}).status_code == 200
    )
    assert cli.main(["create-token", "nobody@example.com", "--name", "x", "--scope", "read"]) == 1
    monkeypatch.setattr("sys.stdin", io.StringIO("again\n"))
    assert cli.main(["create-user", "carol@example.com", "--password-stdin"]) == 1
    response = client.post(
        "/auth/login", json={"email": "carol@example.com", "password": "a-password"}
    )
    assert response.status_code == 200


def test_cli_sets_the_password_of_an_existing_account(db, monkeypatch, client):
    monkeypatch.setattr("sys.stdin", io.StringIO("\n"))
    assert cli.main(["create-user", "dave@example.com", "--password-stdin"]) == 0
    monkeypatch.setattr("sys.stdin", io.StringIO("\n"))
    assert cli.main(["set-password", "dave@example.com", "--password-stdin"]) == 1
    monkeypatch.setattr("sys.stdin", io.StringIO("new-password\n"))
    assert cli.main(["set-password", "nobody@example.com", "--password-stdin"]) == 1
    monkeypatch.setattr("sys.stdin", io.StringIO("new-password\n"))
    assert cli.main(["set-password", "Dave@Example.com", "--password-stdin"]) == 0
    response = client.post(
        "/auth/login", json={"email": "dave@example.com", "password": "new-password"}
    )
    assert response.status_code == 200


def test_serves_the_web_app_without_hiding_the_api(db, clock, tmp_path, monkeypatch):
    (tmp_path / "index.html").write_text("<title>Hábitos</title>")
    monkeypatch.setenv("HABITS_WEB_DIR", str(tmp_path))
    get_settings.cache_clear()
    with TestClient(create_app()) as client:
        assert "Hábitos" in client.get("/").text
        assert client.get("/health").json() == {"status": "ok"}
        assert client.get("/today").status_code == 401
        assert client.get("/missing.js").status_code == 404
