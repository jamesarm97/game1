# CussGuard (M5Dial) wiring

On the M5Dial the encoder, LCD and push-button are **built in** — nothing to
wire for those. The only external circuit is the IR blaster + receiver on the
Grove **Port B** connector. IR pins are set in [`src/config.h`](../src/config.h)
(`PIN_IR_SEND = 2`, `PIN_IR_RECV = 1`).

## M5Dial Grove Port B (HY2.0-4P, black)

| Port B pin | Signal |
|---|---|
| 1 | **5V** |
| 2 | **GND** |
| 3 | **G2** → IR transmit |
| 4 | **G1** → IR receive |

(Port A — the other connector — is `G13/G15` and is left unused.)

## IR LED driver (do NOT drive the LED straight from G2)

A GPIO can't source enough current for good range. Switch it with an NPN
transistor, powered from Port B's 5V:

```
        Port B 5V
            │
         [IR LED]  (940 nm)
            │
          [100 Ω]
            │
  G2 ─[1kΩ]─ base
            │  NPN (2N2222 / 2N3904 / S8050)
  collector ┘
  emitter ── Port B GND
```

- IR LED **anode** → 5V, **cathode** → 100 Ω → transistor **collector**.
- Transistor **emitter** → GND, **base** → 1 kΩ → **G2**.

## IR receiver (TSOP38238 / VS1838B)

- **OUT → G1**
- **VCC → 5V** (or 3V3; both work)
- **GND → GND**

A 100 nF cap across VCC/GND near the sensor improves reliability. It's only used
while *learning* codes; idle during playback.

## Placement tip

Point the IR LED at the TV's IR window (usually front-bottom). If range is
marginal, power the LED from 5V (as above) and/or add a second IR LED in series.

## Built-in controls (reference)

| Action | M5Dial |
|---|---|
| Scrub timing offset | rotate the dial (±100 ms/detent) |
| Play / Pause | short-press the dial |
| Stop | long-press the dial (≥0.8 s) |
| Status display | the round LCD |
