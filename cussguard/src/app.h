#pragma once
#include <Arduino.h>

// Glue layer: owns settings + the current SRT/cue/event pipeline, shared by
// the web UI, the physical controls, and the display.
namespace app {

struct Settings {
  uint32_t preroll  = 250;
  uint32_t postroll = 200;
  uint32_t mergeGap = 400;
  String   method   = "learn";   // "learn" | "volume"
  uint8_t  volSteps = 25;
};

void begin();
Settings& settings();
void saveSettings();

// (Re)build mute events from the currently loaded SRT + word list + settings.
size_t rebuildEvents();

// Load an SRT string (already saved to PATH_SRT by the uploader) and rebuild.
size_t loadSrt(const String& data);
bool   loadSrtFromFile();

String srtName();
uint32_t srtDurationMs();

// JSON status blob for the web UI / websocket.
String statusJson();

}  // namespace app
