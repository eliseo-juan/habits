# AGENTS.md

Self-hosted habit tracker. One FastAPI backend serves a REST API, a remote MCP server, the
built PWA and reminder/webhook delivery. Personal project: the owner is the only contributor.

## Layout

| Path | What | Stack |
|---|---|---|
| `app/` | Backend | Python 3.14, FastAPI, SQLAlchemy, Alembic |
| `migrations/` | Alembic migrations | |
| `tests/` | Backend tests | pytest |
| `web/` | PWA | React, Vite, Tailwind, shadcn |
| `mobile/` | Native app (see `mobile/AGENTS.md`) | Expo |
| `custom_components/habits/`, `tests_ha/` | Home Assistant integration (HACS) | |
| `awtrix/`, `awtrix-preview/` | AWTRIX clock app and layout previews | |

## Backend architecture

- Business logic lives in `app/services/`. `app/api/` (REST) and `app/mcp/server.py` (MCP)
  are thin adapters over the same services: a behavior change goes in the service so both
  surfaces stay in sync.
- `app/services/rules.py` is pure: no DB, no clock. Keep it that way so rules stay testable
  with fixed dates. Get "now" from `app/clock.py` / the `Now` dependency, never `datetime.now()`.
- Another user's resources answer 404, not 403.

## Domain rules that are easy to break

Full list in README "Rules". The ones code changes trip on:

- A day is the user's logical day (their timezone, rolled over at `day_cutoff`).
- Failures are computed, never stored. Skipped days count neither for nor against.
- Schedules are versioned by `effective_from`; never rewrite past schedules.
- Habit `kind` (`build` / `limit`) is fixed at creation and inverts what a logged day means.

## Commands

Backend (repo root, venv in `.venv`):

```sh
.venv/bin/pip install -e ".[dev]"
.venv/bin/ruff check . && .venv/bin/ruff format --check .
.venv/bin/pytest -q
.venv/bin/alembic upgrade head && .venv/bin/alembic check   # models and migrations agree
```

- Web (`web/`): `npm ci`, `npm run lint`, `npm run build`.
- Mobile: see `mobile/AGENTS.md`.
- Home Assistant (`tests_ha/`): `pytest -q` with `pytest-homeassistant-custom-component`.

Run the checks for every part you touched before calling a task done; CI runs all of them.

## Changes

- Schema change → new Alembic migration in `migrations/versions/` (numbered `000N_name.py`)
  that also downgrades cleanly. CI runs upgrade → check → downgrade base → upgrade.
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
