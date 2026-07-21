#include "profanity.h"
#include <LittleFS.h>
#include <algorithm>

namespace {
std::vector<String> g_words;   // stored lowercase

String lower(const String& s) {
  String o = s;
  o.toLowerCase();
  return o;
}

bool isWordChar(char c) {
  // Treat leetspeak digits as word chars so "sh1t" tokenizes as one word.
  return isalnum((unsigned char)c) || c == '\'' || c == '*' || c == '@' || c == '$';
}

// Normalize common leetspeak substitutions to letters for matching.
String deleet(const String& in) {
  String o; o.reserve(in.length());
  for (size_t i = 0; i < in.length(); i++) {
    char c = in[i];
    switch (c) {
      case '0': c = 'o'; break;
      case '1': c = 'i'; break;
      case '3': c = 'e'; break;
      case '4': c = 'a'; break;
      case '5': c = 's'; break;
      case '7': c = 't'; break;
      case '@': c = 'a'; break;
      case '$': c = 's'; break;
      case '*': c = ' '; break;  // censored spots break the word; skip
      default: break;
    }
    o += c;
  }
  return o;
}
}  // namespace

namespace profanity {

void setWordsFromText(const String& text) {
  g_words.clear();
  int i = 0, n = text.length();
  while (i < n) {
    int start = i;
    while (i < n && text[i] != '\n' && text[i] != ',' && text[i] != '\r') i++;
    String w = text.substring(start, i);
    if (i < n) i++;
    w.trim();
    if (w.length() == 0 || w[0] == '#') continue;
    g_words.push_back(deleet(lower(w)));
  }
}

String wordsAsText() {
  String out;
  for (auto& w : g_words) { out += w; out += "\n"; }
  return out;
}

size_t wordCount() { return g_words.size(); }

bool loadWordlist(const char* path) {
  if (!LittleFS.exists(path)) return false;
  File f = LittleFS.open(path, "r");
  if (!f) return false;
  String txt = f.readString();
  f.close();
  setWordsFromText(txt);
  return true;
}

bool saveWordlist(const char* path) {
  File f = LittleFS.open(path, "w");
  if (!f) return false;
  f.print(wordsAsText());
  f.close();
  return true;
}

std::vector<MuteEvent> scan(const std::vector<Cue>& cues,
                            uint32_t preroll, uint32_t postroll,
                            uint32_t mergeGap) {
  std::vector<MuteEvent> events;
  if (g_words.empty()) return events;

  for (const auto& cue : cues) {
    String hay = deleet(lower(cue.text));
    int len = hay.length();
    if (len == 0) continue;
    uint32_t dur = (cue.end_ms > cue.start_ms) ? (cue.end_ms - cue.start_ms) : 0;

    // Walk tokens; test each token against every banned word (whole-word).
    int i = 0;
    while (i < len) {
      while (i < len && !isWordChar(hay[i])) i++;
      int wStart = i;
      while (i < len && isWordChar(hay[i])) i++;
      int wEnd = i;
      if (wEnd <= wStart) continue;
      String token = hay.substring(wStart, wEnd);

      bool hit = false;
      String matched;
      for (auto& bad : g_words) {
        // whole-word match, or banned word contained as a substring of token
        // (catches "fucking" for "fuck"); require the banned word length >= 3
        // to avoid matching tiny fragments inside innocent words.
        if (token == bad || (bad.length() >= 3 && token.indexOf(bad) >= 0)) {
          hit = true; matched = bad; break;
        }
      }
      if (!hit) continue;

      // Estimate word timing within the cue from character offsets.
      uint32_t wMid = (dur == 0) ? cue.start_ms
                    : cue.start_ms + (uint32_t)((uint64_t)dur * wStart / len);
      uint32_t wEndT = (dur == 0) ? cue.end_ms
                    : cue.start_ms + (uint32_t)((uint64_t)dur * wEnd / len);

      MuteEvent ev;
      ev.mute_at   = (wMid > preroll) ? (wMid - preroll) : 0;
      ev.unmute_at = wEndT + postroll;
      if (ev.unmute_at <= ev.mute_at) ev.unmute_at = ev.mute_at + 300;
      ev.word = matched;
      events.push_back(ev);
    }
  }

  // Sort by mute time.
  std::sort(events.begin(), events.end(),
            [](const MuteEvent& a, const MuteEvent& b) { return a.mute_at < b.mute_at; });

  // Merge overlapping / near-adjacent events.
  std::vector<MuteEvent> merged;
  for (auto& ev : events) {
    if (!merged.empty() && ev.mute_at <= merged.back().unmute_at + mergeGap) {
      if (ev.unmute_at > merged.back().unmute_at) merged.back().unmute_at = ev.unmute_at;
      if (merged.back().word.indexOf(ev.word) < 0) {
        merged.back().word += "+";  // multiple words merged
      }
    } else {
      merged.push_back(ev);
    }
  }
  return merged;
}

}  // namespace profanity
