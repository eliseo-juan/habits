import sqlite3
from contextlib import closing
from datetime import datetime
from pathlib import Path

from sqlalchemy.engine import make_url

KEEP = 14


def backup_sqlite(database_url: str, backup_dir: str, now: datetime) -> Path | None:
    """Consistent online copy through SQLite's backup API; one file per day, the newest KEEP kept."""
    url = make_url(database_url)
    if url.get_backend_name() != "sqlite" or not url.database:
        return None
    target_dir = Path(backup_dir)
    target_dir.mkdir(parents=True, exist_ok=True)
    target = target_dir / f"habits-{now:%Y-%m-%d}.db"
    if target.exists():
        return None
    with closing(sqlite3.connect(url.database)) as source, closing(sqlite3.connect(target)) as copy:
        source.backup(copy)
    for old in sorted(target_dir.glob("habits-*.db"))[:-KEEP]:
        old.unlink()
    return target
