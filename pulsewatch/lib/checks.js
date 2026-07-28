'use strict';

const net = require('net');
const tls = require('tls');
const { execFile } = require('child_process');

// Parse "200-299,301,404" into a matcher function.
function statusMatcher(spec) {
  const ranges = String(spec || '200-299')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const [lo, hi] = part.split('-').map((n) => parseInt(n, 10));
      return { lo, hi: Number.isFinite(hi) ? hi : lo };
    })
    .filter((r) => Number.isFinite(r.lo));
  if (!ranges.length) ranges.push({ lo: 200, hi: 299 });
  return (code) => ranges.some((r) => code >= r.lo && code <= r.hi);
}

function certDaysRemaining(hostname, port, timeoutMs) {
  return new Promise((resolve) => {
    const socket = tls.connect(
      { host: hostname, port, servername: hostname, timeout: timeoutMs, rejectUnauthorized: false },
      () => {
        try {
          const cert = socket.getPeerCertificate();
          if (cert && cert.valid_to) {
            const days = (new Date(cert.valid_to).getTime() - Date.now()) / 86400000;
            resolve(Math.floor(days));
          } else {
            resolve(null);
          }
        } catch {
          resolve(null);
        }
        socket.end();
      }
    );
    socket.on('error', () => resolve(null));
    socket.on('timeout', () => { socket.destroy(); resolve(null); });
  });
}

async function checkHttp(monitor) {
  const timeoutMs = (monitor.timeout || 10) * 1000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const started = Date.now();
  const result = { ok: false, latency: null, message: '', certDays: null };
  try {
    const headers = {};
    for (const h of monitor.headers || []) {
      if (h.name) headers[h.name] = h.value || '';
    }
    if (!headers['User-Agent'] && !headers['user-agent']) {
      headers['User-Agent'] = 'PulseWatch/1.0 (uptime monitor)';
    }
    const res = await fetch(monitor.url, {
      method: monitor.method || 'GET',
      headers,
      body: ['GET', 'HEAD'].includes(monitor.method || 'GET') ? undefined : monitor.body || undefined,
      redirect: 'follow',
      signal: controller.signal
    });
    result.latency = Date.now() - started;
    const okStatus = statusMatcher(monitor.acceptedStatus)(res.status);
    if (!okStatus) {
      result.message = `HTTP ${res.status}`;
      return result;
    }
    if (monitor.keyword) {
      const text = await res.text();
      const found = text.includes(monitor.keyword);
      const wanted = !monitor.keywordInvert;
      if (found !== wanted) {
        result.message = wanted
          ? `keyword "${monitor.keyword}" not found`
          : `forbidden keyword "${monitor.keyword}" present`;
        return result;
      }
    }
    result.ok = true;
    result.message = `HTTP ${res.status}`;
    return result;
  } catch (err) {
    result.latency = Date.now() - started;
    result.message = err.name === 'AbortError' ? `timeout after ${monitor.timeout || 10}s`
      : (err.cause && err.cause.message) || err.message;
    return result;
  } finally {
    clearTimeout(timer);
    if (result.ok !== undefined && monitor.certCheck) {
      try {
        const u = new URL(monitor.url);
        if (u.protocol === 'https:') {
          result.certDays = await certDaysRemaining(u.hostname, Number(u.port) || 443, timeoutMs);
        }
      } catch { /* cert info is best-effort */ }
    }
  }
}

function checkTcp(monitor) {
  const timeoutMs = (monitor.timeout || 10) * 1000;
  const started = Date.now();
  return new Promise((resolve) => {
    const socket = net.connect({ host: monitor.host, port: Number(monitor.port), timeout: timeoutMs });
    const done = (ok, message) => {
      socket.destroy();
      resolve({ ok, latency: Date.now() - started, message, certDays: null });
    };
    socket.on('connect', () => done(true, `connected to ${monitor.host}:${monitor.port}`));
    socket.on('timeout', () => done(false, `timeout after ${monitor.timeout || 10}s`));
    socket.on('error', (err) => done(false, err.message));
  });
}

function checkPing(monitor) {
  const timeoutSec = Math.max(1, Math.round(monitor.timeout || 5));
  const started = Date.now();
  return new Promise((resolve) => {
    execFile('ping', ['-c', '1', '-W', String(timeoutSec), monitor.host],
      { timeout: (timeoutSec + 2) * 1000 },
      (err, stdout) => {
        const latencyMatch = /time=([\d.]+) ?ms/.exec(stdout || '');
        const latency = latencyMatch ? Math.round(parseFloat(latencyMatch[1])) : Date.now() - started;
        if (!err) return resolve({ ok: true, latency, message: 'ping ok', certDays: null });
        if (err.code === 'ENOENT') {
          return resolve({
            ok: false, latency: null, certDays: null,
            message: 'ping binary not available on this host — use a TCP or HTTP monitor instead'
          });
        }
        resolve({ ok: false, latency: null, message: 'ping failed (host unreachable or timed out)', certDays: null });
      });
  });
}

function checkPush(monitor, state) {
  // Push (heartbeat) monitors are passive: the monitored system calls us.
  // It is down when no beat arrived within interval + grace.
  const graceMs = ((monitor.grace || 60) + (monitor.interval || 60)) * 1000;
  const last = state.lastPush || 0;
  if (!last) {
    return { ok: false, latency: null, message: 'no heartbeat received yet', certDays: null };
  }
  const age = Date.now() - last;
  if (age > graceMs) {
    return { ok: false, latency: null, message: `last heartbeat ${Math.round(age / 1000)}s ago`, certDays: null };
  }
  return { ok: true, latency: null, message: 'heartbeat received', certDays: null };
}

async function runCheck(monitor, state = {}) {
  switch (monitor.type) {
    case 'http': return checkHttp(monitor);
    case 'tcp': return checkTcp(monitor);
    case 'ping': return checkPing(monitor);
    case 'push': return checkPush(monitor, state);
    default:
      return { ok: false, latency: null, message: `unknown monitor type "${monitor.type}"`, certDays: null };
  }
}

module.exports = { runCheck, statusMatcher, certDaysRemaining };
