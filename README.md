# Habits

Self-hosted habit tracker: REST API, installable PWA, remote MCP server, a summary endpoint for an AWTRIX clock, and ntfy reminders. FastAPI + SQLite (SQLAlchemy and Alembic keep it portable to Postgres).

## Run locally

The server lives in `backend/`; run these from there.

```sh
cd backend
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
| `HABITS_PUBLIC_URL` | `http://localhost:8000` | Public HTTPS address: the "done" link in reminders and the OAuth issuer for the MCP. |
| `HABITS_DEFAULT_TIMEZONE` | `Europe/Madrid` | For users created without `--timezone`. |
| `HABITS_BACKUP_DIR` | `./data/backups` (`/data/backups` in the image) | Daily SQLite copy, 14 kept. |
| `HABITS_SCHEDULER_ENABLED` | `true` | Reminders and backups loop. Run a single replica. |
| `HABITS_COOKIE_SECURE` | `true` | Set `false` only for plain-HTTP local dev. |
| `HABITS_WEB_DIR` | unset (`/app/web` in the image) | Built PWA served at `/`. API routes take precedence. |
| `HABITS_FORWARDED_ALLOW_IPS` | `*` | Proxies trusted for `X-Forwarded-*` (image only). |

## Web app

`web/` is a React PWA (Vite, Tailwind, shadcn) for marking today's habits, correcting past days and browsing stats. Creating and editing habits stays in the MCP. It signs in with the account's email and password and uses the same-origin session cookie.

```sh
cd web && npm ci && npm run dev   # proxies the API to the backend on :8000
npm run build                     # dist/, what HABITS_WEB_DIR points at
```

The image builds it and serves it from the same origin. On Android, open the site in Chrome and use "Install app".

## Mobile app

`mobile/` is an Expo (React Native) app with the same screens and behaviour as the PWA. It signs in with `POST /auth/token` and keeps a revocable API token in the device's secure storage. See [mobile/README.md](mobile/README.md).

## Accounts and tokens

There is no sign-up. Accounts and the first tokens are made with the CLI, which the image runs when given arguments:

```sh
docker exec -it habits ./docker-entrypoint.sh create-user me@example.com --admin
docker exec -it habits ./docker-entrypoint.sh set-password me@example.com   # needed to sign in to the web app
docker exec habits ./docker-entrypoint.sh create-token me@example.com --name awtrix --scope read
docker exec habits ./docker-entrypoint.sh create-token me@example.com --name claude --scope write
```

Tokens are shown once and stored hashed. The token name is recorded as the `source` of every mark it makes. Native apps sign in with `POST /auth/token` (email, password, `device_name`), which returns a write token; `POST /auth/logout` with that token revokes it. A logged-in web session (`POST /auth/login`) can also list, create and revoke tokens through `/tokens`; API tokens cannot mint other tokens.

## Rules

- A day is the user's logical day: their timezone, rolled over at `day_cutoff` (default 00:00).
- Weeks start on Monday; months are calendar months.
- Schedules are versioned by `effective_from`, so changing frequency never rewrites the past.
- Failures are computed, never stored. Skipped days count neither for nor against. Today is `pending` until it ends.
- `times_per_period` counts days completed in the week or month; a period is credited to the stats range holding its last day.
- A habit's `kind` is `build` (success is doing it) or `limit` (success is not doing it), fixed at creation. On a limit habit a logged day is a slip: `daily` means never, `weekdays` never on those days, and `times_per_period` at most `period_target` slip days per week or month. A period fails as soon as it goes over; slips within the allowance show as `slipped`. Limit habits are never reminded and never count as to-do in Awtrix or Home Assistant.
- Another user's resources answer 404.

## MCP

Streamable HTTP at `<HABITS_PUBLIC_URL>/mcp`, stateless, JSON responses (no SSE, so nothing to tune for proxy buffering). A read token can only use the read tools.

**claude.ai, Claude Desktop and the mobile apps.** OAuth clients are registered from the terminal only; the public `/register` endpoint is off, so nobody else can create a client that sends codes to their own site. Register Claude once:

```sh
habits create-oauth-client Claude --redirect-uri https://claude.ai/api/mcp/auth_callback --redirect-uri https://claude.com/api/mcp/auth_callback
```

