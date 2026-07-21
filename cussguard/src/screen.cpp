#include "screen.h"
#include <M5Dial.h>
#include "playback.h"
#include "app.h"

// Round 240x240 GC9A01 UI for the M5Dial. We render into a full-screen canvas
// and push it in one shot to avoid flicker (the pattern M5Dial examples use).
// If the sprite can't be allocated we fall back to drawing directly.

namespace {
const int CX = 120, CY = 120;
M5Canvas canvas(&M5Dial.Display);
bool g_haveCanvas = false;

String fmt(uint32_t ms) {
  uint32_t s = ms / 1000;
  char b[16];
  snprintf(b, sizeof(b), "%u:%02u:%02u", s / 3600, (s / 60) % 60, s % 60);
  return String(b);
}

// Draw the whole UI into `g` (canvas or the live display).
template <typename GFX>
void draw(GFX& g) {
  const bool muted = playback::muted();
  const uint16_t bg     = muted ? g.color565(70, 8, 12) : g.color565(10, 12, 26);
  const uint16_t accent = muted ? g.color565(255, 91, 110) : g.color565(91, 140, 255);
  const uint16_t dim    = g.color565(120, 130, 160);
  const uint16_t track  = g.color565(34, 40, 66);

  g.fillScreen(bg);

  // Progress ring (starts at top, clockwise).
  uint32_t pos = playback::positionMs();
  uint32_t dur = app::srtDurationMs();
  float frac = (dur > 0) ? (float)pos / (float)dur : 0.f;
  if (frac > 1.f) frac = 1.f;
  g.fillArc(CX, CY, 118, 108, 0, 360, track);
  if (frac > 0.f) g.fillArc(CX, CY, 118, 108, 270, 270 + (int)(frac * 360), accent);

  g.setTextDatum(middle_center);

  // Top: state, or a bold MUTED banner.
  if (muted) {
    g.setTextColor(accent);
    g.setFont(&fonts::FreeSansBold12pt7b);
    g.drawString("MUTED", CX, 40);
  } else {
    const char* st = playback::state() == PB_PLAYING ? "PLAY"
                   : playback::state() == PB_PAUSED  ? "PAUSE" : "STOP";
    g.setTextColor(dim);
    g.setFont(&fonts::FreeSansBold9pt7b);
    g.drawString(st, CX, 40);
  }

  // Center: big clock.
  g.setTextColor(TFT_WHITE);
  g.setFont(&fonts::FreeSansBold18pt7b);
  g.drawString(fmt(pos), CX, CY - 6);

  // Just under the clock: total duration.
  g.setTextColor(dim);
  g.setFont(&fonts::FreeSansBold9pt7b);
  g.drawString("of " + fmt(dur), CX, CY + 24);

  // Offset readout.
  int32_t off = playback::offset();
  String os = "offset " + String(off >= 0 ? "+" : "") + String(off) + "ms";
  g.setFont(&fonts::Font2);
  g.drawString(os, CX, CY + 50);

  // Bottom: next flagged word + ETA countdown.
  const MuteEvent* nx = playback::nextEvent();
  g.setFont(&fonts::Font2);
  if (nx) {
    int64_t eta = (int64_t)nx->mute_at - (int64_t)pos;
    String w = nx->word; if (w.length() > 16) w = w.substring(0, 16);
    g.setTextColor(accent);
    g.drawString("\"" + w + "\"", CX, 196);
    g.setTextColor(dim);
    String e = (eta >= 0) ? ("in " + String(eta / 1000.0, 1) + "s") : "now";
    g.drawString(e, CX, 214);
  } else {
    g.setTextColor(dim);
    g.drawString(playback::eventCount() ? "no more flags" : "upload an SRT", CX, 200);
  }
}
}  // namespace

namespace screen {

void begin() {
  M5Dial.Display.setBrightness(180);
  M5Dial.Display.fillScreen(TFT_BLACK);
  // Try a 16-bit full-screen sprite; the S3 StampS3 has enough SRAM for it.
  canvas.setColorDepth(16);
  g_haveCanvas = canvas.createSprite(240, 240) != nullptr;

  auto& d = M5Dial.Display;
  d.setTextDatum(middle_center);
  d.setTextColor(TFT_WHITE);
  d.setFont(&fonts::FreeSansBold12pt7b);
  d.drawString("CussGuard", CX, CY - 14);
  d.setFont(&fonts::Font2);
  d.setTextColor(d.color565(120, 130, 160));
  d.drawString("join wifi: CussGuard", CX, CY + 14);
}

void toast(const char* msg) {
  auto& d = M5Dial.Display;
  d.fillScreen(TFT_BLACK);
  d.setTextDatum(middle_center);
  d.setTextColor(TFT_WHITE);
  d.setFont(&fonts::FreeSansBold9pt7b);
  d.drawString(msg, CX, CY);
}

void render() {
  if (g_haveCanvas) {
    draw(canvas);
    canvas.pushSprite(0, 0);
  } else {
    draw(M5Dial.Display);
  }
}

}  // namespace screen
