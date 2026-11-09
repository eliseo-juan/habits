# Habits

Personal habit tracker backend: REST API, remote MCP server, a summary endpoint for an AWTRIX clock, and ntfy reminders. FastAPI + SQLite (SQLAlchemy and Alembic keep it portable to Postgres).

## Run locally

```sh
python3.14 -m venv .venv
.venv/bin/pip install -e ".[dev]"
export HABITS_SECRET_KEY=dev-secret HABITS_COOKIE_SECURE=false
.venv/bin/alembic upgrade head
.venv/bin/habits create-user me@example.com
.venv/bin/habits create-token me@example.com --name cli --scope write
.venv/bin/uvicorn app.main:app --reload
.venv/bin/pytest -q
```

OpenAPI docs are served at `/docs`.

## Configuration

| Variable | Default | |
|---|---|---|
| `HABITS_SECRET_KEY` | required | Signs the notification action links. Long and random. |
| `HABITS_DATABASE_URL` | `sqlite:///./data/habits.db` (`/data/habits.db` in the image) | |
| `HABITS_PUBLIC_URL` | `http://localhost:8000` | Base of the "done" link in reminders. |
| `HABITS_DEFAULT_TIMEZONE` | `Europe/Madrid` | For users created without `--timezone`. |
| `HABITS_BACKUP_DIR` | `./data/backups` (`/data/backups` in the image) | Daily SQLite copy, 14 kept. |
| `HABITS_SCHEDULER_ENABLED` | `true` | Reminders and backups loop. Run a single replica. |
| `HABITS_COOKIE_SECURE` | `true` | Set `false` only for plain-HTTP local dev. |
| `HABITS_FORWARDED_ALLOW_IPS` | `*` | Proxies trusted for `X-Forwarded-*` (image only). |

## Accounts and tokens

There is no sign-up. Accounts and the first tokens are made with the CLI, which the image runs when given arguments:

```sh
docker exec -it habits ./docker-entrypoint.sh create-user me@example.com --admin
docker exec habits ./docker-entrypoint.sh create-token me@example.com --name awtrix --scope read
docker exec habits ./docker-entrypoint.sh create-token me@example.com --name claude --scope write
```

Tokens are shown once and stored hashed. The token name is recorded as the `source` of every mark it makes. A logged-in web session (`POST /auth/login`) can also list, create and revoke tokens through `/tokens`; API tokens cannot mint other tokens.

## Rules

- A day is the user's logical day: their timezone, rolled over at `day_cutoff` (default 00:00).
- Weeks start on Monday; months are calendar months.
- Schedules are versioned by `effective_from`, so changing frequency never rewrites the past.
- Failures are computed, never stored. Skipped days count neither for nor against. Today is `pending` until it ends.
- `times_per_period` counts days completed in the week or month; a period is credited to the stats range holding its last day.
- Another user's resources answer 404.

## MCP

Streamable HTTP at `https://habits.lab.eliseo.tech/mcp`, stateless, JSON responses (no SSE, so nothing to tune for proxy buffering). Authenticate with `Authorization: Bearer <token>`; a read token can only use the read tools.

```sh
claude mcp add --transport http habits https://habits.lab.eliseo.tech/mcp --header "Authorization: Bearer hab_..."
```

## AWTRIX

`GET /awtrix/today` with a read token returns a neutral summary (pending, done, total, pending habits, top streaks) for a script on the clock to render.

## Reminders

Add an ntfy channel (`POST /channels` with `{"config": {"topic": "...", "server": "https://ntfy.sh", "access_token": null}}`) and reminders per habit (`POST /habits/{id}/reminders` with `{"time_local": "08:30", "weekdays": [0, 2, 4]}`). Within ten minutes of the local time, a habit still pending that day gets one notification with a "Hecho" button. The button calls a signed, single-use link, so the notification never carries a personal token. If every channel fails, the next minute retries.

## Deploy: TrueNAS + Nginx Proxy Manager

Every push to `main` runs the tests and publishes `ghcr.io/eliseo-juan/habits:latest` plus a `sha-…` tag (and `X.Y.Z` for `v*` tags). The package is private by default: either make it public in GitHub, or log TrueNAS in to GHCR with a token that has `read:packages`.

TrueNAS 25.10, Apps → Discover → Custom App → Install via YAML:

```yaml
services:
  habits:
    image: ghcr.io/eliseo-juan/habits:latest
    restart: unless-stopped
    ports:
      - "8000:8000"
    user: "568:568"
    environment:
      HABITS_SECRET_KEY: "<long random value>"
      HABITS_PUBLIC_URL: https://habits.lab.eliseo.tech
    volumes:
      - /mnt/<pool>/apps/habits:/data
```

`568` is TrueNAS's `apps` user; the dataset must be writable by it. Migrations run on every start.

Nginx Proxy Manager: proxy host `habits.lab.eliseo.tech` → `http://<truenas-ip>:8000`, with SSL forced and HTTP/2 on. No custom locations needed.

### Updates

The NAS isn't reachable from GitHub, so it pulls: copy `deploy/truenas-update.sh` to the dataset and add a cron job (System → Advanced Settings → Cron Jobs, user `root`, every 15 minutes):

```sh
sh /mnt/<pool>/apps/habits/truenas-update.sh habits
```

It redeploys the app only when `:latest` moved, so a merge to `main` is live within about 15 minutes. If the GHCR package is private, run `docker login ghcr.io` once as root with a token that has `read:packages`.
