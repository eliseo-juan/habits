# @name    Habits
# @desc    Today's habits from your Habits server: each in its own color, done ones dimmed with a check, pending ones turning red, and a bar for the day. Mark them with the buttons
# @author  eliseo-juan
# @version 3.0
# @needs   secret
# @secret  token hosts=habits.example.com label="Habits token" help="A write token: habits create-token EMAIL --name awtrix --scope write"
# @config  url   text   "Habits server"  default="https://habits.example.com" help="Address of the server, without a trailing slash"
# @config  every number "Refresh"        default=2 min=1 max=60 unit=min
# @config  start number "Day starts"     default=7 min=0 max=12 unit=h help="The bar fills from this hour to midnight"

# Pulls GET <url>/awtrix/today every few minutes and draws it on the 52x16 display. The server already
# leaves out limit habits and returns the pending and the done habits with their color.
# Set the server address and the token in the app's settings (the gear on its row under Apps). The
# token is only sent to the hosts listed in the @secret line above, so put your server's host there.
# The app only takes its turn in the rotation while something is pending.
#
# While the app is shown, any button brings up a cursor on the first pending habit: left and right
# move it, and one press past either end hides it. A short press on select marks the habit done or
# not done. Each press keeps the app on screen for another 30 s. The cursor is gone the next time
# the app appears.

import json
import secret

