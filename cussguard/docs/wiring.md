# CussGuard wiring

All pins are configurable in [`src/config.h`](../src/config.h). Defaults below.

## Pin map

| Function | ESP32 GPIO | Connects to |
|---|---|---|
| IR LED drive | **GPIO 4** | transistor base (via 1 kΩ) |
| IR receiver out | **GPIO 15** | TSOP38238 OUT |
| OLED SDA | **GPIO 21** | SSD1306 SDA |
| OLED SCL | **GPIO 22** | SSD1306 SCL |
| Encoder CLK | **GPIO 32** | KY-040 CLK |
| Encoder DT | **GPIO 33** | KY-040 DT |
| Encoder SW | **GPIO 27** | KY-040 SW (push = play/pause) |
| Nudge − | **GPIO 25** | button to GND |
| Nudge + | **GPIO 26** | button to GND |

Buttons and the encoder switch use the ESP32's internal pull-ups — wire the other
side to **GND** (active-low). No external resistors needed for those.

## IR LED driver (do NOT drive the LED straight from a GPIO)

A GPIO can't source enough current for decent range. Use an NPN transistor as a
low-side switch:

```
                 +3V3 (or +5V from USB, see note)
                   │
                 [IR LED]  (940 nm)
                   │
                 [100 Ω]
                   │
   GPIO4 ─[1kΩ]─ base
                   │  NPN (2N2222 / 2N3904 / S8050)
   collector ──────┘
   emitter ─────── GND
```

- **Anode** of the IR LED → +V, **cathode** → 100 Ω → transistor **collector**.
- Transistor **emitter** → GND. **Base** → 1 kΩ → **GPIO4**.
- For more range, power the LED from **+5V (VIN/USB)** instead of 3V3; the
  transistor happily switches it while the base stays at 3.3 V logic.

## IR receiver (TSOP38238 / VS1838B)

Three pins: **OUT → GPIO15**, **VCC → 3V3**, **GND → GND**. A 100 nF cap across
VCC/GND close to the sensor improves reliability. Point it at your remote only
while *learning* codes; it's unused during normal playback.

## OLED (SSD1306 128×64, I²C)

**VCC → 3V3**, **GND → GND**, **SDA → GPIO21**, **SCL → GPIO22**. Address `0x3C`
(change `OLED_ADDR` if your module is `0x3D`).

## KY-040 rotary encoder

**CLK → GPIO32**, **DT → GPIO33**, **SW → GPIO27**, **+ → 3V3**, **GND → GND**.
Rotating scrubs the timing offset (±100 ms/detent); pressing toggles play/pause.

## Placement tip

Mount the IR LED where it has line-of-sight to the TV's IR window (front-bottom
on most sets). If range is marginal, add a second IR LED in series or aim it via
a small reflector.
