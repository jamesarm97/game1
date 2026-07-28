'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const MAX_HEARTBEATS = 2500; // per monitor (~40h at 60s intervals)

function defaults() {
  return {
    version: 1,
    settings: {
      title: 'PulseWatch',
      passwordHash: null,
      statusPage: {
        enabled: true,
        title: 'Service Status',
        description: 'Live status and uptime for our services.',
        monitors: [] // monitor ids to publish; empty = none
      }
    },
    monitors: [],
    channels: [],
    incidents: [],
    heartbeats: {}, // monitorId -> [{t, ok, ms, msg}]
    sessions: {}    // token -> {createdAt, expiresAt}
  };
}

class Store {
  constructor(file) {
    this.file = file;
    this.data = defaults();
    this._flushTimer = null;
    this.load();
  }

  load() {
    try {
      if (fs.existsSync(this.file)) {
        const raw = JSON.parse(fs.readFileSync(this.file, 'utf8'));
        this.data = Object.assign(defaults(), raw);
        this.data.settings = Object.assign(defaults().settings, raw.settings || {});
        this.data.settings.statusPage = Object.assign(
          defaults().settings.statusPage, (raw.settings || {}).statusPage || {});
      }
    } catch (err) {
      console.error(`[store] failed to load ${this.file}: ${err.message} — starting fresh`);
      this.data = defaults();
    }
  }

  // Debounced save; call flush() for a synchronous write (e.g. on shutdown).
  save() {
    if (this._flushTimer) return;
    this._flushTimer = setTimeout(() => {
      this._flushTimer = null;
      this.flush();
    }, 250);
    if (this._flushTimer.unref) this._flushTimer.unref();
  }

  flush() {
    if (this._flushTimer) {
      clearTimeout(this._flushTimer);
      this._flushTimer = null;
    }
    const tmp = `${this.file}.tmp`;
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    fs.writeFileSync(tmp, JSON.stringify(this.data));
    fs.renameSync(tmp, this.file);
  }

  newId() {
    return crypto.randomBytes(8).toString('hex');
  }

  // ---- monitors ----

  getMonitor(id) {
    return this.data.monitors.find((m) => m.id === id) || null;
  }

  deleteMonitor(id) {
    this.data.monitors = this.data.monitors.filter((m) => m.id !== id);
    this.data.incidents = this.data.incidents.filter((i) => i.monitorId !== id);
    delete this.data.heartbeats[id];
    const sp = this.data.settings.statusPage;
    sp.monitors = sp.monitors.filter((mid) => mid !== id);
    this.save();
  }

  // ---- heartbeats ----

  addHeartbeat(monitorId, beat) {
    const list = this.data.heartbeats[monitorId] || (this.data.heartbeats[monitorId] = []);
    list.push(beat);
    if (list.length > MAX_HEARTBEATS) list.splice(0, list.length - MAX_HEARTBEATS);
    this.save();
  }

  heartbeats(monitorId, limit = 100) {
    const list = this.data.heartbeats[monitorId] || [];
    return list.slice(-limit);
  }

  // Uptime ratio over the trailing `windowMs`, computed from incident downtime so
  // it stays accurate beyond the heartbeat retention window.
  uptimeFromIncidents(monitorId, windowMs, now = Date.now()) {
    const monitor = this.getMonitor(monitorId);
    if (!monitor) return null;
    const since = Math.max(now - windowMs, monitor.createdAt || 0);
    const period = now - since;
    if (period <= 0) return null;
    let down = 0;
    for (const inc of this.data.incidents) {
      if (inc.monitorId !== monitorId) continue;
      const start = Math.max(inc.startedAt, since);
      const end = inc.endedAt == null ? now : inc.endedAt;
      if (end > start) down += end - start;
    }
    return Math.max(0, Math.min(1, 1 - down / period));
  }

  uptimeFromHeartbeats(monitorId, windowMs, now = Date.now()) {
    const since = now - windowMs;
    const beats = (this.data.heartbeats[monitorId] || []).filter((b) => b.t >= since);
    if (!beats.length) return null;
    return beats.filter((b) => b.ok).length / beats.length;
  }

  // ---- incidents ----

  openIncident(monitorId, reason, now = Date.now()) {
    const existing = this.currentIncident(monitorId);
    if (existing) return existing;
    const inc = { id: this.newId(), monitorId, startedAt: now, endedAt: null, reason };
    this.data.incidents.push(inc);
    if (this.data.incidents.length > 5000) this.data.incidents.splice(0, 1000);
    this.save();
    return inc;
  }

  closeIncident(monitorId, now = Date.now()) {
    const inc = this.currentIncident(monitorId);
    if (inc) {
      inc.endedAt = now;
      this.save();
    }
    return inc;
  }

  currentIncident(monitorId) {
    return this.data.incidents.find((i) => i.monitorId === monitorId && i.endedAt == null) || null;
  }

  incidents(monitorId, limit = 50) {
    return this.data.incidents
      .filter((i) => !monitorId || i.monitorId === monitorId)
      .slice(-limit)
      .reverse();
  }

  // ---- sessions ----

  createSession(ttlMs = 7 * 24 * 3600 * 1000) {
    const token = crypto.randomBytes(24).toString('hex');
    const now = Date.now();
    this.data.sessions[token] = { createdAt: now, expiresAt: now + ttlMs };
    this.pruneSessions();
    this.save();
    return token;
  }

  validSession(token) {
    const s = token && this.data.sessions[token];
    return !!(s && s.expiresAt > Date.now());
  }

  destroySession(token) {
    delete this.data.sessions[token];
    this.save();
  }

  pruneSessions() {
    const now = Date.now();
    for (const [token, s] of Object.entries(this.data.sessions)) {
      if (s.expiresAt <= now) delete this.data.sessions[token];
    }
  }
}

module.exports = { Store, MAX_HEARTBEATS };
