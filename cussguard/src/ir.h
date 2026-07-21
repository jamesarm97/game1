#pragma once
#include <Arduino.h>

// Named IR commands we care about.
#define IR_MUTE     "mute"
#define IR_VOL_UP   "volup"
#define IR_VOL_DOWN "voldown"

namespace ir {

void begin();

// Non-blocking learn: call beginLearn("mute"), then poll() in loop(); the next
// decoded remote press is captured & saved under that name.
void   beginLearn(const String& name);
bool   learning();
String learnTarget();
void   cancelLearn();
void   poll();               // capture-if-learning; call every loop
bool   hasCode(const String& name);

// Fire a stored command. Returns false if not learned.
bool sendNamed(const String& name);

// High-level mute control. Tracks assumed TV mute state so a *toggle*-style
// MUTE code isn't sent twice in a row. Method "volume" ramps vol to 0 / back.
void setMethod(const String& method);   // "learn" (toggle) or "volume"
void setVolumeSteps(uint8_t steps);      // for "volume" method
void muteOn();
void muteOff();
bool isMuted();
void resyncAssumeMuted(bool muted);      // user says "TV is actually (un)muted"

String codesJson();    // which commands are learned
void   loadCodes();
void   saveCodes();

}  // namespace ir
