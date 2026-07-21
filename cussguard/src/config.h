#pragma once
#include <Arduino.h>

// ───────────────────────── Pin map (ESP32 WROOM-32) ─────────────────────────
// IR
static const uint8_t PIN_IR_SEND = 4;    // -> transistor base -> IR LED
static const uint8_t PIN_IR_RECV = 15;   // <- TSOP38238 output (for learning)

// OLED SSD1306 128x64 over I2C (default ESP32 I2C pins)
static const uint8_t PIN_I2C_SDA = 21;
static const uint8_t PIN_I2C_SCL = 22;
static const uint8_t OLED_ADDR   = 0x3C;

// Rotary encoder (KY-040) for scrubbing timing offset
static const uint8_t PIN_ENC_A   = 32;   // CLK
static const uint8_t PIN_ENC_B   = 33;   // DT
static const uint8_t PIN_ENC_SW  = 27;   // push button = play/pause (commercial pause)

// Optional discrete buttons (parallel to the web UI / encoder). Active-low.
static const uint8_t PIN_BTN_MINUS = 25; // nudge earlier
static const uint8_t PIN_BTN_PLUS  = 26; // nudge later

// ───────────────────────────── Wi-Fi (SoftAP) ──────────────────────────────
// The device hosts its own access point; join it, then browse to 192.168.4.1
static const char* AP_SSID = "CussGuard";
static const char* AP_PASS = "mutethetv";   // >= 8 chars

// ─────────────────────────────── Filesystem ────────────────────────────────
static const char* PATH_SRT      = "/current.srt";
static const char* PATH_WORDLIST = "/wordlist.txt";
static const char* PATH_IRCODES  = "/ir_codes.json";
static const char* PATH_SETTINGS = "/settings.json";

// ─────────────────────────── Tunable defaults ──────────────────────────────
static const uint32_t DEFAULT_PREROLL_MS  = 250;  // mute this long BEFORE the word
static const uint32_t DEFAULT_POSTROLL_MS = 200;  // stay muted this long AFTER
static const uint32_t DEFAULT_MERGE_GAP_MS = 400; // merge events closer than this
static const int32_t  NUDGE_STEP_MS       = 100;  // one encoder detent / button tap

// Mute method: "learn" uses your TV's captured MUTE toggle;
//              "volume" ramps volume to zero and back (idempotent, no toggle bug).
