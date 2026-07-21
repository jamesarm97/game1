#include <Arduino.h>
#include <LittleFS.h>
#include <ESP32Encoder.h>
#include "config.h"
#include "app.h"
#include "ir.h"
#include "playback.h"
#include "oled.h"
#include "webui.h"

ESP32Encoder encoder;
int64_t g_lastEnc = 0;

uint32_t g_lastRender = 0;

// Simple active-low debounce helper.
struct Button {
  uint8_t pin; bool last = true; uint32_t tLast = 0;
  void begin(uint8_t p) { pin = p; pinMode(p, INPUT_PULLUP); }
  bool pressed() {
    bool s = digitalRead(pin);
    uint32_t now = millis();
    if (s != last && now - tLast > 30) {
      tLast = now; last = s;
      if (s == LOW) return true;   // falling edge = press
    }
    return false;
  }
};
Button btnMinus, btnPlus, btnEnc;

void setup() {
  Serial.begin(115200);
  delay(200);

  if (!LittleFS.begin(true)) {
    Serial.println("LittleFS mount failed");
  }

  ir::begin();
  app::begin();
  oled::begin();
  webui::begin();

  // KY-040 breakout boards include their own pull-ups, so we don't touch the
  // library's internal-pull setting (its enum name differs across versions).
  encoder.attachHalfQuad(PIN_ENC_A, PIN_ENC_B);
  encoder.clearCount();
  g_lastEnc = 0;

  btnMinus.begin(PIN_BTN_MINUS);
  btnPlus.begin(PIN_BTN_PLUS);
  btnEnc.begin(PIN_ENC_SW);

  Serial.print("AP up. Join \"");
  Serial.print(AP_SSID);
  Serial.println("\" then browse http://192.168.4.1/");
}

void loop() {
  ir::poll();          // capture IR while learning
  playback::tick();    // drive mute/unmute

  // Rotary encoder -> scrub timing offset (one detent per NUDGE_STEP_MS).
  int64_t enc = encoder.getCount() / 2;   // half-quad -> detents
  if (enc != g_lastEnc) {
    int32_t delta = (int32_t)(enc - g_lastEnc);
    g_lastEnc = enc;
    playback::nudge(delta * NUDGE_STEP_MS);
  }

  // Encoder push = play/pause (fast commercial pause).
  if (btnEnc.pressed()) playback::toggle();
  if (btnMinus.pressed()) playback::nudge(-NUDGE_STEP_MS);
  if (btnPlus.pressed())  playback::nudge(+NUDGE_STEP_MS);

  // Refresh display ~8 Hz.
  uint32_t now = millis();
  if (now - g_lastRender > 120) { g_lastRender = now; oled::render(); }
}
