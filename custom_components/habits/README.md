# SmartHabits for Home Assistant

A Home Assistant integration that shows today's SmartHabits habits as a to-do list and sensors, so you can check them off from a dashboard, a voice assistant or an automation, and build displays and reminders on top of them.

## Install

1. Create a write token on the server:

   ```sh
   docker compose exec habits ./docker-entrypoint.sh create-token me@example.com --name home-assistant --scope write
   ```

2. HACS → ⋮ → Custom repositories → `eliseo-juan/habits`, type **Integration**. Download it and restart Home Assistant.
3. Settings → Devices & services → Add integration → **Habits**. Enter the server's URL (for example `https://habits.example.com`) and the token.

## What you get

| Entity | What it shows |
|---|---|
| `todo.<name>_today` | Habits due today. Checking one completes it (all of its remaining `times_per_day`); unchecking clears the day. Skipped habits show as completed. |
| `sensor.<name>_pending_today` | Habits still pending today |
| `sensor.<name>_done_today` | Habits done today |
| `sensor.<name>_due_today` | Habits due today. Its `habits` attribute lists each one with name, color, icon, status, `done_count`, `times_per_day` and priority, for custom cards and LED displays. |

Limit habits (things you are cutting down on) never count as to-do here. Marks made from Home Assistant are recorded with source `home-assistant`.

## How it works

- It reads `GET /today` with the token, through a `DataUpdateCoordinator` that polls every 15 minutes. That covers the day rollover and any missed update.
- On setup it registers a local-only Home Assistant webhook and subscribes it on the server (`POST /webhooks`). Any change made elsewhere (web app, mobile app, MCP, a reminder) pings it, and the integration refreshes at once. The webhook URL comes from Home Assistant's local network URL (Settings → System → Network) and must be reachable from the server; without it the integration still works, on polling only. Removing the integration unsubscribes it.
- A rejected token opens a re-authentication prompt.

```
__init__.py        setup, webhook subscription, teardown
api.py             HTTP client for the server
coordinator.py     polling and refresh on webhook
todo.py, sensor.py entities
config_flow.py     setup and re-auth UI; strings in strings.json and translations/
```

## Tests

The tests in `tests_ha/` (repo root) run against Home Assistant's own test harness, in an environment separate from the server's:

```sh
python3.14 -m venv .venv-ha && .venv-ha/bin/pip install pytest-homeassistant-custom-component==0.13.375
cd tests_ha && ../.venv-ha/bin/pytest -q
```
