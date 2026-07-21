#pragma once
namespace screen {
void begin();
void render();                 // draws current status; call ~5-10 Hz
void toast(const char* msg);   // brief centered message
}
