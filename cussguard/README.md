# CussGuard — M5Dial edition 🎬🔇

An **M5Stack Dial** gadget that **mutes cuss words on your TV automatically** by
syncing to an uploaded subtitle (`.srt`) file and blasting your TV's **IR mute**
a beat before each flagged word — then un-muting right after.

It has no idea what's actually playing on screen, so it works like a *sequencer*:
you press **Play** in time with the movie, then use the **built-in dial** to keep
it locked in. **Pressing the dial** pauses for commercial breaks.

> This is the M5Dial port of CussGuard. The generic breadboard-ESP32 version
> lives on the `claude/esp32-profanity-ir-mute-kw9c99` branch. It only knows
> what's in the SRT you give it; it does not analyze the TV's audio or video.

---

## Why the M5Dial is a perfect fit

The [M5Dial](https://docs.m5stack.com/en/core/M5Dial) is an ESP32-S3 with a
**rotary encoder, a round 240×240 LCD, and a pressable dial button all built in**
— exactly the three controls this project needs. So there's almost nothing to
wire: the only external parts are the IR transmit/receive on Grove **Port B**.

| Control | Built-in M5Dial hardware |
|---|---|
| Scrub timing (±100 ms/detent) | **rotary dial** |
| Play / Pause (commercial break) | **short press** the dial |
| Stop | **long press** (≥0.8 s) the dial |
| Status: clock, offset, MUTE, next-word ETA | **round LCD** |
| Upload SRT, edit words, learn remote | **Wi-Fi web UI** (phone/laptop) |

---

## Wiring — just the IR parts

Everything else is on-board. Use the black **Port B** connector (`G2`, `G1`):

| Signal | M5Dial pin | Connects to |
|---|---|---|
| IR transmit | **G2** | transistor base → IR LED |
| IR receive  | **G1** | TSOP38238 receiver OUT |
| 5V / GND | Port B 5V / GND | power the IR parts |

```
        5V ──┬──[IR LED]──[100Ω]──┐
             │                     C
   G2 ─[1kΩ]─┼───────────────── base  NPN (2N2222/2N3904)
             │                     E ── GND
   G1 ───────── TSOP38238 OUT   (VCC→5V/3V3, GND→GND)
```

Don't drive the IR LED straight from G2 — use the transistor for range. Full
detail (and the M5Dial Grove pinout) is in [`docs/wiring.md`](docs/wiring.md).

### Bill of materials (~$45 total)

| Qty | Part | Notes |
|----|------|-------|
| 1 | **M5Stack Dial** | ESP32-S3 + encoder + round LCD + button + Wi-Fi |
| 1 | IR LED, 940 nm | the "blaster" |
| 1 | NPN transistor (2N2222 / 2N3904 / S8050) | drives the IR LED |
| 1 | 100 Ω + 1 kΩ resistors | LED limit / transistor base |
| 1 | TSOP38238 (or VS1838B) IR receiver | learns your remote |
| — | a Grove cable to break out Port B | or solder to the HY2.0-4P pins |

---

## Build & flash (PlatformIO)

```bash
# from the cussguard/ folder
pio run                 # compile firmware
pio run -t upload       # flash the M5Dial (USB-C)
pio run -t uploadfs     # flash the web UI + starter word list (data/)
pio device monitor      # serial @ 115200
```

`pio run -t uploadfs` is **required** — it writes `data/index.html` and
`data/wordlist.txt` into LittleFS. Re-run it whenever you change files in `data/`.

The board is `m5stack-stamps3` (the M5Dial's module). The `M5Dial` library pulls
in `M5Unified` + `M5GFX` automatically.

## First run

1. Power the Dial. The LCD shows **"join wifi: CussGuard"**.
2. On your phone/laptop, join Wi-Fi **`CussGuard`** (password `mutethetv`) and
   browse to **http://192.168.4.1/**
3. **Learn your remote**: tap *Learn MUTE*, aim your TV remote at the receiver on
   Port B, press Mute. (Optionally learn VOL± for "volume-to-zero" mode.)
4. **Upload** the movie's `.srt`. It scans instantly and reports the mute count.
5. Start the movie. **Press the dial** the instant the first line is spoken, then
   **turn the dial** until the LCD's "next flag" countdown matches reality.

---

## Tuning & gotchas (read this)

- **Mute is usually a *toggle*.** CussGuard tracks the assumed mute state so it
  won't double-send. If the TV and app disagree, hit **"TV is un-muted (resync)"**
  in the web UI, or switch **Mute method → Volume to zero** (idempotent).
- **Drift.** `millis()` and the TV are independent clocks; expect to nudge over a
  long movie. The dial makes that a one-second twist. Different rips also start at
  different offsets — set it once at the first line.
- **Pre-roll / post-roll.** Defaults mute 250 ms before and hold 200 ms after each
  word. Increase pre-roll if a word leaks; decrease if dialogue gets clipped.
- **In-cue timing is estimated** from each word's character position within its
  subtitle line; adjacent hits are merged so the TV isn't rapid-toggled.
- **Encoder feel.** If scrubbing is too coarse/fine, tweak `ENC_COUNTS_PER_STEP`
  in `src/config.h`.

---

## Project layout

```
cussguard/
├── platformio.ini        # M5Dial (m5stack-stamps3) + libs
├── src/
│   ├── main.cpp           # M5Dial.begin/update: encoder, button, render loop
│   ├── config.h           # IR pins (G2/G1) + tunable defaults
│   ├── srt.*              # SRT parser
│   ├── profanity.*        # word matching -> mute events
│   ├── ir.*               # learn/send IR, mute-state tracking
│   ├── playback.*         # the SRT clock + offset + IR triggering
│   ├── app.*              # settings + pipeline glue + status JSON
│   ├── screen.*           # round 240x240 LCD UI (M5GFX canvas)
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
