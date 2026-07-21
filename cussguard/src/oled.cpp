#include "oled.h"
#include "config.h"
#include "playback.h"
#include "app.h"
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>

namespace {
Adafruit_SSD1306 disp(128, 64, &Wire, -1);
bool g_ok = false;

String fmt(uint32_t ms) {
  uint32_t s = ms / 1000;
  char b[16]; snprintf(b, sizeof(b), "%u:%02u:%02u", s / 3600, (s / 60) % 60, s % 60);
  return String(b);
}
}  // namespace

namespace oled {

void begin() {
  Wire.begin(PIN_I2C_SDA, PIN_I2C_SCL);
  g_ok = disp.begin(SSD1306_SWITCHCAPVCC, OLED_ADDR);
  if (!g_ok) return;
  disp.clearDisplay();
  disp.setTextColor(SSD1306_WHITE);
  disp.setTextSize(1);
  disp.setCursor(0, 0);
  disp.println("CussGuard");
  disp.println("join wifi: CussGuard");
  disp.display();
}

void toast(const char* msg) {
  if (!g_ok) return;
  disp.clearDisplay();
  disp.setTextSize(1);
  disp.setCursor(0, 28);
  disp.println(msg);
  disp.display();
}

void render() {
  if (!g_ok) return;
  disp.clearDisplay();

  // Line 1: state + mute indicator
  disp.setTextSize(1);
  disp.setCursor(0, 0);
  const char* st = playback::state() == PB_PLAYING ? "PLAY"
                 : playback::state() == PB_PAUSED  ? "PAUSE" : "STOP";
  disp.print(st);
  if (playback::muted()) {
    disp.setCursor(92, 0);
    disp.print("[MUTE]");
  }

  // Big clock
  disp.setTextSize(2);
  disp.setCursor(0, 14);
  disp.print(fmt(playback::positionMs()));

  // Offset
  disp.setTextSize(1);
  disp.setCursor(0, 34);
  disp.print("off ");
  int32_t off = playback::offset();
  if (off >= 0) disp.print("+");
  disp.print(off);
  disp.print("ms");

  // Next flagged word + ETA
  const MuteEvent* nx = playback::nextEvent();
  disp.setCursor(0, 48);
  if (nx) {
    int64_t eta = (int64_t)nx->mute_at - (int64_t)playback::positionMs();
    disp.print("next ");
    if (eta >= 0) { disp.print(eta / 1000.0, 1); disp.print("s"); }
    else disp.print("--");
    disp.setCursor(0, 56);
    String w = nx->word; if (w.length() > 20) w = w.substring(0, 20);
    disp.print("\"" + w + "\"");
  } else {
    disp.print(playback::eventCount() ? "no more flags" : "no SRT loaded");
  }
  disp.display();
}

}  // namespace oled
