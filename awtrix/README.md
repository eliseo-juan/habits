# AWTRIX clock app

`habits.be` is an [AWTRIX NG](https://github.com/Blueforcer/awtrix-ng) script (Berry) for the 52x16 clock
(Ulanzi TC002). It talks to the Habits server directly, with no Home Assistant in between, and draws
today's habits:

- 6 px squares: done in green with a check, pending in the habit's color turning red through the day.
  With more than 14 habits the squares shrink to 4 px (up to 30).
- A 1 px bar along the bottom row that fills from the start hour to midnight; the current moment blinks.
- A dim pixel in the top-right corner when the last refresh failed or the data is old.
- The app only takes its turn in the rotation while something is still pending.

Every few minutes (and when the app comes back on screen with data older than 30 s) it calls
`GET /awtrix/today`, which already leaves out limit habits and returns the pending habits with their color
and how many are done. Marking a habit done anywhere (web app, MCP, notification, a Home Assistant to-do
list) shows up on the clock at the next refresh.

## Install

1. Create a read token for the clock:

   ```sh
   docker exec habits ./docker-entrypoint.sh create-token me@example.com --name awtrix --scope read
   ```

2. Put your server's host in the script: edit `hosts=habits.example.com` on the `@secret` line (and the
   default `url`) of `habits.be`. The token may only be sent to the hosts listed there.
3. Install it. In the web UI of the clock: **Scripts** → **+**, name it `Habits`, paste the file, **Save**. Or:

   ```sh
   curl -X PUT http://<clock-ip>/api/v1/apps/script/Habits -H 'Content-Type: text/plain' --data-binary @habits.be
   ```

4. **Apps** tab → ⚙ on the `Habits` row: paste the token under **API keys**, check the server address, and
   set the refresh interval (default 2 min) and the hour the day starts (default 7).

The clock checks the HTTPS certificate of the server, so it needs a certificate it trusts. The token is
kept out of the script source (`@secret`), and a read token cannot change anything.
