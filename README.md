# Habits

Personal habit tracker: REST API, installable PWA, remote MCP server, a summary endpoint for an AWTRIX clock, and ntfy reminders. FastAPI + SQLite (SQLAlchemy and Alembic keep it portable to Postgres).

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

## Accounts and tokens

There is no sign-up. Accounts and the first tokens are made with the CLI, which the image runs when given arguments:

```sh
docker exec -it habits ./docker-entrypoint.sh create-user me@example.com --admin
docker exec -it habits ./docker-entrypoint.sh set-password me@example.com   # needed to sign in to the web app
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

Streamable HTTP at `<HABITS_PUBLIC_URL>/mcp`, stateless, JSON responses (no SSE, so nothing to tune for proxy buffering). A read token can only use the read tools.

**claude.ai, Claude Desktop and the mobile apps.** OAuth clients are registered from the terminal only; the public `/register` endpoint is off, so nobody else can create a client that sends codes to their own site. Register Claude once:

```sh
habits create-oauth-client Claude --redirect-uri https://claude.ai/api/mcp/auth_callback --redirect-uri https://claude.com/api/mcp/auth_callback
```

It prints a client ID. Settings → Connectors → Add custom connector, URL `https://mcp.habits.lab.eliseo.tech/mcp`, Advanced settings → OAuth Client ID = that ID, no secret (PKCE). Claude opens the app's login page and gets an ordinary API token named after the client, listed and revocable under `/tokens`. Connectors added on claude.ai show up in the mobile apps too. The server must be reachable from the internet, see [Public access](#public-access-caddy).

**Claude Code**, with a token on the LAN, or with OAuth through a client registered for a fixed loopback port:

```sh
claude mcp add --transport http habits https://habits.lab.eliseo.tech/mcp --header "Authorization: Bearer hab_..."

habits create-oauth-client "Claude Code" --redirect-uri http://localhost:3118/callback
claude mcp add --transport http --scope user --client-id <id> --callback-port 3118 habits https://mcp.habits.lab.eliseo.tech/mcp
```

Redirect URIs must be https or a loopback address, and `/authorize` only accepts the exact ones registered.

Five wrong passwords for the same email block logins for that email for 15 minutes.

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
      HABITS_PUBLIC_URL: https://mcp.habits.lab.eliseo.tech
    volumes:
      - /mnt/<pool>/apps/habits:/data
```

`568` is TrueNAS's `apps` user; the dataset must be writable by it. Migrations run on every start.

Nginx Proxy Manager: proxy host `habits.lab.eliseo.tech` → `http://<truenas-ip>:8000`, with SSL forced and HTTP/2 on. No custom locations needed.

### Public access (Caddy)

claude.ai connects from Anthropic's servers, so the LAN-only `habits.lab.eliseo.tech` is not enough. A second hostname, `mcp.habits.lab.eliseo.tech`, goes through the Caddy reverse proxy in the DMZ and only lets the MCP, OAuth and reminder-action paths through; the web app and the REST API stay on the LAN.

1. Cloudflare DNS: an A record `mcp.habits.lab.eliseo.tech` → the public IP, DNS only (no proxy), kept current by DDNS.
2. Caddy:

   ```caddyfile
   mcp.habits.lab.eliseo.tech {
       @allowed path /mcp /authorize /token /oauth/* /.well-known/oauth-* /notifications/actions/*
       handle @allowed {
           reverse_proxy <truenas-ip>:8000
       }
       respond 404
   }
   ```

3. Firewall: allow the Caddy host in the DMZ to reach `<truenas-ip>:8000`.
4. Set `HABITS_PUBLIC_URL: https://mcp.habits.lab.eliseo.tech` in the app and redeploy. It is the OAuth issuer and the base of the reminders' "Hecho" links; the web app on `habits.lab.eliseo.tech` doesn't depend on it.

The login page is public, so the account needs a strong password. Cloudflare Access can't sit in front of `/mcp`: claude.ai can't pass its login.

### Updates

The NAS isn't reachable from GitHub, so it pulls: copy `deploy/truenas-update.sh` to the dataset and add a cron job (System → Advanced Settings → Cron Jobs, user `root`, every 15 minutes):

```sh
sh /mnt/<pool>/apps/habits/truenas-update.sh habits
```

It redeploys the app only when `:latest` moved, so a merge to `main` is live within about 15 minutes. If the GHCR package is private, run `docker login ghcr.io` once as root with a token that has `read:packages`.