It prints a client ID. Settings → Connectors → Add custom connector, URL `<HABITS_PUBLIC_URL>/mcp`, Advanced settings → OAuth Client ID = that ID, no secret (PKCE). Claude opens the app's login page and gets an ordinary API token named after the client, listed and revocable under `/tokens`. Connectors added on claude.ai show up in the mobile apps too. claude.ai connects from Anthropic's servers, so the server must be reachable from the internet, see [Exposing it](#exposing-it).

**Claude Code**, with a personal token, or with OAuth through a client registered for a fixed loopback port:

```sh
claude mcp add --transport http habits https://habits.example.com/mcp --header "Authorization: Bearer hab_..."

habits create-oauth-client "Claude Code" --redirect-uri http://localhost:3118/callback
claude mcp add --transport http --scope user --client-id <id> --callback-port 3118 habits https://habits.example.com/mcp
```

Redirect URIs must be https or a loopback address, and `/authorize` only accepts the exact ones registered.

Five wrong passwords for the same email block logins for that email for 15 minutes.

## Home Assistant

`custom_components/habits` is a Home Assistant integration that reads `GET /today` and exposes:

- `todo.<name>_today`: the habits due today. Checking one completes it (all of its remaining `times_per_day`); unchecking clears the day. Skipped habits show as completed.
- `sensor.<name>_pending_today`, `_done_today`, `_due_today`.

Install it from the Marketplace (HACS): ⋮ → Custom repositories → `eliseo-juan/habits`, type Integration, then download it and restart. Settings → Devices & services → Add integration → Habits, with the server's URL (for example `https://habits.example.com`) and a write token:

```sh
docker exec habits ./docker-entrypoint.sh create-token me@example.com --name home-assistant --scope write
```

Marks made from Home Assistant are recorded with source `home-assistant`. A rejected token opens a re-authentication prompt.

On setup it subscribes a local-only Home Assistant webhook to [webhooks](#webhooks), so changes made anywhere (web app, MCP, notification) show up at once; it also polls every 15 minutes, which covers the day rollover and any missed ping. The webhook URL is built from Home Assistant's local network URL (Settings → System → Network) and must be reachable from the Habits server. Without one the integration still works, on the polling interval only. Removing the integration unsubscribes it.

Tests run against Home Assistant's own test harness in a separate environment:

```sh
python3.14 -m venv .venv-ha && .venv-ha/bin/pip install pytest-homeassistant-custom-component==0.13.375
cd tests_ha && ../.venv-ha/bin/pytest -q
```

## Webhooks

`POST /webhooks` with `{"url": "..."}` and a write token subscribes a URL; posting the same URL again returns the existing subscription. Whenever the account's habits or logs change, every subscribed URL gets an empty `POST`, sent in the background with a 5-second timeout and no retries, so subscribers should also poll. The request carries no data: subscribers fetch what they need with their own token. `GET /webhooks` lists them, `DELETE /webhooks/{id}` removes one; ten per account at most.

## AWTRIX

`GET /awtrix/today` with a read token returns a neutral summary (pending, done, total, pending and done habits with their color and icon, top streaks) for a script on the clock to render.

## Reminders

Add an ntfy channel (`POST /channels` with `{"config": {"topic": "...", "server": "https://ntfy.sh", "access_token": null}}`) and reminders per habit (`POST /habits/{id}/reminders` with `{"time_local": "08:30", "weekdays": [0, 2, 4]}`). Within ten minutes of the local time, a habit still pending that day gets one notification with a "Hecho" button. The button calls a signed, single-use link, so the notification never carries a personal token. If every channel fails, the next minute retries.

## Deploy

Every push to `main` that changes the image (`backend/`, `web/`, `Dockerfile`) runs the checks and publishes `ghcr.io/eliseo-juan/habits:latest` plus a `sha-…` tag (and `X.Y.Z` for `v*` tags). `docker-compose.yml` runs it with the database in `./data`:

```sh
export HABITS_SECRET_KEY="$(openssl rand -hex 32)" HABITS_PUBLIC_URL=https://habits.example.com
docker compose up -d
```

Migrations run on every start. Put it behind a reverse proxy that terminates HTTPS. To update, pull `:latest` and recreate the container.

### Exposing it

The web app and the REST API can stay on a private network. Only claude.ai (OAuth and MCP) and the reminders' "Hecho" button need to reach the server from the internet, so a public hostname should let only these paths through. With Caddy:

```caddyfile
habits.example.com {
    @allowed path /mcp /authorize /token /oauth/* /.well-known/oauth-* /notifications/actions/*
    handle @allowed {
        reverse_proxy <app-host>:8000
    }
    respond 404
}
```

`HABITS_PUBLIC_URL` must be that public address: it is the OAuth issuer and the base of the "Hecho" links. The web app works on any hostname that reaches the container, since its session cookie is host-only.

The login page is public, so the account needs a strong password. An access proxy with its own login (Cloudflare Access and similar) can't sit in front of `/mcp`: claude.ai can't pass it.
