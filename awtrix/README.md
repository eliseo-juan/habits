# SmartHabits on an AWTRIX clock

`habits.be` is an [AWTRIX NG](https://github.com/Blueforcer/awtrix-ng) script (Berry) for 52x16 pixel clocks such as the Ulanzi TC002. It talks to the SmartHabits server directly, with no Home Assistant in between, and shows today's habits on the wall.

## Install

1. Create a write token for the clock, so it can mark habits:

   ```sh
   docker compose exec habits ./docker-entrypoint.sh create-token me@example.com --name awtrix --scope write
   ```

2. Put your server's host in the `# @secret` line of `habits.be`, replacing `habits.example.com`. The clock only sends the token to the hosts listed there, and changing that line later erases the stored token.

3. Install the script. In the clock's web UI: **Scripts** → **+**, name it `Habits`, paste `habits.be`, **Save**. Or:

   ```sh
   curl -X PUT http://<clock-ip>/api/v1/apps/script/Habits -H 'Content-Type: text/plain' --data-binary @habits.be
   ```

4. **Apps** tab → ⚙ on the `Habits` row: set the server address, and paste the token under **API keys**. You can also change the refresh interval (default 2 min) and the hour the day starts (default 7). Saving restarts the app.

The clock verifies the server's HTTPS certificate, so the server needs one the clock trusts. The token is an API key of the app: nobody can read it back from the clock, and it only goes to the hosts in the `# @secret` line. Other scripts installed on the clock could still use it, so install only scripts you trust, and turn on the clock's web login so nobody on the network can change the script. The script needs a TC002 (the `secret` module).

## What it shows

- One square per habit due today, in the habit's color: done ones dimmed with a check, pending ones turning red as the day goes on. Up to 14 habits get 6 px squares; up to 30 get 4 px squares.
- A 1 px bar along the bottom row that fills from the start hour to midnight, with the current moment blinking.
- A dim pixel in the top-right corner when the last refresh failed or the data is old.
- The app only takes its turn in the clock's rotation while something is still pending.

## Marking habits from the clock

While the app is on screen, it takes the three buttons, so left and right no longer switch apps there:

- Any button brings up a cursor, a white outline, on the first pending habit.
- Left and right move it, and keep moving while held. One more press past either end hides it and lets the rotation go on.
- A short press on select marks the habit done, or not done if it already was. Holding select still opens the clock's menu.
- Each press keeps the app on screen for another 30 s. Once it leaves, the cursor is gone the next time it appears.

A square flips at once. If the server refuses the mark, it flips back and blinks red. A habit done several times a day gets one more each press and stays pending until it reaches its count; marking a done habit not done clears the day.

## How it works

Every few minutes, after each mark, and whenever the app comes back on screen with data older than 30 s, the script calls `GET /awtrix/today`. The server already leaves out limit habits and returns the pending and done habits with their colors, so the script only draws. A mark is `POST /habits/{id}/logs/{date}/done` or `DELETE /habits/{id}/logs/{date}`, with the date the server sent, so the clock never works out the user's day itself. A habit marked anywhere (web app, mobile app, Claude, a reminder, Home Assistant) appears on the clock at the next refresh.

Settings are declared in the `# @config` header of `habits.be`; bump `# @version` when changing the script.

