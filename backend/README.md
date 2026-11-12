# SmartHabits server

The FastAPI server behind every SmartHabits client. It owns the data and the rules, and serves:

- the REST API (OpenAPI docs at `/docs`) used by the web app, the mobile app and Home Assistant;
- a remote MCP server at `/mcp` for Claude;
- reminder delivery through native push (Expo push service) or ntfy, and webhooks that tell subscribers something changed;
- `GET /awtrix/today`, a compact summary for the AWTRIX clock;
- the built web app at `/`, when `HABITS_WEB_DIR` points at it.

Python 3.14, FastAPI, SQLAlchemy and Alembic on SQLite (kept portable to Postgres).

## Run it

From this folder:

```sh
python3.14 -m venv .venv
.venv/bin/pip install -e ".[dev]"
export HABITS_SECRET_KEY=dev-secret HABITS_COOKIE_SECURE=false
.venv/bin/alembic upgrade head
.venv/bin/habits create-user me@example.com --admin
.venv/bin/habits set-password me@example.com
.venv/bin/uvicorn app.main:app --reload
```

The API is at http://localhost:8000 and the database at `./data/habits.db`. To use the web app against it, run `npm run dev` in [`web/`](../web/README.md).

Checks (CI runs the same, see the root `AGENTS.md`):

```sh
.venv/bin/ruff check . && .venv/bin/ruff format --check .
.venv/bin/pytest -q
.venv/bin/alembic check   # models and migrations agree
```

## How it works

```
app/
  api/            REST routes: thin adapters over services
  mcp/server.py   MCP tools: thin adapters over the same services
  services/       business logic; rules.py is pure (no DB, no clock)
  auth/           passwords, sessions, API tokens, OAuth for MCP
  notifications/  push and ntfy delivery, signed "done" links, the scheduler loop
  models.py       SQLAlchemy models
  cli.py          the `habits` command
migrations/       Alembic
tests/            pytest
```

The REST API and the MCP tools call the same services, so they always agree. A background loop in the same process sends due reminders and makes the daily backup; run a single replica.

### Rules

- A day is the user's logical day: their timezone, rolled over at `day_cutoff` (default 00:00).
- Weeks start on Monday; months are calendar months.
- Schedules are `daily`, `weekdays` or `times_per_period` (per week or month), with `times_per_day` for repeats. They are versioned by `effective_from`, so changing frequency never rewrites the past.
- Failures are computed, never stored. Skipped days count neither for nor against. Today is `pending` until it ends.
- `times_per_period` counts days completed in the week or month; a period is credited to the stats range holding its last day.
- A habit's `kind` is `build` (success is doing it) or `limit` (success is not doing it), fixed at creation. On a limit habit a logged day is a slip: `daily` means never, `weekdays` never on those days, and `times_per_period` at most `period_target` slip days per week or month. A period fails as soon as it goes over; slips within the allowance show as `slipped`. Limit habits are never reminded and never count as to-do on the clock or in Home Assistant.
- Another user's resources answer 404.

### Accounts and tokens

There is no sign-up: accounts are created with the CLI. Every client authenticates in one of three ways:

| Client | How | Can |
|---|---|---|
| Web app | `POST /auth/login` (email, password) → host-only session cookie | Everything, including managing tokens |
| Mobile app | `POST /auth/token` (email, password, `device_name`) → device token | Everything, including managing tokens; `POST /auth/logout` revokes it |
| Integrations, scripts | `habits create-token` or `/tokens` → API token, `read` or `write` | Read, or read and write; cannot mint tokens |

Tokens are shown once and stored hashed. A token's name is recorded as the `source` of every mark it makes. Five wrong passwords for the same email block logins for that email for 15 minutes.

### CLI

```sh
habits create-user me@example.com [--admin] [--timezone Europe/Madrid]
habits set-password me@example.com
habits create-token me@example.com --name awtrix --scope read
habits create-oauth-client <name> --redirect-uri <uri> [--redirect-uri <uri> …]
habits backup
```

In the Docker image, pass the same arguments to the entrypoint: `docker compose exec habits ./docker-entrypoint.sh create-user …`.

### MCP

Streamable HTTP at `<HABITS_PUBLIC_URL>/mcp`, stateless, JSON responses (no SSE, so nothing to tune for proxy buffering). Tools: `list_habits`, `today`, `mark_done`, `set_day`, `skip`, `clear_day`, `create_habit`, `update_habit`, `change_schedule`, `month_stats`, `year_stats`, `habit_stats`. A read token can only use the read tools.

**claude.ai, Claude Desktop and the Claude mobile apps** use OAuth. Clients are registered from the terminal only; the public `/register` endpoint is off, so nobody else can create a client that sends codes to their own site.

```sh
habits create-oauth-client Claude --redirect-uri https://claude.ai/api/mcp/auth_callback --redirect-uri https://claude.com/api/mcp/auth_callback
```

