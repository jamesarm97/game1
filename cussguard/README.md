# CussGuard 🎬🔇

An ESP32 gadget that **mutes cuss words on your TV automatically** by syncing to
an uploaded subtitle (`.srt`) file and blasting your TV's **IR mute** a beat
before each flagged word — then un-muting right after.

It has no idea what's actually playing on screen, so it works like a *sequencer*:
you press **Play** in time with the movie, and a rotary dial / `+‑` buttons let
you keep it locked in. **Pause** freezes the timeline for commercial breaks.

> Built for personal use with your own media. It only knows what's in the SRT you
> give it; it does not analyze the TV's audio or video.

---

## What it does

- 📤 **Upload an SRT** over Wi-Fi (the device hosts its own web page).
- 🔎 **Scans ahead** for banned words, estimating each word's timing *within* its
  subtitle cue, and builds tight mute/unmute windows (with pre/post-roll).
- 📺 **Learns your TV remote** — no brand database needed. Capture MUTE (and
  optionally VOL±) once with an IR receiver; it replays them with an IR LED.
- 🎚️ **Manual sync** with a rotary encoder or on-screen `±100ms / ±250ms / ±1s`.
- ⏸️ **Commercial pause** via the encoder's push-button or the web UI.
- 🖥️ **OLED** shows the clock, offset, mute state, and a countdown to the next
  flagged word so you can pre-nudge.
- ✏️ **Editable word list** with whole-word matching + basic leetspeak handling.

---

## Bill of materials (~$15–25)

| Qty | Part | Notes |
|----|------|-------|
| 1 | ESP32 dev board (WROOM-32) | brains + Wi-Fi AP + web UI |
| 1 | IR LED, 940 nm | the "blaster" that talks to the TV |
| 1 | NPN transistor (2N2222 / 2N3904 / S8050) | drives the IR LED from a GPIO |
| 1 | Resistor 100 Ω (LED) + 1 kΩ (transistor base) | current limit / base |
| 1 | TSOP38238 (or VS1838B) IR receiver | **learns** your remote's codes |
| 1 | SSD1306 OLED 128×64, I²C | status display (optional but handy) |
| 1 | KY-040 rotary encoder | scrub timing; push = play/pause |
| 2 | momentary push buttons | optional `−`/`+` nudge (parallel to UI) |
| — | breadboard, jumpers, USB cable | |

See [`docs/wiring.md`](docs/wiring.md) for the full pin map and driver circuit.

---

## Build & flash (PlatformIO)

```bash
# from the cussguard/ folder
pio run                 # compile firmware
pio run -t upload       # flash the ESP32
pio run -t uploadfs     # flash the web UI + starter word list (the data/ folder)
pio device monitor      # watch serial (115200)
```

`pio run -t uploadfs` is **required** — it writes `data/index.html` and
`data/wordlist.txt` into the ESP32's LittleFS partition. Re-run it whenever you
change files under `data/`.

## First run

1. On your phone/laptop, join Wi-Fi **`CussGuard`** (password `mutethetv`).
2. Browse to **http://192.168.4.1/**
3. **Learn your remote**: tap *Learn MUTE*, aim your TV remote at the receiver,
   press Mute. (Optionally learn VOL± for the alternative "volume-to-zero" mode.)
4. **Upload** the movie's `.srt`. It scans instantly and shows how many mute
   events it found.
5. Start the movie. Press **Play** on CussGuard the instant the first spoken line
   begins, then fine-tune with the dial / nudge buttons until the on-screen
   "next flag" countdown lines up with reality.

---

## Tuning & gotchas (read this)

- **Mute is usually a *toggle*.** CussGuard tracks the assumed mute state so it
  won't double-send. If the TV and the app disagree (e.g. you muted manually),
  hit **"TV is un-muted (resync)"**. Or switch **Mute method → Volume to zero**,
  which is idempotent (ramps volume down then back up) and can't get out of sync.
- **Drift.** `millis()` and the TV are independent clocks; expect to nudge over a
  long movie. Different rips also have different offsets — that's what the dial is
  for. Set it once at the first line; you'll rarely touch it after.
- **Pre-roll / post-roll.** Defaults mute 250 ms *before* and hold 200 ms *after*
  the word to cover IR latency and loose subtitle timing. Increase pre-roll if a
  word leaks through; decrease if too much dialogue gets clipped.
- **In-cue timing is estimated** from each word's character position within its
  subtitle line — good enough for single words, and adjacent hits are merged so
  the TV isn't rapid-toggled.
- **IR range/aim.** Point the LED at the TV's IR window. Drive it through the
  transistor (never straight off a GPIO) for usable range.

---

## Project layout

```
cussguard/
├── platformio.ini        # deps + build config
├── src/
│   ├── main.cpp           # setup/loop: encoder, buttons, OLED, ticking
│   ├── config.h           # pin map + defaults
│   ├── srt.*              # SRT parser
│   ├── profanity.*        # word matching -> mute events
│   ├── ir.*               # learn/send IR, mute-state tracking
│   ├── playback.*         # the SRT clock + offset + IR triggering
│   ├── app.*              # settings + pipeline glue + status JSON
│   ├── oled.*             # SSD1306 status screen
│   └── webui.*            # async web server + REST API
├── data/                  # LittleFS: web UI + starter word list
│   ├── index.html
│   └── wordlist.txt
└── docs/
    ├── wiring.md
    └── sample.srt         # tiny test subtitle
```

## HTTP API (for tinkering)

| Method | Path | Purpose |
|--------|------|---------|
| GET  | `/api/status` | full JSON state (polled by the UI) |
| POST | `/api/control?cmd=play\|pause\|toggle\|stop` | transport |
| POST | `/api/nudge?ms=±N` / `/api/offset?ms=N` / `/api/seek?ms=N` | timing |
| POST | `/api/learn?name=mute\|volup\|voldown\|cancel` | IR learning |
| POST | `/api/mute?on=1\|0` / `/api/resync?muted=1\|0` | direct mute control |
| GET/POST | `/api/wordlist` | get/replace the word list (text body) |
| POST | `/api/settings` | JSON `{preroll,postroll,mergeGap,method,volSteps}` |
| POST | `/api/upload` | multipart SRT upload |
