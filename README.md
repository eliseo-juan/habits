# SmartHabits

**A self-hosted habit tracker that lives wherever you are: your phone, your browser, your wall clock, your smart home, and your conversations with Claude.**

Mark a habit from a widget, a notification, a Home Assistant to-do list or just by telling Claude "I went for a run", and every other place shows it at once. Your data stays on your own server, in a single SQLite file.

## What you can do

- **Track habits you want to build and habits you want to cut.** "Read every day" and "no more than two takeaways a week" are both first-class: limit habits count slips against an allowance instead of pretending you missed a goal.
- **Use flexible schedules.** Daily, on given weekdays, or *N* times per week or month, several times a day if you need it, with optional start and end dates.
- **Mark in one tap, anywhere.** An installable web app, a native mobile app with home screen and lock screen widgets, an actionable "done" button on reminders, Home Assistant to-do lists, and an AWTRIX pixel clock on the wall.
- **Ask Claude.** SmartHabits is a remote MCP server: ask how your month went, log yesterday's workout, or create a new habit in plain language from claude.ai, Claude Desktop, the Claude mobile apps or Claude Code.
- **See honest stats.** Streaks, monthly and yearly completion, per-habit history, and a calendar of done, skipped and missed days.
- **Get reminded.** Native push reminders on your phone with done, skip and snooze buttons, only for habits still pending that day.

## What makes it different

- **Stats you can trust.** Missed days are computed, never stored, so nothing drifts. Changing a habit's frequency never rewrites its past. A skipped day (sick, travelling) counts neither for nor against you, and today stays "pending" until it actually ends.
- **Your day, not the server's.** Each account has its own timezone and the hour its day rolls over, so a 1 a.m. run still counts for "today" if you want it to.
- **Everything stays in sync.** Changes are pushed to Home Assistant through webhooks, the clock and widgets refresh on their own, and the phone keeps working offline from its cache.
- **Private by design.** No sign-up and no third-party service in the loop. Tokens are scoped (read or write), stored hashed and revocable, and reminder buttons use signed single-use links instead of carrying your credentials. Only the owner can register OAuth clients.
- **Small to run.** One container, one SQLite file, daily backups, migrations on start.

## Quick start

```sh
curl -O https://raw.githubusercontent.com/eliseo-juan/habits/main/docker-compose.yml
export HABITS_SECRET_KEY="$(openssl rand -hex 32)" HABITS_PUBLIC_URL=http://localhost:8000 HABITS_COOKIE_SECURE=false
docker compose up -d
docker compose exec habits ./docker-entrypoint.sh create-user me@example.com --admin
docker compose exec habits ./docker-entrypoint.sh set-password me@example.com
```

Open http://localhost:8000 and sign in. For a real deployment behind HTTPS, see [backend/README.md](backend/README.md#deploy).

## What's in the repo

| Piece | What it is | Docs |
|---|---|---|
| `backend/` | FastAPI server: REST API, MCP server, reminders, webhooks; serves the web app | [backend/README.md](backend/README.md) |
| `web/` | Installable web app (PWA) | [web/README.md](web/README.md) |
| `mobile/` | Android and iOS app with widgets and offline cache (Expo) | [mobile/README.md](mobile/README.md) |
| `custom_components/habits/` | Home Assistant integration, installable through HACS | [custom_components/habits/README.md](custom_components/habits/README.md) |
| `awtrix/` | Script for the AWTRIX NG pixel clock | [awtrix/README.md](awtrix/README.md) |

SmartHabits is a personal project and does not take outside contributions; see [CONTRIBUTING.md](CONTRIBUTING.md).
