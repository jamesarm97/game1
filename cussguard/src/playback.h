#pragma once
#include <Arduino.h>
#include <vector>
#include "profanity.h"

enum PlayState { PB_STOPPED, PB_PLAYING, PB_PAUSED };

namespace playback {

void load(const std::vector<MuteEvent>& events);
void tick();                 // call every loop(); drives IR mute/unmute

void play();
void pause();                // freezes clock (use during commercials)
void toggle();               // play<->pause
void stop();                 // back to 0, unmute
void seekTo(uint32_t ms);    // jump the clock to an absolute position

void   nudge(int32_t deltaMs);   // shift timeline offset (encoder / +/- keys)
void   setOffset(int32_t ms);
int32_t offset();

uint32_t positionMs();       // current SRT position (clock + offset, clamped >=0)
PlayState state();
bool muted();

size_t eventCount();
const MuteEvent* nextEvent();   // next upcoming (or active) event, or nullptr
bool inActiveMute();

}  // namespace playback
