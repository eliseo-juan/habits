import io
from datetime import UTC, datetime, timedelta

from alembic import command
from alembic.autogenerate import compare_metadata
from alembic.config import Config
from alembic.migration import MigrationContext
from sqlalchemy import inspect

from app import cli
from app.backup import KEEP, backup_sqlite
from app.db import Base, make_engine


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
