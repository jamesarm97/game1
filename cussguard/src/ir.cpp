#include "ir.h"
#include "config.h"
#include <IRremoteESP8266.h>
#include <IRrecv.h>
#include <IRsend.h>
#include <IRutils.h>
#include <LittleFS.h>
#include <ArduinoJson.h>
#include <map>
#include <vector>

namespace {

struct IrCode {
  bool     valid = false;
  int      protocol = 0;      // decode_type_t; >0 = known protocol, else raw
  uint64_t value = 0;
  uint16_t bits = 0;
  std::vector<uint16_t> raw;  // microseconds, used when protocol unknown
};

std::map<String, IrCode> g_codes;

const uint16_t kCaptureBufferSize = 1024;
const uint8_t  kTimeout = 15;    // ms of no-signal that ends a capture
IRrecv irrecv(PIN_IR_RECV, kCaptureBufferSize, kTimeout, true);
IRsend irsend(PIN_IR_SEND);
decode_results results;

String   g_learnTarget = "";
bool     g_learning = false;

String   g_method = "learn";
uint8_t  g_volSteps = 25;
bool     g_muted = false;

void sendCode(const IrCode& c) {
  if (!c.valid) return;
  if (c.protocol > 0 && c.value != 0 && hasACState((decode_type_t)c.protocol) == false) {
    irsend.send((decode_type_t)c.protocol, c.value, c.bits);
  } else if (!c.raw.empty()) {
    irsend.sendRaw(const_cast<uint16_t*>(c.raw.data()), c.raw.size(), 38);
  }
}

}  // namespace

namespace ir {

void begin() {
  irsend.begin();
  irrecv.enableIRIn();
  loadCodes();
}

void beginLearn(const String& name) { g_learnTarget = name; g_learning = true; irrecv.resume(); }
bool learning() { return g_learning; }
String learnTarget() { return g_learnTarget; }
void cancelLearn() { g_learning = false; g_learnTarget = ""; }

void poll() {
  if (!g_learning) return;
  if (!irrecv.decode(&results)) return;

  IrCode c;
  c.valid = true;
  c.protocol = (int)results.decode_type;
  c.value = results.value;
  c.bits = results.bits;

  // Always keep a raw copy as a fallback for odd/unknown protocols.
  uint16_t rawLen = getCorrectedRawLength(&results);
  uint16_t* rawArr = resultToRawArray(&results);
  if (rawArr && rawLen > 0) {
    c.raw.assign(rawArr, rawArr + rawLen);
    delete[] rawArr;
  }

  g_codes[g_learnTarget] = c;
  saveCodes();
  g_learning = false;
  g_learnTarget = "";
  irrecv.resume();
}

bool hasCode(const String& name) {
  auto it = g_codes.find(name);
  return it != g_codes.end() && it->second.valid;
}

bool sendNamed(const String& name) {
  auto it = g_codes.find(name);
  if (it == g_codes.end() || !it->second.valid) return false;
  sendCode(it->second);
  return true;
}

void setMethod(const String& method) { g_method = method; }
void setVolumeSteps(uint8_t steps) { g_volSteps = steps; }

void muteOn() {
  if (g_muted) return;
  if (g_method == "volume") {
    for (uint8_t i = 0; i < g_volSteps; i++) { sendNamed(IR_VOL_DOWN); delay(8); }
  } else {
    sendNamed(IR_MUTE);
  }
  g_muted = true;
}

void muteOff() {
  if (!g_muted) return;
  if (g_method == "volume") {
    for (uint8_t i = 0; i < g_volSteps; i++) { sendNamed(IR_VOL_UP); delay(8); }
  } else {
    sendNamed(IR_MUTE);   // toggle back
  }
  g_muted = false;
}

bool isMuted() { return g_muted; }
void resyncAssumeMuted(bool muted) { g_muted = muted; }

String codesJson() {
  JsonDocument doc;
  for (auto& kv : g_codes) {
    JsonObject o = doc[kv.first].to<JsonObject>();
    o["learned"] = kv.second.valid;
    o["protocol"] = kv.second.protocol;
    o["bits"] = kv.second.bits;
  }
  String out; serializeJson(doc, out); return out;
}

void saveCodes() {
  JsonDocument doc;
  for (auto& kv : g_codes) {
    if (!kv.second.valid) continue;
    JsonObject o = doc[kv.first].to<JsonObject>();
    o["protocol"] = kv.second.protocol;
    char hex[19]; snprintf(hex, sizeof(hex), "%llX", (unsigned long long)kv.second.value);
    o["value"] = hex;
    o["bits"] = kv.second.bits;
    JsonArray r = o["raw"].to<JsonArray>();
    for (uint16_t v : kv.second.raw) r.add(v);
  }
  File f = LittleFS.open(PATH_IRCODES, "w");
  if (!f) return;
  serializeJson(doc, f);
  f.close();
}

void loadCodes() {
  g_codes.clear();
  if (!LittleFS.exists(PATH_IRCODES)) return;
  File f = LittleFS.open(PATH_IRCODES, "r");
  if (!f) return;
  JsonDocument doc;
  if (deserializeJson(doc, f) == DeserializationError::Ok) {
    for (JsonPair kv : doc.as<JsonObject>()) {
      IrCode c;
      c.valid = true;
      c.protocol = kv.value()["protocol"] | 0;
      c.bits = kv.value()["bits"] | 0;
      const char* hex = kv.value()["value"] | "0";
      c.value = strtoull(hex, nullptr, 16);
      for (JsonVariant v : kv.value()["raw"].as<JsonArray>()) c.raw.push_back(v.as<uint16_t>());
      g_codes[String(kv.key().c_str())] = c;
    }
  }
  f.close();
}

}  // namespace ir
