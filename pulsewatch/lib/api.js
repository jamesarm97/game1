'use strict';

const crypto = require('crypto');
const { Router, readJson, sendJson } = require('./http-util');
const { hashPassword, verifyPassword, sessionToken, sessionCookie, clearCookie } = require('./auth');
const { sendNotification } = require('./notify');

const MONITOR_TYPES = ['http', 'tcp', 'ping', 'push'];
const CHANNEL_TYPES = ['email', 'pushover', 'slack', 'discord', 'telegram', 'webhook'];

class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.statusCode = status;
  }
}

function sanitizeMonitor(input, existing = {}) {
  const m = { ...existing };
  const type = input.type || existing.type;
  if (!MONITOR_TYPES.includes(type)) throw new ApiError(400, `type must be one of: ${MONITOR_TYPES.join(', ')}`);
  m.type = type;

  m.name = String(input.name ?? existing.name ?? '').trim();
  if (!m.name) throw new ApiError(400, 'name is required');

  m.interval = clampInt(input.interval ?? existing.interval, 10, 86400, 60);
  m.timeout = clampInt(input.timeout ?? existing.timeout, 1, 120, 10);
  m.retries = clampInt(input.retries ?? existing.retries, 0, 10, 1);
  m.active = input.active != null ? !!input.active : existing.active !== false;
  m.channels = Array.isArray(input.channels) ? input.channels.map(String)
    : existing.channels || [];

  if (type === 'http') {
    m.url = String(input.url ?? existing.url ?? '').trim();
    let parsed;
    try { parsed = new URL(m.url); } catch { /* handled below */ }
    if (!parsed || !['http:', 'https:'].includes(parsed.protocol)) {
      throw new ApiError(400, 'url must be a valid http(s) URL');
    }
    m.method = ['GET', 'HEAD', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS']
      .includes(input.method) ? input.method : existing.method || 'GET';
    m.acceptedStatus = String(input.acceptedStatus ?? existing.acceptedStatus ?? '200-299').trim() || '200-299';
    m.keyword = String(input.keyword ?? existing.keyword ?? '').trim();
    m.keywordInvert = input.keywordInvert != null ? !!input.keywordInvert : !!existing.keywordInvert;
    m.body = typeof input.body === 'string' ? input.body : existing.body || '';
    m.headers = sanitizePairs(input.headers ?? existing.headers);
    m.certCheck = input.certCheck != null ? !!input.certCheck : !!existing.certCheck;
    m.certExpiryDays = clampInt(input.certExpiryDays ?? existing.certExpiryDays, 1, 365, 14);
  } else if (type === 'tcp' || type === 'ping') {
    m.host = String(input.host ?? existing.host ?? '').trim();
    if (!m.host) throw new ApiError(400, 'host is required');
    if (type === 'tcp') {
      m.port = clampInt(input.port ?? existing.port, 1, 65535, null);
      if (!m.port) throw new ApiError(400, 'port is required for tcp monitors');
    }
  } else if (type === 'push') {
    m.grace = clampInt(input.grace ?? existing.grace, 0, 86400, 60);
  }
  return m;
}

function clampInt(value, min, max, fallback) {
  const n = parseInt(value, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function sanitizePairs(pairs) {
  if (!Array.isArray(pairs)) return [];
  return pairs
    .map((p) => ({ name: String(p.name || '').trim(), value: String(p.value || '') }))
    .filter((p) => p.name)
    .slice(0, 20);
}

const CHANNEL_FIELDS = {
  email: ['host', 'port', 'secure', 'username', 'password', 'from', 'fromName', 'to'],
  pushover: ['apiToken', 'userKey', 'device', 'sound', 'priority'],
  slack: ['webhookUrl'],
  discord: ['webhookUrl'],
  telegram: ['botToken', 'chatId'],
  webhook: ['url', 'headers']
};

const CHANNEL_REQUIRED = {
  email: ['host', 'to'],
  pushover: ['apiToken', 'userKey'],
  slack: ['webhookUrl'],
  discord: ['webhookUrl'],
  telegram: ['botToken', 'chatId'],
  webhook: ['url']
};

function sanitizeChannel(input, existing = {}) {
  const type = input.type || existing.type;
  if (!CHANNEL_TYPES.includes(type)) {
    throw new ApiError(400, `type must be one of: ${CHANNEL_TYPES.join(', ')}`);
  }
  const name = String(input.name ?? existing.name ?? '').trim();
  if (!name) throw new ApiError(400, 'name is required');

  const config = { ...(existing.config || {}) };
  const inputConfig = input.config || {};
  for (const field of CHANNEL_FIELDS[type]) {
    if (field in inputConfig) {
      if (field === 'secure') config.secure = !!inputConfig.secure;
      else if (field === 'port' || field === 'priority') config[field] = clampInt(inputConfig[field], field === 'port' ? 1 : -2, field === 'port' ? 65535 : 2, undefined);
      else if (field === 'headers') config.headers = sanitizePairs(inputConfig.headers);
      else config[field] = String(inputConfig[field] ?? '');
    }
  }
  for (const field of CHANNEL_REQUIRED[type]) {
    if (!config[field]) throw new ApiError(400, `${type} channel requires "${field}"`);
  }
  return { type, name, config, enabled: input.enabled != null ? !!input.enabled : existing.enabled !== false };
}

function monitorView(store, scheduler, monitor, opts = {}) {
  const st = scheduler.snapshot(monitor.id);
  const view = {
    id: monitor.id,
    name: monitor.name,
    type: monitor.type,
    url: monitor.url,
    host: monitor.host,
    port: monitor.port,
    method: monitor.method,
    acceptedStatus: monitor.acceptedStatus,
    keyword: monitor.keyword,
    keywordInvert: monitor.keywordInvert,
    headers: monitor.headers,
    body: monitor.body,
    certCheck: monitor.certCheck,
    certExpiryDays: monitor.certExpiryDays,
    grace: monitor.grace,
    interval: monitor.interval,
    timeout: monitor.timeout,
    retries: monitor.retries,
    active: monitor.active !== false,
    channels: monitor.channels || [],
    pushToken: monitor.pushToken,
    createdAt: monitor.createdAt,
    status: monitor.active === false ? 'paused' : st.status,
    lastCheck: st.lastCheck,
    lastLatency: st.lastLatency,
    lastMessage: st.lastMessage,
    certDays: st.certDays,
    uptime24h: store.uptimeFromHeartbeats(monitor.id, 24 * 3600 * 1000),
    uptime30d: store.uptimeFromIncidents(monitor.id, 30 * 24 * 3600 * 1000),
    recentBeats: store.heartbeats(monitor.id, opts.beats || 50)
  };
  return view;
}

function channelView(channel) {
  // Mask secrets when sending config back to the browser.
  const config = { ...(channel.config || {}) };
  for (const secret of ['password', 'apiToken', 'botToken']) {
    if (config[secret]) config[secret] = '••••••';
  }
  if (config.webhookUrl) config.webhookUrl = maskUrl(config.webhookUrl);
  return { id: channel.id, type: channel.type, name: channel.name, enabled: channel.enabled !== false, config };
}

function maskUrl(url) {
  try {
    const u = new URL(url);
    const tail = u.pathname.length > 12 ? '…' + u.pathname.slice(-6) : u.pathname;
    return `${u.origin}${tail}`;
  } catch {
    return '(configured)';
  }
}

function buildRouter({ store, scheduler }) {
  const router = new Router();

  const requireAuth = (req) => {
    if (!store.validSession(sessionToken(req))) throw new ApiError(401, 'authentication required');
  };

  // ---- auth ----

  router.get('/api/auth/status', async (req, res) => {
    sendJson(res, 200, {
      needsSetup: !store.data.settings.passwordHash,
      authed: store.validSession(sessionToken(req)),
      title: store.data.settings.title
    });
  });

  router.post('/api/auth/setup', async (req, res) => {
    if (store.data.settings.passwordHash) throw new ApiError(409, 'already configured');
    const { password } = await readJson(req);
    if (!password || String(password).length < 8) {
      throw new ApiError(400, 'password must be at least 8 characters');
    }
    store.data.settings.passwordHash = hashPassword(String(password));
    const token = store.createSession();
    store.save();
    sendJson(res, 200, { ok: true }, { 'Set-Cookie': sessionCookie(token) });
  });

  router.post('/api/auth/login', async (req, res) => {
    const { password } = await readJson(req);
    if (!verifyPassword(String(password || ''), store.data.settings.passwordHash)) {
      throw new ApiError(401, 'invalid password');
    }
    const token = store.createSession();
    sendJson(res, 200, { ok: true }, { 'Set-Cookie': sessionCookie(token) });
  });

  router.post('/api/auth/logout', async (req, res) => {
    const token = sessionToken(req);
    if (token) store.destroySession(token);
    sendJson(res, 200, { ok: true }, { 'Set-Cookie': clearCookie() });
  });

  // ---- monitors ----

  router.get('/api/monitors', async (req, res) => {
    requireAuth(req);
    sendJson(res, 200, store.data.monitors.map((m) => monitorView(store, scheduler, m)));
  });

  router.post('/api/monitors', async (req, res) => {
    requireAuth(req);
    const body = await readJson(req);
    const monitor = sanitizeMonitor(body);
    monitor.id = store.newId();
    monitor.createdAt = Date.now();
    if (monitor.type === 'push') monitor.pushToken = crypto.randomBytes(12).toString('hex');
    store.data.monitors.push(monitor);
    store.save();
    scheduler.schedule(monitor, 100);
    sendJson(res, 201, monitorView(store, scheduler, monitor));
  });

  router.get('/api/monitors/:id', async (req, res, params, query) => {
    requireAuth(req);
    const monitor = store.getMonitor(params.id);
    if (!monitor) throw new ApiError(404, 'monitor not found');
    const beats = clampInt(query.get('beats'), 1, 2500, 200);
    const view = monitorView(store, scheduler, monitor, { beats });
    view.incidents = store.incidents(monitor.id, 50);
    sendJson(res, 200, view);
  });

  router.put('/api/monitors/:id', async (req, res, params) => {
    requireAuth(req);
    const monitor = store.getMonitor(params.id);
    if (!monitor) throw new ApiError(404, 'monitor not found');
    const body = await readJson(req);
    const updated = sanitizeMonitor(body, monitor);
    Object.assign(monitor, updated);
    store.save();
    scheduler.schedule(monitor, 100);
    sendJson(res, 200, monitorView(store, scheduler, monitor));
  });

  router.delete('/api/monitors/:id', async (req, res, params) => {
    requireAuth(req);
    if (!store.getMonitor(params.id)) throw new ApiError(404, 'monitor not found');
    scheduler.removeMonitor(params.id);
    store.deleteMonitor(params.id);
    sendJson(res, 200, { ok: true });
  });

  router.post('/api/monitors/:id/pause', async (req, res, params) => {
    requireAuth(req);
    const monitor = store.getMonitor(params.id);
    if (!monitor) throw new ApiError(404, 'monitor not found');
    monitor.active = false;
    store.save();
    scheduler.schedule(monitor);
    sendJson(res, 200, monitorView(store, scheduler, monitor));
  });

  router.post('/api/monitors/:id/resume', async (req, res, params) => {
    requireAuth(req);
    const monitor = store.getMonitor(params.id);
    if (!monitor) throw new ApiError(404, 'monitor not found');
    monitor.active = true;
    store.save();
    scheduler.ensureState(monitor.id).status = 'pending';
    scheduler.schedule(monitor, 100);
    sendJson(res, 200, monitorView(store, scheduler, monitor));
  });

  router.post('/api/monitors/:id/check', async (req, res, params) => {
    requireAuth(req);
    const monitor = store.getMonitor(params.id);
    if (!monitor) throw new ApiError(404, 'monitor not found');
    const result = await scheduler.check(monitor.id);
    sendJson(res, 200, { result, monitor: monitorView(store, scheduler, monitor) });
  });

  // ---- channels ----

  router.get('/api/channels', async (req, res) => {
    requireAuth(req);
    sendJson(res, 200, store.data.channels.map(channelView));
  });

  router.post('/api/channels', async (req, res) => {
    requireAuth(req);
    const channel = sanitizeChannel(await readJson(req));
    channel.id = store.newId();
    store.data.channels.push(channel);
    store.save();
    sendJson(res, 201, channelView(channel));
  });

  router.put('/api/channels/:id', async (req, res, params) => {
    requireAuth(req);
    const channel = store.data.channels.find((c) => c.id === params.id);
    if (!channel) throw new ApiError(404, 'channel not found');
    const body = await readJson(req);
    // Ignore masked placeholder secrets the UI echoes back unchanged.
    if (body.config) {
      for (const [key, value] of Object.entries(body.config)) {
        if (value === '••••••') delete body.config[key];
        if (key === 'webhookUrl' && typeof value === 'string' && value.includes('…')) delete body.config[key];
      }
    }
    Object.assign(channel, sanitizeChannel(body, channel));
    store.save();
    sendJson(res, 200, channelView(channel));
  });

  router.delete('/api/channels/:id', async (req, res, params) => {
    requireAuth(req);
    const before = store.data.channels.length;
    store.data.channels = store.data.channels.filter((c) => c.id !== params.id);
    if (store.data.channels.length === before) throw new ApiError(404, 'channel not found');
    for (const monitor of store.data.monitors) {
      monitor.channels = (monitor.channels || []).filter((cid) => cid !== params.id);
    }
    store.save();
    sendJson(res, 200, { ok: true });
  });

  router.post('/api/channels/:id/test', async (req, res, params) => {
    requireAuth(req);
    const channel = store.data.channels.find((c) => c.id === params.id);
    if (!channel) throw new ApiError(404, 'channel not found');
    try {
      await sendNotification(channel, {
        event: 'test',
        monitor: null,
        message: `This is a test notification from ${store.data.settings.title}. Your "${channel.name}" channel works!`
      });
      sendJson(res, 200, { ok: true });
    } catch (err) {
      sendJson(res, 200, { ok: false, error: err.message });
    }
  });

  // ---- settings ----

  router.get('/api/settings', async (req, res) => {
    requireAuth(req);
    const { title, statusPage } = store.data.settings;
    sendJson(res, 200, { title, statusPage });
  });

  router.put('/api/settings', async (req, res) => {
    requireAuth(req);
    const body = await readJson(req);
    const settings = store.data.settings;
    if (typeof body.title === 'string' && body.title.trim()) settings.title = body.title.trim().slice(0, 80);
    if (body.statusPage && typeof body.statusPage === 'object') {
      const sp = settings.statusPage;
      if (body.statusPage.enabled != null) sp.enabled = !!body.statusPage.enabled;
      if (typeof body.statusPage.title === 'string') sp.title = body.statusPage.title.trim().slice(0, 120);
      if (typeof body.statusPage.description === 'string') sp.description = body.statusPage.description.trim().slice(0, 500);
      if (Array.isArray(body.statusPage.monitors)) {
        sp.monitors = body.statusPage.monitors.map(String).filter((id) => store.getMonitor(id));
      }
    }
    store.save();
    sendJson(res, 200, { title: settings.title, statusPage: settings.statusPage });
  });

  router.post('/api/settings/password', async (req, res) => {
    requireAuth(req);
    const { current, next } = await readJson(req);
    if (!verifyPassword(String(current || ''), store.data.settings.passwordHash)) {
      throw new ApiError(400, 'current password is incorrect');
    }
    if (!next || String(next).length < 8) throw new ApiError(400, 'new password must be at least 8 characters');
    store.data.settings.passwordHash = hashPassword(String(next));
    store.data.sessions = {};
    const token = store.createSession();
    store.save();
    sendJson(res, 200, { ok: true }, { 'Set-Cookie': sessionCookie(token) });
  });

  // ---- public endpoints ----

  router.get('/api/public/status', async (req, res) => {
    const sp = store.data.settings.statusPage;
    if (!sp.enabled) throw new ApiError(404, 'status page disabled');
    const monitors = sp.monitors
      .map((id) => store.getMonitor(id))
      .filter(Boolean)
      .map((m) => {
        const st = scheduler.snapshot(m.id);
        return {
          name: m.name,
          status: m.active === false ? 'paused' : st.status,
          lastLatency: st.lastLatency,
          uptime24h: store.uptimeFromHeartbeats(m.id, 24 * 3600 * 1000),
          uptime30d: store.uptimeFromIncidents(m.id, 30 * 24 * 3600 * 1000),
          recentBeats: store.heartbeats(m.id, 50).map((b) => ({ t: b.t, ok: b.ok, ms: b.ms }))
        };
      });
    const overall = monitors.length === 0 ? 'unknown'
      : monitors.every((m) => m.status === 'up' || m.status === 'paused') ? 'up'
      : monitors.some((m) => m.status === 'down') ? 'down' : 'degraded';
    sendJson(res, 200, { title: sp.title, description: sp.description, overall, monitors, generatedAt: Date.now() });
  });

  const handlePush = async (req, res, params, query) => {
    const monitor = store.data.monitors.find((m) => m.type === 'push' && m.pushToken === params.token);
    if (!monitor) throw new ApiError(404, 'unknown push token');
    const latency = clampInt(query.get('ms'), 0, 3600000, null);
    await scheduler.recordPush(monitor, latency);
    sendJson(res, 200, { ok: true });
  };
  router.get('/api/push/:token', handlePush);
  router.post('/api/push/:token', handlePush);

  router.get('/api/overview', async (req, res) => {
    requireAuth(req);
    const monitors = store.data.monitors.map((m) => monitorView(store, scheduler, m, { beats: 1 }));
    sendJson(res, 200, {
      total: monitors.length,
      up: monitors.filter((m) => m.status === 'up').length,
      down: monitors.filter((m) => m.status === 'down').length,
      paused: monitors.filter((m) => m.status === 'paused').length,
      pending: monitors.filter((m) => m.status === 'pending').length,
      incidents: store.incidents(null, 20)
    });
  });

  return router;
}

module.exports = { buildRouter, ApiError, sanitizeMonitor, sanitizeChannel };
