FROM python:3.14-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    HABITS_DATABASE_URL=sqlite:////data/habits.db \
    HABITS_BACKUP_DIR=/data/backups

WORKDIR /app
COPY pyproject.toml ./
COPY app ./app
RUN pip install .

COPY alembic.ini docker-entrypoint.sh ./
COPY migrations ./migrations

RUN useradd --uid 1000 --create-home habits && mkdir /data && chown habits /data
USER habits
VOLUME /data
EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/health', timeout=4)"

ENTRYPOINT ["./docker-entrypoint.sh"]
