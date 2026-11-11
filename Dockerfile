FROM node:26-slim AS web
WORKDIR /web
COPY web/package.json web/package-lock.json ./
RUN npm ci
COPY web ./
RUN npm run build

FROM python:3.15-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    HABITS_DATABASE_URL=sqlite:////data/habits.db \
    HABITS_BACKUP_DIR=/data/backups \
    HABITS_WEB_DIR=/app/web

WORKDIR /app
COPY backend/pyproject.toml ./
COPY backend/app ./app
RUN pip install .

COPY backend/alembic.ini backend/docker-entrypoint.sh ./
COPY backend/migrations ./migrations
COPY --from=web /web/dist ./web

RUN useradd --uid 1000 --create-home habits && mkdir /data && chown habits /data
USER habits
VOLUME /data
EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/health', timeout=4)"

ENTRYPOINT ["./docker-entrypoint.sh"]
