#include "playback.h"
#include "ir.h"

namespace {
std::vector<MuteEvent> g_events;
PlayState g_state = PB_STOPPED;

// Clock model: position = base_ms + (now - anchor) while playing.
uint32_t g_baseMs = 0;      // position captured at last play/seek
uint32_t g_anchor = 0;      // millis() at last play/seek
int32_t  g_offset = 0;      // user timing correction (+ = later)

size_t   g_cursor = 0;      // index of next event to consider
bool     g_activeMute = false;

uint32_t clockMs() {
  if (g_state == PB_PLAYING) return g_baseMs + (millis() - g_anchor);
  return g_baseMs;
}

int64_t positionSigned() {
  return (int64_t)clockMs() + g_offset;
}

// Reposition cursor after a seek/offset change so we don't miss/replay events.
void resyncCursor(int64_t pos) {
  g_cursor = 0;
  while (g_cursor < g_events.size() && (int64_t)g_events[g_cursor].unmute_at <= pos) g_cursor++;
}
}  // namespace

namespace playback {

void load(const std::vector<MuteEvent>& events) {
  g_events = events;
  g_state = PB_STOPPED;
  g_baseMs = 0; g_anchor = millis(); g_offset = 0;
  g_cursor = 0; g_activeMute = false;
  ir::muteOff();
}

uint32_t positionMs() {
  int64_t p = positionSigned();
  return (p < 0) ? 0 : (uint32_t)p;
}

PlayState state() { return g_state; }
bool muted() { return ir::isMuted(); }
size_t eventCount() { return g_events.size(); }
int32_t offset() { return g_offset; }
bool inActiveMute() { return g_activeMute; }

void play() {
  if (g_state == PB_PLAYING) return;
  g_anchor = millis();     // resume from frozen base
  g_state = PB_PLAYING;
}

void pause() {
  if (g_state != PB_PLAYING) return;
  g_baseMs = clockMs();    // freeze
  g_state = PB_PAUSED;
  // Leave mute state as-is; commercials shouldn't flip audio.
}

void toggle() { (g_state == PB_PLAYING) ? pause() : play(); }

void stop() {
  g_state = PB_STOPPED;
  g_baseMs = 0; g_anchor = millis();
  g_cursor = 0;
  if (g_activeMute) { ir::muteOff(); g_activeMute = false; }
}

void seekTo(uint32_t ms) {
  g_baseMs = ms;
  g_anchor = millis();
  if (g_activeMute) { ir::muteOff(); g_activeMute = false; }
  resyncCursor(positionSigned());
}

void setOffset(int32_t ms) {
  g_offset = ms;
  if (g_activeMute) { ir::muteOff(); g_activeMute = false; }
  resyncCursor(positionSigned());
}

void nudge(int32_t deltaMs) { setOffset(g_offset + deltaMs); }

const MuteEvent* nextEvent() {
  int64_t pos = positionSigned();
  for (size_t i = 0; i < g_events.size(); i++) {
    if ((int64_t)g_events[i].unmute_at > pos) return &g_events[i];
  }
  return nullptr;
}

void tick() {
  if (g_state != PB_PLAYING) return;
  int64_t pos = positionSigned();
  if (pos < 0) return;

  // End an active mute when we pass its unmute time.
  if (g_activeMute) {
    if (g_cursor < g_events.size() && pos >= (int64_t)g_events[g_cursor].unmute_at) {
      ir::muteOff();
      g_activeMute = false;
      g_cursor++;
    }
    return;  // one action per tick keeps IR timing clean
  }

  // Start a mute when we reach the next event's mute time.
  if (g_cursor < g_events.size()) {
    const MuteEvent& ev = g_events[g_cursor];
    if (pos >= (int64_t)ev.mute_at && pos < (int64_t)ev.unmute_at) {
      ir::muteOn();
      g_activeMute = true;
    } else if (pos >= (int64_t)ev.unmute_at) {
      g_cursor++;  // we blew past it (big seek); skip
    }
  }
}

}  // namespace playback
