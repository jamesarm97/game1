#pragma once
#include <Arduino.h>
#include <vector>

struct Cue {
  uint32_t start_ms;
  uint32_t end_ms;
  String   text;   // stripped of markup, single line
};

namespace srt {
// Parse an SRT document into time-ordered cues. Tolerant of \r\n, BOM,
// blank lines, and basic <i>/<b>/{\an8} style tags.
std::vector<Cue> parse(const String& data);
}