class Habits
  var ids       # [id, ...] one entry per habit, done habits first
  var cols      # [[r, g, b], ...] same order
  var done      # [bool, ...] same order
  var pcol      # the color each cell is painted in, rebuilt once a second
  var pending   # how many habits are still to do
  var day       # the user's day the data is for, "YYYY-MM-DD", as the server says
  var frac      # how much of the day has passed, 0.0 to 1.0
  var inner, pitch, cn, ox, oy      # layout of the squares
  var tick6, tick4                  # the check mark, for 6 px and 4 px squares
  var pal, hexmap                   # fallback colors, hex digits
  var ticks, age, busy, loaded, failed
  var cursor    # index of the habit under the cursor, -1 while hidden
  var armed     # the select press going on may toggle on release
  var awake     # the rotation is paused until `until`
  var until     # now_ms() at which the app lets the rotation go on
  var gen       # bumped on every mark, so an answer fetched before it is not drawn
  var err_id, err_until             # the habit whose mark failed, blinking red until then

  def init()
    self.ids = []
    self.cols = []
    self.done = []
    self.pcol = []
    self.pending = 0
    self.day = nil
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
    self.cursor = -1
    self.armed = false
    self.awake = false
    self.until = 0
    self.gen = 0
    self.err_id = nil
    self.err_until = 0
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

  def index_of(lst, v)
    var i = 0
    while i < size(lst)
      if lst[i] == v
        return i
      end
      i += 1
    end
    return nil
  end

  def headers()
    return {'Authorization': "Bearer {secret:token}", 'Accept': "application/json",
            'Content-Type': "application/json"}
  end

  def fetch()
    if self.busy
      return
    end
    var url = store.get("url") + "/awtrix/today"
    if !secret.allows('token', url)
      self.failed = true
      self.ticks = 30                     # the key may be entered any moment
      return
    end
    self.busy = true
    var g = self.gen
    http.get(url, / b, st -> self.on_body(b, st, g), {'headers': self.headers(), 'timeout': 10})
  end

  def on_body(body, status, g)
    self.busy = false
    if g != self.gen
      self.ticks = 0                      # fetched before a mark landed: ask again
      return
    end
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

    var ids = []
    var cols = []
    var done = []
    var dh = data.find("done_habits")
    if isinstance(dh, list)
      for h : dh
        if size(cols) < 30
          ids.push(h.find("id"))
          cols.push(self.color_of(h.find("color"), h.find("id", 0)))
          done.push(true)
        end
      end
    else
      # an older server only counts them: show those in green
      var cnt = data.find("done", 0)
      if cnt > 30
        cnt = 30
      end
      if cnt > 0
        for i : 0 .. cnt - 1
          ids.push(nil)
          cols.push([34, 197, 94])
          done.push(true)
        end
      end
    end
    var ph = data.find("pending_habits", [])
    if isinstance(ph, list)
      for h : ph
        if size(cols) < 30
          ids.push(h.find("id"))
          cols.push(self.color_of(h.find("color"), h.find("id", 0)))
          done.push(false)
        end
      end
    end

    var tot = size(cols)
    if self.cursor >= 0 && tot > 0
      # Keep the squares where they are while someone is moving the cursor over them.
      var at = self.ids[self.cursor]
      var order = []
      for old : self.ids
        var j = self.index_of(ids, old)
        if j != nil && old != nil
          order.push(j)
        end
      end
      for j : 0 .. tot - 1
        if self.index_of(order, j) == nil
          order.push(j)
        end
      end
      var oi = []
      var oc = []
      var od = []
      for j : order
        oi.push(ids[j])
        oc.push(cols[j])
        od.push(done[j])
      end
      ids = oi
      cols = oc
      done = od
      var c = self.index_of(ids, at)
      self.cursor = c != nil ? c : (self.cursor < tot ? self.cursor : tot - 1)
    elif tot == 0
      self.cursor = -1
    end

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
    self.ids = ids
    self.cols = cols
    self.done = done
    self.day = data.find("date")
    self.failed = false
    self.loaded = true
    self.age = 0
    self.recount()
  end

  def recount()
    var p = 0
    for d : self.done
      if !d
        p += 1
      end
    end
    self.pending = p
    self.loop_colors()
  end

  # Once a second, also while hidden: the day, the next refresh, the hold on the rotation, and the
  # color of every square.
  def loop()
    self.age += 1
    self.ticks -= 1
    if self.ticks <= 0
      self.ticks = store.get("every") * 60
      self.fetch()
    end
    if self.awake
      if now_ms() >= self.until
        self.awake = false
        rotation.resume()
      else
        rotation.pause()                  # a user's button press can end a pause: hold it again
      end
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
          pcol.push(rgb(int(c[0] * 0.45), int(c[1] * 0.45), int(c[2] * 0.45)))   # dimmer than pending
        else
          pcol.push(rgb(int(c[0] + (255 - c[0]) * k), int(c[1] + (32 - c[1]) * k), int(c[2] + (20 - c[2]) * k)))
        end
      end
    end
    self.pcol = pcol
  end

  def first_pending()
    var i = 0
    while i < size(self.done)
      if !self.done[i]
        return i
      end
      i += 1
    end
    return 0
  end

  def keep_awake()
    self.until = now_ms() + 30000
    self.awake = true
    rotation.pause()
  end

  def release()
    if self.awake
      self.awake = false
      rotation.resume()
    end
  end

  # A press past either end hides the cursor and lets the rotation go on; holding stops at the end.
  def move(btn, held)
    var c = self.cursor + (btn == "right" ? 1 : -1)
    if c >= 0 && c < size(self.cols)
      self.cursor = c
    elif !held
      self.cursor = -1
      self.armed = false
      self.release()
    end
  end

  # Optimistic: the square flips at once, and goes back with a red blink if the server says no.
  def toggle(i)
    var id = self.ids[i]
    if id == nil || self.day == nil
      return
    end
    var was = self.done[i]
    self.done[i] = !was
    self.gen += 1
    self.recount()
    var url = store.get("url") + "/habits/" + str(id) + "/logs/" + self.day
    var opts = {'headers': self.headers(), 'timeout': 10}
    var cb = / b, st -> self.on_write(id, was, st)
    if was
      http.delete(url, cb, opts)
    else
      http.post(url + "/done", '{"count":1}', cb, opts)
    end
  end

  def on_write(id, was, status)
    var ok = (status >= 200 && status < 300) || (was && status == 404)
    if !ok
      var i = self.index_of(self.ids, id)
      if i != nil
        self.done[i] = was
        self.recount()
      end
      self.err_id = id
      self.err_until = now_ms() + 1500
    end
    self.fetch()
  end

  # Left and right move on press and while held; select toggles on release, which only comes for a
  # short press because holding select opens the clock's menu. The press that brings up the cursor
  # does nothing else.
  def on_button_event(btn, event)
    if size(self.cols) == 0
      return false
    end
    if event == "press"
      self.keep_awake()
      if self.cursor < 0
        self.cursor = self.first_pending()
        self.armed = false
        return true
      end
      self.armed = true
      if btn != "select"
        self.move(btn, false)
      end
      return true
    end
    if !self.armed
      return true
    end
    if event == "repeat"
      self.keep_awake()
      self.move(btn, true)
    elif event == "release" && btn == "select"
      self.toggle(self.cursor)
    end
    return true
  end

  # Coming back on screen: if the data is older than half a minute, refresh now.
  def on_show()
    self.cursor = -1
    if self.age > 30
      self.ticks = 0
    end
  end

  def on_hide()
    self.cursor = -1
    self.armed = false
    self.release()
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
    var t = now_ms()
    if n > 0
      for i : 0 .. n - 1
        var x = self.ox + (i % self.cn) * self.pitch
        var y = self.oy + (i / self.cn) * self.pitch
        var c = self.pcol[i]
        if self.ids[i] != nil && self.ids[i] == self.err_id && t < self.err_until && (t % 300) < 150
          c = 0xFF0000
        end
        rect_fill(x, y, self.inner, self.inner, c)
        if self.done[i]
          for p : tk
            pixel(x + p[0], y + p[1], 0xEBFFF0)
          end
        end
      end
      if self.cursor >= 0 && self.cursor < n
        var cx = self.ox + (self.cursor % self.cn) * self.pitch
        var cy = self.oy + (self.cursor / self.cn) * self.pitch
        rect(cx - 1, cy - 1, self.inner + 2, self.inner + 2, 0xFFFFFF)
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
