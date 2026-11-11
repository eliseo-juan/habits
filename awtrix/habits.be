# @name    Habits
# @desc    Today's habits: done in green with a check, pending in their color turning red, and a bar for the day
# @author  eliseo-juan
# @version 1.0
# @config  topic text   "MQTT topic"  default="habits/today"
# @config  start number "Day starts"  default=7 min=0 max=12 unit=h help="The bar fills from this hour to midnight"

# Draws the habits Home Assistant publishes (retained JSON) on the 52x16 display:
#   {"habits": [{"color": [r, g, b], "done": false}, ...]}
# The app only takes a turn in the rotation while something is still pending.

import json

class Habits
  var cols      # [[r, g, b], ...] one entry per habit, done habits first
  var done      # [bool, ...] same order
  var pcol      # the color each cell is painted in, rebuilt once a second
  var pending   # how many habits are still to do
  var frac      # how much of the day has passed, 0.0 to 1.0
  var inner, pitch, cn, ox, oy      # layout of the squares
  var tick6, tick4                  # the check mark, for 6 px and 4 px squares

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
  end

  def setup()
    mqtt.subscribe(store.get("topic"), / t, p -> self.on_msg(p))
    self.loop()
  end

  # A new list of habits arrived: keep it, done ones first, and work out the layout.
  def on_msg(payload)
    var habits_in = nil
    try
      var data = json.load(payload)
      if data != nil
        habits_in = data.find("habits")
      end
    except .. as err, msg
      log(msg)
    end
    var dcols = []
    var pcols = []
    if habits_in != nil
      for h : habits_in
        var c = h.find("color", [255, 90, 95])
        if h.find("done", false)
          dcols.push(c)
        else
          pcols.push(c)
        end
      end
    end
    var cols = []
    var done = []
    for c : dcols
      if size(cols) < 30
        cols.push(c)
        done.push(true)
      end
    end
    for c : pcols
      if size(cols) < 30
        cols.push(c)
        done.push(false)
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
    self.pending = size(pcols)
    self.cols = cols
    self.done = done
    self.loop()
  end

  # Once a second, also while hidden: how far the day is, and the color of every square.
  def loop()
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

  # Nothing pending: the rotation skips this app.
  def should_show()
    return self.pending > 0
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
  end
end

return Habits()
