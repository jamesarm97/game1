'use strict';

const { sendMail } = require('./smtp');

// payload: { event: 'down'|'up'|'test'|'cert', monitor, message, durationMs? }

function titleFor(payload) {
  const name = payload.monitor ? payload.monitor.name : 'PulseWatch';
  switch (payload.event) {
    case 'down': return `🔴 ${name} is DOWN`;
    case 'up': return `✅ ${name} is UP`;
    case 'cert': return `⚠️ ${name}: TLS certificate expiring soon`;
    default: return `🔔 PulseWatch test notification`;
  }
}

function bodyFor(payload) {
  const lines = [payload.message];
  const m = payload.monitor;
  if (m) {
    const target = m.type === 'http' ? m.url
      : m.type === 'push' ? 'push heartbeat'
      : `${m.host}${m.port ? ':' + m.port : ''}`;
    lines.push(`Monitor: ${m.name} (${m.type} — ${target})`);
  }
  if (payload.event === 'up' && payload.durationMs) {
    lines.push(`Downtime: ${humanDuration(payload.durationMs)}`);
  }
  lines.push(`Time: ${new Date().toISOString()}`);
  return lines.filter(Boolean).join('\n');
}

function humanDuration(ms) {
  const sec = Math.round(ms / 1000);
  if (sec < 60) return `${sec}s`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m ${sec % 60}s`;
  return `${Math.floor(sec / 3600)}h ${Math.floor((sec % 3600) / 60)}m`;
}

async function postJson(url, body, headers = {}) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15000)
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status} ${text.slice(0, 200)}`);
  }
}

const senders = {
  async email(config, payload) {
    await sendMail(config, {
      to: config.to,
      subject: titleFor(payload),
      text: bodyFor(payload)
    });
  },

  async pushover(config, payload) {
    const body = new URLSearchParams({
      token: config.apiToken,
      user: config.userKey,
      title: titleFor(payload),
      message: bodyFor(payload),
      priority: String(payload.event === 'down' ? (config.priority ?? 1) : 0)
    });
    if (config.device) body.set('device', config.device);
    if (config.sound) body.set('sound', config.sound);
    const res = await fetch('https://api.pushover.net/1/messages.json', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
      signal: AbortSignal.timeout(15000)
    });
    if (!res.ok) throw new Error(`Pushover HTTP ${res.status}`);
  },

  async slack(config, payload) {
    await postJson(config.webhookUrl, {
      text: `*${titleFor(payload)}*\n${bodyFor(payload)}`
    });
  },

  async discord(config, payload) {
    await postJson(config.webhookUrl, {
      username: 'PulseWatch',
      embeds: [{
        title: titleFor(payload),
        description: bodyFor(payload),
        color: payload.event === 'down' ? 0xe5484d : payload.event === 'up' ? 0x30a46c : 0xf5a524
      }]
    });
  },

  async telegram(config, payload) {
    await postJson(`https://api.telegram.org/bot${config.botToken}/sendMessage`, {
      chat_id: config.chatId,
      text: `${titleFor(payload)}\n${bodyFor(payload)}`
    });
  },

  async webhook(config, payload) {
    const headers = {};
    for (const h of config.headers || []) {
      if (h.name) headers[h.name] = h.value || '';
    }
    await postJson(config.url, {
      event: payload.event,
      title: titleFor(payload),
      message: bodyFor(payload),
      monitor: payload.monitor ? {
        id: payload.monitor.id,
        name: payload.monitor.name,
        type: payload.monitor.type,
        url: payload.monitor.url || null,
        host: payload.monitor.host || null
      } : null,
      timestamp: new Date().toISOString()
    }, headers);
  }
};

async function sendNotification(channel, payload) {
  const sender = senders[channel.type];
  if (!sender) throw new Error(`unknown channel type "${channel.type}"`);
  await sender(channel.config || {}, payload);
}

// Fan out to all of a monitor's enabled channels; never throws.
async function notifyChannels(store, monitor, payload) {
  const channels = store.data.channels.filter(
    (c) => c.enabled !== false && (monitor.channels || []).includes(c.id)
  );
  const results = [];
  for (const channel of channels) {
    try {
      await sendNotification(channel, payload);
      results.push({ channel: channel.name, ok: true });
    } catch (err) {
      console.error(`[notify] ${channel.type} "${channel.name}" failed: ${err.message}`);
      results.push({ channel: channel.name, ok: false, error: err.message });
    }
  }
  return results;
}

module.exports = { sendNotification, notifyChannels, titleFor, bodyFor };
