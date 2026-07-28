'use strict';

const net = require('net');
const http = require('http');
const https = require('https');
const { execFile } = require('child_process');

const MAX_REDIRECTS = 5;
const MAX_BODY_BYTES = 512 * 1024; // keyword search window

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

// One HTTP(S) request implemented on node:http/https (not fetch) so TLS
// certificate verification can be disabled per monitor (self-signed certs,
// monitoring by internal IP). Returns {status, body, certDays} or throws.
function httpRequest(urlStr, monitor, { signal, wantBody, firstHop, methodOverride }) {
  return new Promise((resolve, reject) => {
    let u;
    try { u = new URL(urlStr); } catch { return reject(new Error(`invalid URL "${urlStr}"`)); }
    const isHttps = u.protocol === 'https:';
    const mod = isHttps ? https : http;

    const headers = {};
    for (const h of monitor.headers || []) {
      if (h.name) headers[h.name] = h.value || '';
    }
    if (!Object.keys(headers).some((k) => k.toLowerCase() === 'user-agent')) {
      headers['User-Agent'] = 'PulseWatch/1.0 (uptime monitor)';
    }
    const method = methodOverride || monitor.method || 'GET';
    const body = ['GET', 'HEAD'].includes(method) ? null : monitor.body || null;

    const req = mod.request(u, {
      method,
      headers,
      signal,
      rejectUnauthorized: !monitor.tlsIgnore
    }, (res) => {
      let certDays = null;
      if (isHttps && firstHop) {
        try {
          const cert = res.socket.getPeerCertificate();
          if (cert && cert.valid_to) {
            certDays = Math.floor((new Date(cert.valid_to).getTime() - Date.now()) / 86400000);
          }
        } catch { /* cert info is best-effort */ }
      }
      const chunks = [];
      let size = 0;
      res.on('data', (chunk) => {
        if (wantBody && size < MAX_BODY_BYTES) {
          chunks.push(chunk);
          size += chunk.length;
        }
      });
      res.on('end', () => resolve({
        status: res.statusCode,
        location: res.headers.location,
        body: wantBody ? Buffer.concat(chunks).toString('utf8') : '',
        certDays
      }));
      res.on('error', reject);
    });
    req.on('error', reject);
    if (body != null) req.write(body);
    req.end();
  });
}

async function checkHttp(monitor) {
  const timeoutMs = (monitor.timeout || 10) * 1000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const started = Date.now();
  const result = { ok: false, latency: null, message: '', certDays: null };
  try {
    const wantBody = !!monitor.keyword;
    let url = monitor.url;
    let res = null;
    let methodOverride = null;
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      res = await httpRequest(url, monitor, {
        signal: controller.signal, wantBody, firstHop: hop === 0, methodOverride
      });
      if (hop === 0 && res.certDays != null) result.certDays = res.certDays;
      if (![301, 302, 303, 307, 308].includes(res.status) || !res.location) break;
      if (hop === MAX_REDIRECTS) {
        result.latency = Date.now() - started;
        result.message = `too many redirects (>${MAX_REDIRECTS})`;
        return result;
      }
      // Browsers/fetch re-issue 301/302/303 redirects of non-GET requests as GET.
      if ([301, 302, 303].includes(res.status)) methodOverride = 'GET';
      url = new URL(res.location, url).href;
    }
    result.latency = Date.now() - started;
    if (!statusMatcher(monitor.acceptedStatus)(res.status)) {
      result.message = `HTTP ${res.status}`;
      return result;
    }
    if (monitor.keyword) {
      const found = res.body.includes(monitor.keyword);
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
    result.message = err.name === 'AbortError' || err.code === 'ABORT_ERR'
      ? `timeout after ${monitor.timeout || 10}s`
      : (err.cause && err.cause.message) || err.message;
    return result;
  } finally {
    clearTimeout(timer);
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

module.exports = { runCheck, statusMatcher };
