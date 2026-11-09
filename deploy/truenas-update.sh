#!/bin/sh
# Run from a TrueNAS cron job: redeploys the app only when :latest points to a new image.
set -eu

APP="${1:-habits}"
IMAGE="${2:-ghcr.io/eliseo-juan/habits:latest}"

before=$(docker image inspect --format '{{.Id}}' "$IMAGE" 2>/dev/null || true)
docker pull --quiet "$IMAGE" >/dev/null
after=$(docker image inspect --format '{{.Id}}' "$IMAGE")

if [ "$before" != "$after" ]; then
    midclt call -j app.redeploy "$APP" >/dev/null
    echo "$(date -Is) $APP redeployed with $after"
fi
