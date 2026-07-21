#include "srt.h"

namespace {
// "00:01:23,456" or "00:01:23.456" -> milliseconds. Returns false on failure.
bool parseTimestamp(const String& s, uint32_t& out) {
  int h, m, sec, ms;
  // Accept both ',' and '.' as the millisecond separator.
  String t = s;
  t.replace('.', ',');
  if (sscanf(t.c_str(), "%d:%d:%d,%d", &h, &m, &sec, &ms) != 4) return false;
  out = ((uint32_t)h * 3600UL + (uint32_t)m * 60UL + (uint32_t)sec) * 1000UL + (uint32_t)ms;
  return true;
}

// Remove <..> and {..} markup, collapse whitespace/newlines to single spaces.
String stripMarkup(const String& in) {
  String out;
  out.reserve(in.length());
  bool inTag = false;
  char tagClose = 0;
  for (size_t i = 0; i < in.length(); i++) {
    char c = in[i];
    if (!inTag && (c == '<' || c == '{')) { inTag = true; tagClose = (c == '<') ? '>' : '}'; continue; }
    if (inTag) { if (c == tagClose) inTag = false; continue; }
    if (c == '\r' || c == '\n' || c == '\t') c = ' ';
    out += c;
  }
  // collapse runs of spaces
  String cleaned;
  cleaned.reserve(out.length());
  bool prevSpace = false;
  for (size_t i = 0; i < out.length(); i++) {
    char c = out[i];
    if (c == ' ') { if (prevSpace) continue; prevSpace = true; }
    else prevSpace = false;
    cleaned += c;
  }
  cleaned.trim();
  return cleaned;
}
}  // namespace

namespace srt {

std::vector<Cue> parse(const String& data) {
  std::vector<Cue> cues;
  int i = 0;
  int n = data.length();
  // Skip UTF-8 BOM if present.
  if (n >= 3 && (uint8_t)data[0] == 0xEF && (uint8_t)data[1] == 0xBB && (uint8_t)data[2] == 0xBF) i = 3;

  auto readLine = [&](String& line) -> bool {
    if (i >= n) return false;
    int start = i;
    while (i < n && data[i] != '\n') i++;
    int end = i;
    if (end > start && data[end - 1] == '\r') end--;
    line = data.substring(start, end);
    if (i < n) i++;  // consume '\n'
    return true;
  };

  String line;
  while (i < n) {
    // 1) optional numeric index line
    if (!readLine(line)) break;
    line.trim();
    if (line.length() == 0) continue;

    // If this line isn't a timecode, it's likely the index; read the next.
    if (line.indexOf("-->") < 0) {
      if (!readLine(line)) break;
      line.trim();
    }
    int arrow = line.indexOf("-->");
    if (arrow < 0) continue;  // not a cue; resync on next blank

    String startStr = line.substring(0, arrow);
    String endStr   = line.substring(arrow + 3);
    startStr.trim();
    endStr.trim();
    // endStr may carry position tags after the time; keep only first token
    int sp = endStr.indexOf(' ');
    if (sp > 0) endStr = endStr.substring(0, sp);

    Cue cue;
    if (!parseTimestamp(startStr, cue.start_ms) || !parseTimestamp(endStr, cue.end_ms)) continue;

    // 2) text lines until blank line / EOF
    String text;
    while (readLine(line)) {
      if (line.length() == 0 || line == "\r") break;
      String tl = line; tl.trim();
      if (tl.length() == 0) break;
      if (text.length()) text += " ";
      text += line;
    }
    cue.text = stripMarkup(text);
    if (cue.end_ms < cue.start_ms) cue.end_ms = cue.start_ms;
    if (cue.text.length()) cues.push_back(cue);
  }
  return cues;
}

}  // namespace srt