It prints a client ID. In Claude: Settings → Connectors → Add custom connector, URL `<HABITS_PUBLIC_URL>/mcp`, Advanced settings → OAuth Client ID = that ID, no secret (PKCE). Claude opens the server's login page and gets an API token named after the client, listed and revocable under `/tokens`. claude.ai connects from Anthropic's servers, so the server must be reachable from the internet; see [Exposing it](#exposing-it).

**Claude Code** with an API token, or with OAuth through a client registered for a fixed loopback port:

```sh
claude mcp add --transport http habits https://habits.example.com/mcp --header "Authorization: Bearer hab_..."

habits create-oauth-client "Claude Code" --redirect-uri http://localhost:3118/callback
claude mcp add --transport http --scope user --client-id <id> --callback-port 3118 habits https://habits.example.com/mcp
```

Redirect URIs must be https or a loopback address, and `/authorize` only accepts the exact ones registered.

### Reminders

Reminders are stored per habit. Delivery goes to every enabled channel of the user: native push devices (the mobile app registers its token) and/or ntfy topics:

```sh
PUT  /push-devices             {"token": "ExponentPushToken[...]"}   # POST /push-devices/unregister removes it
POST /channels                 {"config": {"topic": "...", "server": "https://ntfy.sh", "access_token": null}}
POST /habits/{id}/reminders    {"time_local": "08:30", "weekdays": [0, 2, 4]}
```

Within ten minutes of the local time, a habit still pending that day gets one notification (ntfy ones carry a "done" button). The button calls a signed, single-use link, so the notification never carries a token. If every channel fails, the next minute retries.

### Webhooks

`POST /webhooks` with `{"url": "..."}` and a write token subscribes a URL; posting the same URL again returns the existing subscription. Whenever the account's habits or logs change, every subscribed URL gets an empty `POST`, sent in the background with a 5-second timeout and no retries, so subscribers should also poll. The request carries no data: subscribers fetch what they need with their own token. `GET /webhooks` lists them and `DELETE /webhooks/{id}` removes one; ten per account at most.

### AWTRIX summary

`GET /awtrix/today` with a read token returns pending, done and total counts, the pending and done habits with their color and icon, and the top streaks, for the [clock script](../awtrix/README.md) to draw.

## Configuration

| Variable | Default | |
|---|---|---|
| `HABITS_SECRET_KEY` | required | Signs the reminder action links. Long and random. |
| `HABITS_DATABASE_URL` | `sqlite:///./data/habits.db` (`/data/habits.db` in the image) | |
| `HABITS_PUBLIC_URL` | `http://localhost:8000` | Public HTTPS address: base of the reminder links and OAuth issuer for MCP. |
| `HABITS_DEFAULT_TIMEZONE` | `Europe/Madrid` | For users created without `--timezone`. |
| `HABITS_BACKUP_DIR` | `./data/backups` (`/data/backups` in the image) | Daily SQLite copy, 14 kept. |
| `HABITS_SCHEDULER_ENABLED` | `true` | Reminders and backups loop. Run a single replica. |
| `HABITS_COOKIE_SECURE` | `true` | Set `false` only for plain-HTTP local dev. |
| `HABITS_WEB_DIR` | unset (`/app/web` in the image) | Built web app served at `/`. API routes take precedence. |
| `HABITS_FORWARDED_ALLOW_IPS` | `*` | Proxies trusted for `X-Forwarded-*` (image only). |

## Deploy

Every push to `main` that changes the image (`backend/`, `web/`, `Dockerfile`) publishes `ghcr.io/eliseo-juan/habits:latest` plus a `sha-…` tag (and `X.Y.Z` for `v*` tags). The image bundles the server and the built web app. The root `docker-compose.yml` runs it with the database in `./data`:

```sh
export HABITS_SECRET_KEY="$(openssl rand -hex 32)" HABITS_PUBLIC_URL=https://habits.example.com
docker compose up -d
```

Migrations run on every start. Put it behind a reverse proxy that terminates HTTPS. To update, pull `:latest` and recreate the container.

### Exposing it

The web app and the REST API can stay on a private network. Only claude.ai (OAuth and MCP) and the reminders' "done" button need to reach the server from the internet, so a public hostname should let only those paths through. With Caddy:

```caddyfile
habits.example.com {
    @allowed path /mcp /authorize /token /oauth/* /.well-known/oauth-* /notifications/actions/*
    handle @allowed {
        reverse_proxy <app-host>:8000
    }
    respond 404
}
```

`HABITS_PUBLIC_URL` must be that public address: it is the OAuth issuer and the base of the reminder links. The web app works on any hostname that reaches the container, since its session cookie is host-only.

The login page is public, so the account needs a strong password. An access proxy with its own login (Cloudflare Access and similar) can't sit in front of `/mcp`: claude.ai can't pass it.
