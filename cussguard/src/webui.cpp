#include "webui.h"
#include "config.h"
#include "app.h"
#include "playback.h"
#include "ir.h"
#include "profanity.h"
#include "oled.h"
#include <WiFi.h>
#include <ESPAsyncWebServer.h>
#include <LittleFS.h>
#include <ArduinoJson.h>

namespace {
AsyncWebServer server(80);
File g_upload;
String g_bodyBuf;   // accumulates raw POST bodies (single-client device)

long paramLong(AsyncWebServerRequest* r, const char* name, long def) {
  if (r->hasParam(name))       return r->getParam(name)->value().toInt();
  if (r->hasParam(name, true)) return r->getParam(name, true)->value().toInt();
  return def;
}
String paramStr(AsyncWebServerRequest* r, const char* name, const String& def) {
  if (r->hasParam(name))       return r->getParam(name)->value();
  if (r->hasParam(name, true)) return r->getParam(name, true)->value();
  return def;
}
void ok(AsyncWebServerRequest* r) { r->send(200, "application/json", app::statusJson()); }
}  // namespace

namespace webui {

void begin() {
  WiFi.mode(WIFI_AP);
  WiFi.softAP(AP_SSID, AP_PASS);

  // ── Status ──
  server.on("/api/status", HTTP_GET, [](AsyncWebServerRequest* r) { ok(r); });

  // ── Transport controls ──
  server.on("/api/control", HTTP_POST, [](AsyncWebServerRequest* r) {
    String c = paramStr(r, "cmd", "");
    if      (c == "play")   playback::play();
    else if (c == "pause")  playback::pause();
    else if (c == "toggle") playback::toggle();
    else if (c == "stop")   playback::stop();
    ok(r);
  });

  server.on("/api/nudge", HTTP_POST, [](AsyncWebServerRequest* r) {
    playback::nudge((int32_t)paramLong(r, "ms", 0)); ok(r);
  });
  server.on("/api/offset", HTTP_POST, [](AsyncWebServerRequest* r) {
    playback::setOffset((int32_t)paramLong(r, "ms", 0)); ok(r);
  });
  server.on("/api/seek", HTTP_POST, [](AsyncWebServerRequest* r) {
    long ms = paramLong(r, "ms", 0); if (ms < 0) ms = 0;
    playback::seekTo((uint32_t)ms); ok(r);
  });

  // ── IR learning / mute ──
  server.on("/api/learn", HTTP_POST, [](AsyncWebServerRequest* r) {
    String name = paramStr(r, "name", "");
    if (name == "cancel") ir::cancelLearn();
    else if (name.length()) { ir::beginLearn(name); oled::toast("Point remote, press key"); }
    ok(r);
  });
  server.on("/api/mute", HTTP_POST, [](AsyncWebServerRequest* r) {
    long on = paramLong(r, "on", -1);
    if (on == 1) ir::muteOn(); else if (on == 0) ir::muteOff();
    ok(r);
  });
  server.on("/api/resync", HTTP_POST, [](AsyncWebServerRequest* r) {
    ir::resyncAssumeMuted(paramLong(r, "muted", 0) == 1); ok(r);
  });

  // ── Word list (GET text / POST text body) ──
  server.on("/api/wordlist", HTTP_GET, [](AsyncWebServerRequest* r) {
    r->send(200, "text/plain", profanity::wordsAsText());
  });
  server.on("/api/wordlist", HTTP_POST,
    [](AsyncWebServerRequest* r) {
      profanity::setWordsFromText(g_bodyBuf);
      profanity::saveWordlist(PATH_WORDLIST);
      app::rebuildEvents();
      g_bodyBuf = "";
      ok(r);
    },
    nullptr,
    [](AsyncWebServerRequest* r, uint8_t* data, size_t len, size_t index, size_t total) {
      if (index == 0) g_bodyBuf = "";
      g_bodyBuf.concat((const char*)data, len);
    });

  // ── Settings (JSON body) ──
  server.on("/api/settings", HTTP_POST,
    [](AsyncWebServerRequest* r) {
      JsonDocument doc;
      if (deserializeJson(doc, g_bodyBuf) == DeserializationError::Ok) {
        auto& s = app::settings();
        s.preroll  = doc["preroll"]  | s.preroll;
        s.postroll = doc["postroll"] | s.postroll;
        s.mergeGap = doc["mergeGap"] | s.mergeGap;
        if (doc["method"].is<const char*>())  s.method = String((const char*)doc["method"]);
        s.volSteps = doc["volSteps"] | s.volSteps;
        app::saveSettings();
        app::rebuildEvents();
      }
      g_bodyBuf = "";
      ok(r);
    },
    nullptr,
    [](AsyncWebServerRequest* r, uint8_t* data, size_t len, size_t index, size_t total) {
      if (index == 0) g_bodyBuf = "";
      g_bodyBuf.concat((const char*)data, len);
    });

  // ── SRT upload (multipart) ──
  server.on("/api/upload", HTTP_POST,
    [](AsyncWebServerRequest* r) {
      size_t n = app::loadSrtFromFile();
      JsonDocument doc; doc["ok"] = true; doc["events"] = n;
      String out; serializeJson(doc, out);
      r->send(200, "application/json", out);
    },
    [](AsyncWebServerRequest* r, String filename, size_t index, uint8_t* data, size_t len, bool final) {
      if (index == 0) { g_upload = LittleFS.open(PATH_SRT, "w"); }
      if (g_upload) g_upload.write(data, len);
      if (final && g_upload) g_upload.close();
    });

  // ── Static UI (registered LAST so /api/* routes match first) ──
  server.serveStatic("/", LittleFS, "/").setDefaultFile("index.html");

  server.begin();
}

}  // namespace webui
