'use strict';

const test = require('node:test');
const assert = require('node:assert');
const http = require('http');
const https = require('https');
const os = require('os');
const path = require('path');
const fs = require('fs');

const { createApp } = require('../server');
const { statusMatcher } = require('../lib/checks');

function listen(server) {
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server.address().port)));
}

function tmpDataFile() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pulsewatch-test-'));
  return path.join(dir, 'data.json');
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

test('status matcher parses ranges and lists', () => {
  const m = statusMatcher('200-299,301,404');
  assert.ok(m(200) && m(250) && m(301) && m(404));
  assert.ok(!m(300) && !m(500));
  const def = statusMatcher(undefined);
  assert.ok(def(204) && !def(404));
});

test('https monitor with self-signed cert: down by default, up with tlsIgnore', async (t) => {
  // Cert CN is "selfsigned.test" and self-signed, so hitting it via
  // https://127.0.0.1 fails TLS verification — the internal-IP scenario.
  const fixtures = path.join(__dirname, 'fixtures');
  const tlsServer = https.createServer({
    key: fs.readFileSync(path.join(fixtures, 'selfsigned.key')),
    cert: fs.readFileSync(path.join(fixtures, 'selfsigned.crt'))
  }, (req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('secure hello');
  });
  const tlsPort = await listen(tlsServer);
  t.after(() => tlsServer.close());

  const { runCheck } = require('../lib/checks');
  const base = {
    type: 'http', name: 'internal', url: `https://127.0.0.1:${tlsPort}/`,
    timeout: 5, keyword: 'secure hello'
  };

  const strict = await runCheck({ ...base });
  assert.equal(strict.ok, false);
  assert.match(strict.message, /certificate|altnames|self.signed/i);

  const relaxed = await runCheck({ ...base, tlsIgnore: true, certCheck: true });
  assert.equal(relaxed.ok, true, `expected up, got: ${relaxed.message}`);
  assert.ok(relaxed.certDays > 300, `cert expiry should still be reported (got ${relaxed.certDays})`);
});

