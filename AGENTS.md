# AGENTS.md

SmartHabits, a self-hosted habit tracker. One FastAPI backend serves a REST API, a remote MCP server, the
built PWA and reminder/webhook delivery. Personal project: the owner is the only contributor.

## Layout

| Path | What | Stack |
|---|---|---|
| `backend/` | Server: `app/`, `migrations/`, `tests/` | Python 3.14, FastAPI, SQLAlchemy, Alembic |
| `web/` | PWA | React, Vite, Tailwind, shadcn |
| `mobile/` | Native app (see `mobile/AGENTS.md`) | Expo |
| `custom_components/habits/`, `tests_ha/` | Home Assistant integration (HACS) | |
| `awtrix/`, `awtrix-preview/` | AWTRIX clock app and layout previews | |

## Backend architecture

Paths below are relative to `backend/`.

- Business logic lives in `app/services/`. `app/api/` (REST) and `app/mcp/server.py` (MCP)
  are thin adapters over the same services: a behavior change goes in the service so both
  surfaces stay in sync.
- `app/services/rules.py` is pure: no DB, no clock. Keep it that way so rules stay testable
  with fixed dates. Get "now" from `app/clock.py` / the `Now` dependency, never `datetime.now()`.
- Another user's resources answer 404, not 403.

## Domain rules that are easy to break

Full list in `backend/README.md` "Rules". The ones code changes trip on:

- A day is the user's logical day (their timezone, rolled over at `day_cutoff`).
- Failures are computed, never stored. Skipped days count neither for nor against.
- Schedules are versioned by `effective_from`; never rewrite past schedules.
- Habit `kind` (`build` / `limit`) is fixed at creation and inverts what a logged day means.

## Commands

Backend (from `backend/`, venv in `backend/.venv`):

```sh
.venv/bin/pip install -e ".[dev]"
.venv/bin/ruff check . && .venv/bin/ruff format --check .
.venv/bin/pytest -q
.venv/bin/alembic upgrade head && .venv/bin/alembic check   # models and migrations agree
```

- Web (`web/`): `npm ci`, `npm run lint`, `npm run build`.
- Mobile: see `mobile/AGENTS.md`.
- Home Assistant (`tests_ha/`): `pytest -q` with `pytest-homeassistant-custom-component`.

Ruff config is the root `ruff.toml` and covers `backend/`, `custom_components/` and `tests_ha/`.

Run the checks for every part you touched before calling a task done.

## CI

`✅ CI` (`ci.yml`) runs on every PR and push to `main`. Its `🔎 Changes` job picks which
component workflows run from the paths a change touches, and `CI ok` is the single required
status: it passes when every component that ran passed. Tags and manual runs check everything.

| Workflow | Runs when | Checks |
|---|---|---|
| `🐍 Backend` (`backend.yml`) | `backend/`, `ruff.toml` | Ruff, pytest, migrations round-trip, pip-audit |
| `🌐 Web` (`web.yml`) | `web/` | oxlint, build (includes `tsc`), npm audit |
| `📱 Mobile` (`mobile.yml`) | `mobile/` | Typecheck, Android prebuild, JS bundle |
| `🏠 Home Assistant` (`home-assistant.yml`) | `custom_components/`, `tests_ha/`, `hacs.json` | Ruff, HA test harness |
| `🐳 Docker image` (`docker.yml`) | `backend/`, `web/`, `Dockerfile` | Image builds and answers `/health` |

Delivery is marked 🚀: `🚀 Publish image` (in `ci.yml`, pushes to `main` and tags that change
the image), `🚀 Mobile OTA update` (pushes to `main` touching `mobile/`) and
`🚀 Mobile APK build` (manual). `🔒 Owner only` closes outside PRs and issues.

A new component gets its own reusable workflow with an emoji name, a filter in `🔎 Changes`
and an entry in `CI ok`'s `needs`.

## Changes

- Schema change → new Alembic migration in `backend/migrations/versions/` (numbered `000N_name.py`)
  that also downgrades cleanly.
- API change → check every client: `web/`, `mobile/`, `custom_components/habits/`,
  `awtrix/` and the MCP tools.
- Ship behavior changes with tests and bug fixes with a regression test.
- PRs target `main`. Commit subjects are imperative and prefixed with the area when it
  isn't the backend (`Mobile: …`).

## Writing

Everything in the repo and on GitHub is written in English, even though this is a personal
project.

PR descriptions, commit messages, READMEs and other docs are generic: they describe what the
project does and how anyone would run it, not how the owner uses it. Leave out personal
hostnames, domains, devices, accounts, habits, tokens and deployment details. Use
placeholders such as `habits.example.com` and `me@example.com`.

The root `README.md` is the product pitch: what SmartHabits does and why it is different.
Every piece in the layout table has its own README on how to run it and how it works; update
it in the same PR when that changes. Code identifiers keep the `habits` name.
