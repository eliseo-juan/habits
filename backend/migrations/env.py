import os
from logging.config import fileConfig
from pathlib import Path

from alembic import context
from sqlalchemy.engine import make_url

from app import models  # noqa: F401  (registers the tables)
from app.db import Base, make_engine

config = context.config
if config.config_file_name:
    fileConfig(config.config_file_name)

url = config.get_main_option("sqlalchemy.url") or os.environ.get(
    "HABITS_DATABASE_URL", "sqlite:///./data/habits.db"
)
database = make_url(url).database
if url.startswith("sqlite") and database and database != ":memory:":
    Path(database).parent.mkdir(parents=True, exist_ok=True)

with make_engine(url).connect() as connection:
    context.configure(
        connection=connection,
        target_metadata=Base.metadata,
        render_as_batch=url.startswith("sqlite"),
    )
    with context.begin_transaction():
        context.run_migrations()