test('end-to-end: auth, monitors, checks, notifications, status page', async (t) => {
  // Target site whose behavior we can flip between healthy and broken.
  let healthy = true;
  const target = http.createServer((req, res) => {
    if (healthy) {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('hello world, all good here');
    } else {
      res.writeHead(500);
      res.end('boom');
    }
  });
  const targetPort = await listen(target);

  // Webhook receiver capturing notification payloads.
  const received = [];
  const hook = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => { raw += c; });
    req.on('end', () => {
      received.push(JSON.parse(raw));
      res.writeHead(200); res.end('ok');
    });
  });
  const hookPort = await listen(hook);

  const app = createApp({ dataFile: tmpDataFile() });
  app.scheduler.running = true; // allow scheduling without starting boot timers
  const port = await listen(app.server);
  const base = `http://127.0.0.1:${port}`;

  let cookie = '';
  const call = async (method, apiPath, body) => {
    const res = await fetch(base + apiPath, {
      method,
      headers: {
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...(cookie ? { Cookie: cookie } : {})
      },
      body: body ? JSON.stringify(body) : undefined
    });
    const setCookie = res.headers.get('set-cookie');
    if (setCookie) cookie = setCookie.split(';')[0];
    return { status: res.status, data: await res.json().catch(() => ({})) };
  };

  t.after(() => {
    app.scheduler.stop();
    app.server.close();
    target.close();
    hook.close();
  });

  // --- auth flow ---
  let r = await call('GET', '/api/auth/status');
  assert.equal(r.data.needsSetup, true);

  r = await call('POST', '/api/auth/setup', { password: 'short' });
  assert.equal(r.status, 400);

  r = await call('POST', '/api/auth/setup', { password: 'hunter2hunter2' });
  assert.equal(r.status, 200);

  // authenticated now
  r = await call('GET', '/api/monitors');
  assert.equal(r.status, 200);

  // unauthenticated is rejected
  const saved = cookie; cookie = '';
  r = await call('GET', '/api/monitors');
  assert.equal(r.status, 401);
  cookie = saved;

  // wrong login fails
  {
    const res = await fetch(base + '/api/auth/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: 'wrong-password' })
    });
    assert.equal(res.status, 401);
  }

  // --- channels ---
  r = await call('POST', '/api/channels', {
    type: 'webhook', name: 'test hook', config: { url: `http://127.0.0.1:${hookPort}/notify` }
  });
  assert.equal(r.status, 201);
  const channelId = r.data.id;

  r = await call('POST', `/api/channels/${channelId}/test`, {});
  assert.equal(r.data.ok, true);
  assert.equal(received.length, 1);
  assert.equal(received[0].event, 'test');

  // invalid channel rejected
  r = await call('POST', '/api/channels', { type: 'slack', name: 'no url', config: {} });
  assert.equal(r.status, 400);

  // --- http monitor: up -> down -> recovered, with notifications ---
  r = await call('POST', '/api/monitors', {
    type: 'http', name: 'Target site', url: `http://127.0.0.1:${targetPort}/`,
    keyword: 'hello', interval: 60, timeout: 5, retries: 0, channels: [channelId]
  });
  assert.equal(r.status, 201);
  const monitorId = r.data.id;
  await sleep(300); // let the initial scheduled check run

  r = await call('POST', `/api/monitors/${monitorId}/check`, {});
  assert.equal(r.data.monitor.status, 'up');
  assert.ok(r.data.monitor.lastLatency >= 0);

  healthy = false;
  r = await call('POST', `/api/monitors/${monitorId}/check`, {});
  assert.equal(r.data.monitor.status, 'down');
  assert.match(r.data.monitor.lastMessage, /HTTP 500/);
  await sleep(200);
  const downEvents = received.filter((p) => p.event === 'down');
  assert.equal(downEvents.length, 1);
  assert.equal(downEvents[0].monitor.id, monitorId);

  // incident opened
  r = await call('GET', `/api/monitors/${monitorId}`);
  assert.equal(r.data.incidents.length, 1);
  assert.equal(r.data.incidents[0].endedAt, null);

  healthy = true;
  r = await call('POST', `/api/monitors/${monitorId}/check`, {});
  assert.equal(r.data.monitor.status, 'up');
  await sleep(200);
  assert.equal(received.filter((p) => p.event === 'up').length, 1);

  r = await call('GET', `/api/monitors/${monitorId}`);
  assert.ok(r.data.incidents[0].endedAt > 0);
  assert.ok(r.data.uptime24h > 0 && r.data.uptime24h < 1);

  // keyword mismatch takes the monitor down
  r = await call('PUT', `/api/monitors/${monitorId}`, { keyword: 'definitely-not-present' });
  assert.equal(r.status, 200);
  r = await call('POST', `/api/monitors/${monitorId}/check`, {});
  assert.equal(r.data.monitor.status, 'down');
  assert.match(r.data.monitor.lastMessage, /keyword/);
  r = await call('PUT', `/api/monitors/${monitorId}`, { keyword: 'hello' });
  r = await call('POST', `/api/monitors/${monitorId}/check`, {});
  assert.equal(r.data.monitor.status, 'up');

  // pause / resume
  r = await call('POST', `/api/monitors/${monitorId}/pause`, {});
  assert.equal(r.data.status, 'paused');
  r = await call('POST', `/api/monitors/${monitorId}/resume`, {});
  assert.notEqual(r.data.status, 'paused');
  r = await call('POST', `/api/monitors/${monitorId}/check`, {});
  assert.equal(r.data.monitor.status, 'up');

  // validation
  r = await call('POST', '/api/monitors', { type: 'http', name: 'bad', url: 'not a url' });
  assert.equal(r.status, 400);
  r = await call('POST', '/api/monitors', { type: 'tcp', name: 'no port', host: 'x' });
  assert.equal(r.status, 400);

  // --- tcp monitor against the target server ---
  r = await call('POST', '/api/monitors', {
    type: 'tcp', name: 'Target port', host: '127.0.0.1', port: targetPort, retries: 0
  });
  const tcpId = r.data.id;
  r = await call('POST', `/api/monitors/${tcpId}/check`, {});
  assert.equal(r.data.monitor.status, 'up');

  // --- push monitor ---
  r = await call('POST', '/api/monitors', {
    type: 'push', name: 'Nightly job', interval: 60, grace: 60, retries: 0
  });
  const pushId = r.data.id;
  const pushToken = r.data.pushToken;
  assert.ok(pushToken);

  r = await call('POST', `/api/monitors/${pushId}/check`, {});
  assert.equal(r.data.monitor.status, 'down'); // no beat yet

  {
    const res = await fetch(`${base}/api/push/${pushToken}?ms=42`);
    assert.equal(res.status, 200);
  }
  r = await call('GET', `/api/monitors/${pushId}`);
  assert.equal(r.data.status, 'up');
  assert.equal(r.data.lastLatency, 42);

  // --- status page ---
  r = await call('PUT', '/api/settings', {
    title: 'My PulseWatch',
    statusPage: { enabled: true, title: 'Acme Status', monitors: [monitorId, tcpId] }
  });
  assert.equal(r.data.statusPage.monitors.length, 2);

  {
    const res = await fetch(`${base}/api/public/status`);
    const data = await res.json();
    assert.equal(data.title, 'Acme Status');
    assert.equal(data.monitors.length, 2);
    assert.equal(data.overall, 'up');
    // no auth cookie needed, and no secrets leaked
    assert.ok(!JSON.stringify(data).includes(pushToken));
  }

  // --- overview & deletion ---
  r = await call('GET', '/api/overview');
  assert.equal(r.data.total, 3);
  assert.ok(r.data.up >= 2);

  r = await call('DELETE', `/api/monitors/${tcpId}`);
  assert.equal(r.status, 200);
  r = await call('GET', '/api/overview');
  assert.equal(r.data.total, 2);

  // static pages served
  for (const p of ['/', '/status', '/app.js', '/style.css']) {
    const res = await fetch(base + p);
    assert.equal(res.status, 200, `expected 200 for ${p}`);
  }

  // password change invalidates other sessions
  r = await call('POST', '/api/settings/password', { current: 'hunter2hunter2', next: 'newpassword99' });
  assert.equal(r.status, 200);
  r = await call('GET', '/api/monitors'); // new cookie from response keeps us logged in
  assert.equal(r.status, 200);
});
