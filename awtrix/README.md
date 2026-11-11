# AWTRIX clock app

`habits.be` is an [AWTRIX NG](https://github.com/Blueforcer/awtrix-ng) script (Berry) that draws today's
habits on a 52x16 clock: 6 px squares (done in green with a check, pending in the habit's color turning
red through the day) and a 1 px bar along the bottom row that fills from the start hour to midnight, with
the current moment blinking. The app only takes its turn in the rotation while something is pending.

It draws everything itself. Home Assistant only publishes data, retained, on `habits/today`:

```json
{"habits": [{"color": [59, 130, 246], "done": true}, {"color": [234, 179, 8], "done": false}]}
```

The Home Assistant integration exposes the habits (with their colors) as the `habits` attribute of
`sensor.<name>_due_today`; a script and an automation in Home Assistant turn that into the message above.

## Install

Web UI of the clock: **Scripts** → **+**, name it `Habits`, paste `habits.be`, **Save**. Or:

```sh
curl -X PUT http://<clock-ip>/api/v1/apps/script/Habits -H 'Content-Type: text/plain' --data-binary @habits.be
```

Settings (⚙ on the app's row under **Apps**): the MQTT topic (default `habits/today`) and the hour the day
starts (default 7).
