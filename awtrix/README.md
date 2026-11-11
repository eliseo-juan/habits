# SmartHabits on an AWTRIX clock

`habits.be` is an [AWTRIX NG](https://github.com/Blueforcer/awtrix-ng) script (Berry) for 52x16 pixel clocks such as the Ulanzi TC002. It talks to the SmartHabits server directly, with no Home Assistant in between, and shows today's habits on the wall.

## Install

1. Create a read token for the clock:

   ```sh
   docker compose exec habits ./docker-entrypoint.sh create-token me@example.com --name awtrix --scope read
   ```

2. Install the script. In the clock's web UI: **Scripts** → **+**, name it `Habits`, paste `habits.be`, **Save**. Or:

   ```sh
   curl -X PUT http://<clock-ip>/api/v1/apps/script/Habits -H 'Content-Type: text/plain' --data-binary @habits.be
   ```

3. **Apps** tab → ⚙ on the `Habits` row: set the server address and paste the token. You can also change the refresh interval (default 2 min) and the hour the day starts (default 7). Saving restarts the app.

The clock verifies the server's HTTPS certificate, so the server needs one the clock trusts. The token is stored as a clock setting, which anyone on the network can read unless authentication is turned on in the clock, so always use a read-only token.

## What it shows

- One square per habit due today, in the habit's color: done ones dimmed with a check, pending ones turning red as the day goes on. Up to 14 habits get 6 px squares; up to 30 get 4 px squares.
- A 1 px bar along the bottom row that fills from the start hour to midnight, with the current moment blinking.
- A dim pixel in the top-right corner when the last refresh failed or the data is old.
- The app only takes its turn in the clock's rotation while something is still pending.

## How it works

Every few minutes, and whenever the app comes back on screen with data older than 30 s, the script calls `GET /awtrix/today`. The server already leaves out limit habits and returns the pending and done habits with their colors, so the script only draws. A habit marked anywhere (web app, mobile app, Claude, a reminder, Home Assistant) appears on the clock at the next refresh.

Settings are declared in the `# @config` header of `habits.be`; bump `# @version` when changing the script.

