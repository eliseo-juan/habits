#!/bin/sh
set -e

if [ "$#" -gt 0 ]; then
    exec habits "$@"
fi

alembic upgrade head
exec uvicorn app.main:app --host 0.0.0.0 --port 8000 --proxy-headers --forwarded-allow-ips "${HABITS_FORWARDED_ALLOW_IPS:-*}"
