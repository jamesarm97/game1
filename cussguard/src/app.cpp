#include "app.h"
#include "config.h"
#include "srt.h"
#include "profanity.h"
#include "playback.h"
#include "ir.h"
#include <LittleFS.h>
#include <ArduinoJson.h>

namespace {
app::Settings g_settings;
std::vector<Cue> g_cues;
uint32_t g_durationMs = 0;

String fmtTime(uint32_t ms) {
  uint32_t s = ms / 1000;
  char buf[16];
  snprintf(buf, sizeof(buf), "%02u:%02u:%02u", s / 3600, (s / 60) % 60, s % 60);
  return String(buf);
}
}  // namespace

namespace app {

Settings& settings() { return g_settings; }

void saveSettings() {
  JsonDocument doc;
  doc["preroll"] = g_settings.preroll;
  doc["postroll"] = g_settings.postroll;
  doc["mergeGap"] = g_settings.mergeGap;
  doc["method"] = g_settings.method;
  doc["volSteps"] = g_settings.volSteps;
  File f = LittleFS.open(PATH_SETTINGS, "w");
  if (f) { serializeJson(doc, f); f.close(); }
  ir::setMethod(g_settings.method);
  ir::setVolumeSteps(g_settings.volSteps);
}

void loadSettings() {
  if (!LittleFS.exists(PATH_SETTINGS)) return;
  File f = LittleFS.open(PATH_SETTINGS, "r");
  if (!f) return;
  JsonDocument doc;
  if (deserializeJson(doc, f) == DeserializationError::Ok) {
    g_settings.preroll  = doc["preroll"]  | g_settings.preroll;
    g_settings.postroll = doc["postroll"] | g_settings.postroll;
    g_settings.mergeGap = doc["mergeGap"] | g_settings.mergeGap;
    g_settings.method   = String((const char*)(doc["method"] | "learn"));
    g_settings.volSteps = doc["volSteps"] | g_settings.volSteps;
  }
  f.close();
}

size_t rebuildEvents() {
  auto events = profanity::scan(g_cues, g_settings.preroll, g_settings.postroll, g_settings.mergeGap);
  playback::load(events);
  return events.size();
}

size_t loadSrt(const String& data) {
  g_cues = srt::parse(data);
  g_durationMs = g_cues.empty() ? 0 : g_cues.back().end_ms;
  return rebuildEvents();
}

bool loadSrtFromFile() {
  if (!LittleFS.exists(PATH_SRT)) return false;
  File f = LittleFS.open(PATH_SRT, "r");
  if (!f) return false;
  String data = f.readString();
  f.close();
  loadSrt(data);
  return true;
}

String srtName() { return g_cues.empty() ? String("(none)") : String("current.srt"); }
uint32_t srtDurationMs() { return g_durationMs; }

void begin() {
  loadSettings();
  ir::setMethod(g_settings.method);
  ir::setVolumeSteps(g_settings.volSteps);
  if (!profanity::loadWordlist(PATH_WORDLIST)) {
    // seed a starter list on first boot
    profanity::setWordsFromText("# one banned word per line\n");
    profanity::saveWordlist(PATH_WORDLIST);
  }
  loadSrtFromFile();
}

String statusJson() {
  JsonDocument doc;
  const char* st = playback::state() == PB_PLAYING ? "playing"
                 : playback::state() == PB_PAUSED  ? "paused" : "stopped";
  doc["state"] = st;
  doc["pos_ms"] = playback::positionMs();
  doc["pos"] = fmtTime(playback::positionMs());
  doc["dur_ms"] = g_durationMs;
  doc["dur"] = fmtTime(g_durationMs);
  doc["offset_ms"] = playback::offset();
  doc["muted"] = playback::muted();
  doc["active_mute"] = playback::inActiveMute();
  doc["events"] = playback::eventCount();
  doc["cues"] = g_cues.size();
  doc["words"] = profanity::wordCount();
  doc["srt"] = srtName();
  doc["method"] = g_settings.method;
  doc["preroll"] = g_settings.preroll;
  doc["postroll"] = g_settings.postroll;

  // Learned-IR summary
  JsonObject iro = doc["ir"].to<JsonObject>();
  iro["mute"] = ir::hasCode(IR_MUTE);
  iro["volup"] = ir::hasCode(IR_VOL_UP);
  iro["voldown"] = ir::hasCode(IR_VOL_DOWN);
  iro["learning"] = ir::learning();
  iro["learn_target"] = ir::learnTarget();

  const MuteEvent* nx = playback::nextEvent();
  if (nx) {
    JsonObject n = doc["next"].to<JsonObject>();
    n["word"] = nx->word;
    n["mute_at"] = nx->mute_at;
    n["mute_at_str"] = fmtTime(nx->mute_at);
    int64_t eta = (int64_t)nx->mute_at - (int64_t)playback::positionMs();
    n["eta_ms"] = eta;
  }
  String out; serializeJson(doc, out); return out;
}

}  // namespace app
