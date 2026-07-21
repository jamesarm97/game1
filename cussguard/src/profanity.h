#pragma once
#include <Arduino.h>
#include <vector>
#include "srt.h"

struct MuteEvent {
  uint32_t mute_at;    // ms  (already includes preroll)
  uint32_t unmute_at;  // ms  (already includes postroll)
  String   word;       // first triggering word (for display)
};

namespace profanity {

// Word list management (persisted one-word-per-line, '#' comments allowed).
bool  loadWordlist(const char* path);
bool  saveWordlist(const char* path);
void  setWordsFromText(const String& text);   // newline/comma separated
String wordsAsText();
size_t wordCount();

// Scan cues -> mute events. Estimates each word's in-cue timing from its
// character position, applies pre/post-roll, then merges near/overlapping
// events (within mergeGap) so the TV isn't toggled rapidly.
std::vector<MuteEvent> scan(const std::vector<Cue>& cues,
                            uint32_t preroll, uint32_t postroll,
                            uint32_t mergeGap);

}  // namespace profanity
