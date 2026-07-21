#include <M5Dial.h>
#include <LittleFS.h>
#include "config.h"
#include "app.h"
#include "ir.h"
#include "playback.h"
#include "screen.h"
#include "webui.h"

long     g_lastEnc = 0;      // last raw encoder count
int32_t  g_encAccum = 0;     // leftover counts toward the next nudge step
uint32_t g_pressStart = 0;   // dial-button press timestamp
uint32_t g_lastRender = 0;

void setup() {
  auto cfg = M5.config();
  // enableEncoder = true, enableRFID = false
  M5Dial.begin(cfg, true, false);

  Serial.begin(115200);
  delay(150);

  if (!LittleFS.begin(true)) {
    Serial.println("LittleFS mount failed");
  }

  ir::begin();
  app::begin();
  screen::begin();
  webui::begin();

  g_lastEnc = M5Dial.Encoder.read();

  Serial.print("AP up. Join \"");
  Serial.print(AP_SSID);
  Serial.println("\" then browse http://192.168.4.1/");
}

void loop() {
  M5Dial.update();     // refresh encoder + button state
  ir::poll();          // capture IR while learning
  playback::tick();    // drive mute/unmute

  // ── Rotary dial -> scrub the timing offset ──
  long enc = M5Dial.Encoder.read();
  if (enc != g_lastEnc) {
    g_encAccum += (int32_t)(enc - g_lastEnc);
    g_lastEnc = enc;
    while (g_encAccum >= ENC_COUNTS_PER_STEP)  { playback::nudge(+NUDGE_STEP_MS); g_encAccum -= ENC_COUNTS_PER_STEP; }
    while (g_encAccum <= -ENC_COUNTS_PER_STEP) { playback::nudge(-NUDGE_STEP_MS); g_encAccum += ENC_COUNTS_PER_STEP; }
  }

  // ── Dial push button: short press = play/pause, long press = stop ──
  if (M5Dial.BtnA.wasPressed()) g_pressStart = millis();
  if (M5Dial.BtnA.wasReleased()) {
    uint32_t held = millis() - g_pressStart;
    bool longPress = held >= LONGPRESS_MS;
    if (longPress) playback::stop();
    else           playback::toggle();
    M5.Speaker.tone(longPress ? 600 : 900, 40);  // click feedback
  }

  // ── Refresh the round display ~8 Hz ──
  uint32_t now = millis();
  if (now - g_lastRender > 120) { g_lastRender = now; screen::render(); }
}
