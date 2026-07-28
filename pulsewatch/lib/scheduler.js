'use strict';

const { runCheck } = require('./checks');
const { notifyChannels } = require('./notify');

const MIN_INTERVAL = 10; // seconds

class Scheduler {
  constructor(store) {
    this.store = store;
    this.timers = new Map(); // monitorId -> timeout
    this.state = new Map();  // monitorId -> runtime state
    this.running = false;
  }

  start() {
    this.running = true;
    for (const monitor of this.store.data.monitors) {
      // Reconstruct pre-restart status so we don't re-alert on boot.
      const beats = this.store.heartbeats(monitor.id, 1);
      const st = this.ensureState(monitor.id);
      if (beats.length) {
        st.status = beats[0].ok ? 'up' : 'down';
        st.lastCheck = beats[0].t;
        st.lastLatency = beats[0].ms;
        st.lastMessage = beats[0].msg;
      }
      if (monitor.type === 'push' && beats.length && beats[beats.length - 1].ok) {
        st.lastPush = beats[beats.length - 1].t;
      }
      this.schedule(monitor, this.jitter(monitor));
    }
  }

  stop() {
    this.running = false;
    for (const timer of this.timers.values()) clearTimeout(timer);
    this.timers.clear();
  }

  jitter(monitor) {
    // Spread initial checks so a restart doesn't fire everything at once.
    return Math.floor(Math.random() * Math.min(5000, this.intervalMs(monitor)));
  }

  intervalMs(monitor) {
    return Math.max(MIN_INTERVAL, monitor.interval || 60) * 1000;
  }

  ensureState(id) {
    if (!this.state.has(id)) {
      this.state.set(id, {
        status: 'pending', // pending | up | down | paused
        lastCheck: null,
        lastLatency: null,
        lastMessage: null,
        failCount: 0,
        certDays: null,
        certAlerted: false,
        lastPush: null
      });
    }
    return this.state.get(id);
  }

  schedule(monitor, delayMs) {
    this.unschedule(monitor.id);
    if (!this.running) return;
    if (monitor.active === false) {
      this.ensureState(monitor.id).status = 'paused';
      return;
    }
    const timer = setTimeout(() => {
      this.check(monitor.id).catch((err) =>
        console.error(`[scheduler] check for ${monitor.id} threw: ${err.message}`));
    }, delayMs != null ? delayMs : this.intervalMs(monitor));
    if (timer.unref) timer.unref();
    this.timers.set(monitor.id, timer);
  }

  unschedule(id) {
    const timer = this.timers.get(id);
    if (timer) clearTimeout(timer);
    this.timers.delete(id);
  }

  removeMonitor(id) {
    this.unschedule(id);
    this.state.delete(id);
  }

  recordPush(monitor, latency = null) {
    const st = this.ensureState(monitor.id);
    st.lastPush = Date.now();
    // A beat is proof of life — evaluate immediately.
    return this.check(monitor.id, { pushLatency: latency });
  }

  async check(monitorId, opts = {}) {
    const monitor = this.store.getMonitor(monitorId);
    if (!monitor) return null;
    const st = this.ensureState(monitorId);
    if (monitor.active === false) {
      st.status = 'paused';
      return null;
    }

    const result = await runCheck(monitor, st);
    if (opts.pushLatency != null && result.ok) result.latency = opts.pushLatency;
    const now = Date.now();

    st.lastCheck = now;
    st.lastLatency = result.latency;
    st.lastMessage = result.message;
    if (result.certDays != null) st.certDays = result.certDays;

    this.store.addHeartbeat(monitorId, {
      t: now,
      ok: result.ok,
      ms: result.latency,
      msg: result.message
    });

    const previous = st.status;

    if (result.ok) {
      st.failCount = 0;
      st.status = 'up';
      if (previous === 'down') {
        const incident = this.store.closeIncident(monitorId, now);
        const durationMs = incident ? now - incident.startedAt : null;
        notifyChannels(this.store, monitor, {
          event: 'up',
          monitor,
          message: `${monitor.name} recovered: ${result.message}`,
          durationMs
        });
      }
    } else {
      st.failCount += 1;
      const retries = Math.max(0, monitor.retries != null ? monitor.retries : 1);
      if (st.failCount > retries || previous === 'down') {
        st.status = 'down';
        if (previous !== 'down') {
          this.store.openIncident(monitorId, result.message, now);
          notifyChannels(this.store, monitor, {
            event: 'down',
            monitor,
            message: `${monitor.name} is down: ${result.message}`
          });
        }
      }
      // else: stay in previous status while retrying
    }

    // TLS certificate expiry warning (once per threshold crossing).
    if (monitor.certCheck && st.certDays != null) {
      const threshold = monitor.certExpiryDays || 14;
      if (st.certDays <= threshold && !st.certAlerted) {
        st.certAlerted = true;
        notifyChannels(this.store, monitor, {
          event: 'cert',
          monitor,
          message: `TLS certificate for ${monitor.url} expires in ${st.certDays} day(s)`
        });
      } else if (st.certDays > threshold) {
        st.certAlerted = false;
      }
    }

    // Failed checks retry faster so `retries` confirmations happen quickly.
    const nextMs = !result.ok && st.status !== 'down'
      ? Math.min(this.intervalMs(monitor), 20000)
      : this.intervalMs(monitor);
    this.schedule(monitor, nextMs);
    return { ...result, status: st.status };
  }

  snapshot(monitorId) {
    const st = this.ensureState(monitorId);
    return { ...st };
  }
}

module.exports = { Scheduler, MIN_INTERVAL };
