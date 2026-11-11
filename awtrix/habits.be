# @name    Habits
# @desc    Today's habits from your Habits server: done in green with a check, pending in their color turning red, and a bar for the day
# @author  eliseo-juan
# @version 2.0
# @needs   secret
# @config  url   text   "Habits server"  default="https://habits.example.com" help="Address of the server, without a trailing slash"
# @config  every number "Refresh"        default=2 min=1 max=60 unit=min
# @config  start number "Day starts"     default=7 min=0 max=12 unit=h help="The bar fills from this hour to midnight"
# @secret  token hosts=habits.example.com label="Habits token" help="Read token: habits create-token EMAIL --name awtrix --scope read"

# Pulls GET <url>/awtrix/today every few minutes and draws it on the 52x16 display. The server already
# leaves out limit habits and returns the pending ones with their color, plus how many are done.
# Edit `hosts=` above (and the default url) to your server's host before installing.
# The app only takes its turn in the rotation while something is pending.

import json
import secret

class Habits
  var cols      # [[r, g, b], ...] one entry per habit, done habits first
  var done      # [bool, ...] same order
  var pcol      # the color each cell is painted in, rebuilt once a second
  var pending   # how many habits are still to do
  var frac      # how much of the day has passed, 0.0 to 1.0
  var inner, pitch, cn, ox, oy      # layout of the squares
  var tick6, tick4                  # the check mark, for 6 px and 4 px squares
  var pal, hexmap                   # fallback colors, hex digits
  var ticks, age, busy, loaded, failed

  def init()
    self.cols = []
    self.done = []
    self.pcol = []
    self.pending = 0
    self.frac = 0.0
    self.inner = 6
    self.pitch = 7
    self.cn = 1
    self.ox = 0
    self.oy = 0
    self.tick6 = [[5,0],[0,1],[4,1],[5,1],[0,2],[1,2],[3,2],[4,2],[1,3],[2,3],[3,3],[2,4]]
    self.tick4 = [[3,0],[0,1],[2,1],[1,2]]
    self.pal = [[255,90,95],[255,162,58],[255,210,63],[123,220,101],[46,196,182],[58,155,255],[143,107,255],[255,107,214]]
    self.hexmap = {"0":0,"1":1,"2":2,"3":3,"4":4,"5":5,"6":6,"7":7,"8":8,"9":9,
                   "a":10,"b":11,"c":12,"d":13,"e":14,"f":15,"A":10,"B":11,"C":12,"D":13,"E":14,"F":15}
    self.ticks = 0
    self.age = 9999
    self.busy = false
    self.loaded = false
    self.failed = false
  end

  def setup()
    self.loop()
  end

  # "#3a9bff" -> [58, 155, 255]; anything else -> a color picked from the habit's id
  def color_of(hx, id)
    if type(hx) == 'string' && size(hx) == 7 && hx[0] == "#"
      var r = self.hexmap.find(hx[1], 0) * 16 + self.hexmap.find(hx[2], 0)
      var g = self.hexmap.find(hx[3], 0) * 16 + self.hexmap.find(hx[4], 0)
      var b = self.hexmap.find(hx[5], 0) * 16 + self.hexmap.find(hx[6], 0)
      return [r, g, b]
    end
    return self.pal[id % 8]
  end

  def fetch()
    if self.busy
      return
    end
    if !secret.has('token')
      self.failed = true
      return
    end
    self.busy = true
    http.get(store.get("url") + "/awtrix/today", / b, st -> self.on_body(b, st),
             {'headers': {'Authorization': "Bearer {secret:token}", 'Accept': "application/json"},
              'timeout': 10})
  end

  def on_body(body, status)
    self.busy = false
    var data = nil
    if body != nil && status == 200
      try
        data = json.load(body)
      except .. as err, msg
        log(msg)
      end
    end
    if !isinstance(data, map)
      self.failed = true
      self.ticks = 30                     # try again soon
      return
    end

    var nd = data.find("done", 0)
    if nd > 30
      nd = 30
    end
    var cols = []
    var done = []
    if nd > 0
      for i : 0 .. nd - 1
        cols.push([0, 0, 0])
        done.push(true)
      end
    end
    var ph = data.find("pending_habits", [])
    if isinstance(ph, list)
      for h : ph
        if size(cols) < 30
          cols.push(self.color_of(h.find("color"), h.find("id", 0)))
          done.push(false)
        end
      end
    end

    var tot = size(cols)
    var big = tot <= 14
    var inner = big ? 6 : 4
    var pitch = inner + 1
    var colsmax = big ? 7 : 10
    var rows = 1
    var cn = 1
    if tot > 0
      rows = (tot + colsmax - 1) / colsmax
      cn = (tot + rows - 1) / rows
    end
    self.inner = inner
    self.pitch = pitch
    self.cn = cn
    self.ox = (width() - (cn * pitch - 1)) / 2
    self.oy = (height() - 1 - (rows * pitch - 1)) / 2
    self.pending = tot - nd
    self.cols = cols
    self.done = done
    self.failed = false
    self.loaded = true
    self.age = 0
    self.loop_colors()
  end

  # Once a second, also while hidden: the day, the next refresh, and the color of every square.
  def loop()
    self.age += 1
    self.ticks -= 1
    if self.ticks <= 0
      self.ticks = store.get("every") * 60
      self.fetch()
    end
    self.loop_colors()
  end

  def loop_colors()
    var f = 0.0
    var hr = hour()
    if hr >= 0
      var now_h = hr + minute() / 60.0 + second() / 3600.0
      var s = store.get("start")
      f = (now_h - s) / (24.0 - s)
      if f < 0.0
        f = 0.0
      end
      if f > 1.0
        f = 1.0
      end
    end
    self.frac = f
    var k = f * f * 0.95
    var pcol = []
    if size(self.cols) > 0
      for i : 0 .. size(self.cols) - 1
        var c = self.cols[i]
        if self.done[i]
          pcol.push(0x167838)
        else
          pcol.push(rgb(int(c[0] + (255 - c[0]) * k), int(c[1] + (32 - c[1]) * k), int(c[2] + (20 - c[2]) * k)))
        end
      end
    end
    self.pcol = pcol
  end

  # Coming back on screen: if the data is older than half a minute, refresh now.
  def on_show()
    if self.age > 30
      self.ticks = 0
    end
  end

  # Nothing pending (or nothing received yet): the rotation skips this app.
  def should_show()
    return self.loaded && self.pending > 0
  end

  def draw()
    clear()
    var n = size(self.pcol)
    if n > size(self.cols)
      n = size(self.cols)
    end
    var tk = self.inner == 6 ? self.tick6 : self.tick4
    if n > 0
      for i : 0 .. n - 1
        var x = self.ox + (i % self.cn) * self.pitch
        var y = self.oy + (i / self.cn) * self.pitch
        rect_fill(x, y, self.inner, self.inner, self.pcol[i])
        if self.done[i]
          for p : tk
            pixel(x + p[0], y + p[1], 0xEBFFF0)
          end
        end
      end
    end

    # The bar of the day on the last row, with the current moment blinking.
    var by = height() - 1
    var w = int(width() * self.frac)
    rect_fill(0, by, width(), 1, 0x300C0A)
    if w > 0
      rect_fill(0, by, w, 1, 0xFF2014)
    end
    if w > width() - 1
      w = width() - 1
    end
    pixel(w, by, (now_ms() % 1200) < 600 ? 0xFFC8BE : 0x6E1F18)

    # Top-right corner: dim gray when the last refresh failed or is old.
    if self.failed || self.age > store.get("every") * 60 * 3
      pixel(width() - 1, 0, 0x555555)
    end
  end
end

return Habits()
