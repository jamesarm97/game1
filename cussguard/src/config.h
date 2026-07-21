#pragma once
#include <Arduino.h>

// ─────────────────────── M5Dial (ESP32-S3 / M5StampS3) ──────────────────────
// The dial, LCD and push-button are all built in and handled by the M5Dial
// library — no pins to assign for them. The only external wiring is IR on the
// Grove Port B connector.
//
//   Port B (black connector):  G2 -> IR transmit,  G1 <- IR receive
//
static const uint8_t PIN_IR_SEND = 2;   // G2 -> transistor base -> IR LED
static const uint8_t PIN_IR_RECV = 1;   // G1 <- IR receiver (TSOP38238) OUT

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
static const uint32_t DEFAULT_PREROLL_MS   = 250;  // mute this long BEFORE the word
static const uint32_t DEFAULT_POSTROLL_MS  = 200;  // stay muted this long AFTER
static const uint32_t DEFAULT_MERGE_GAP_MS = 400;  // merge events closer than this
static const int32_t  NUDGE_STEP_MS        = 100;  // one encoder detent / tap

// The built-in encoder reports several counts per physical detent. Tune this if
// scrubbing feels too coarse/fine (lower = more sensitive).
static const int32_t  ENC_COUNTS_PER_STEP  = 4;

// Hold the dial button this long to STOP; a short press toggles play/pause.
static const uint32_t LONGPRESS_MS         = 800;
