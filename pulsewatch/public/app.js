/* PulseWatch dashboard SPA (no framework, no build step) */
'use strict';

const app = document.getElementById('app');
let refreshTimer = null;

// ---------- helpers ----------

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

async function api(path, opts = {}) {
  const res = await fetch(path, {
    headers: opts.body ? { 'Content-Type': 'application/json' } : {},
    method: opts.method || (opts.body ? 'POST' : 'GET'),
    body: opts.body ? JSON.stringify(opts.body) : undefined
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && !path.startsWith('/api/auth')) {
    renderLogin();
    throw new Error('authentication required');
  }
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

function fmtUptime(ratio) {
  if (ratio == null) return '—';
  return (ratio * 100).toFixed(ratio >= 0.9995 ? 2 : 2) + '%';
}

function fmtAgo(ts) {
  if (!ts) return 'never';
  const sec = Math.round((Date.now() - ts) / 1000);
  if (sec < 60) return `${sec}s ago`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`;
  return `${Math.floor(sec / 86400)}d ago`;
}

function fmtDuration(ms) {
  if (ms == null) return '—';
  const sec = Math.round(ms / 1000);
  if (sec < 60) return `${sec}s`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m ${sec % 60}s`;
  return `${Math.floor(sec / 3600)}h ${Math.floor((sec % 3600) / 60)}m`;
}

function targetOf(m) {
  if (m.type === 'http') return m.url;
  if (m.type === 'push') return 'push heartbeat';
  return m.port ? `${m.host}:${m.port}` : m.host;
}

function beatsHtml(beats, count = 40) {
  const shown = (beats || []).slice(-count);
  const pad = count - shown.length;
  let html = '<div class="beats">';
  for (let i = 0; i < pad; i++) html += '<i></i>';
  for (const b of shown) {
    const title = `${new Date(b.t).toLocaleString()} — ${b.ok ? 'up' : 'down'}${b.ms != null ? ` (${b.ms}ms)` : ''}`;
    html += `<i class="${b.ok ? 'ok' : 'fail'}" title="${esc(title)}"></i>`;
  }
  return html + '</div>';
}

function latencyChart(beats) {
  const data = (beats || []).filter((b) => b.ms != null);
  if (data.length < 2) return '<p class="muted">Not enough data yet for a chart.</p>';
  const w = 800, h = 130, padY = 12;
  const max = Math.max(...data.map((b) => b.ms), 1);
  const pts = data.map((b, i) => {
    const x = (i / (data.length - 1)) * w;
    const y = h - padY - (b.ms / max) * (h - padY * 2);
    return [x, y, b];
  });
  const line = pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const dots = pts.filter(([, , b]) => !b.ok)
    .map(([x, y]) => `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3" fill="var(--down)"/>`).join('');
  return `<div class="chart-wrap"><svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">
    <polyline points="${line}" fill="none" stroke="var(--accent)" stroke-width="1.6"/>
    ${dots}
    <text x="4" y="14" fill="var(--text-dim)" font-size="11">max ${max}ms</text>
  </svg></div>`;
}

function stopRefresh() {
  if (refreshTimer) clearInterval(refreshTimer);
  refreshTimer = null;
}

function autoRefresh(fn, ms = 10000) {
  stopRefresh();
  refreshTimer = setInterval(fn, ms);
}

// ---------- shell / nav ----------

function shell(active, content) {
  const nav = [
    ['#/', 'Monitors'],
    ['#/channels', 'Notifications'],
    ['#/settings', 'Settings']
  ].map(([href, label]) =>
    `<a class="nav ${active === href ? 'active' : ''}" href="${href}">${label}</a>`).join('');
  app.innerHTML = `
    <div class="shell">
      <nav class="sidebar">
        <div class="brand">📡 Pulse<span>Watch</span></div>
        ${nav}
        <a class="nav" href="/status" target="_blank">Status page ↗</a>
        <div class="spacer"></div>
        <a class="nav" href="#" id="logout">Sign out</a>
      </nav>
      <main class="main">${content}</main>
    </div>`;
  document.getElementById('logout').onclick = async (e) => {
    e.preventDefault();
    await api('/api/auth/logout', { method: 'POST', body: {} });
    renderLogin();
  };
}

// ---------- auth ----------

function renderAuthForm({ title, sub, button, onSubmit }) {
  stopRefresh();
  app.innerHTML = `
    <div class="auth-wrap"><div class="auth-card card">
      <h1>📡 ${esc(title)}</h1>
      <p class="sub">${esc(sub)}</p>
      <form id="authform">
        <div class="field"><label>Password</label>
          <input type="password" id="password" minlength="8" required autofocus></div>
        <div class="error" id="autherr"></div>
        <button class="primary" style="width:100%">${esc(button)}</button>
      </form>
    </div></div>`;
  document.getElementById('authform').onsubmit = async (e) => {
    e.preventDefault();
    try {
      await onSubmit(document.getElementById('password').value);
      location.hash = '#/';
      route();
    } catch (err) {
      document.getElementById('autherr').textContent = err.message;
    }
  };
}

function renderLogin() {
  renderAuthForm({
    title: 'PulseWatch', sub: 'Sign in to your monitoring dashboard.', button: 'Sign in',
    onSubmit: (password) => api('/api/auth/login', { body: { password } })
  });
}

function renderSetup() {
  renderAuthForm({
    title: 'Welcome to PulseWatch', sub: 'Choose an admin password (min 8 characters) to get started.', button: 'Create admin account',
    onSubmit: (password) => api('/api/auth/setup', { body: { password } })
  });
}

// ---------- dashboard ----------

async function renderDashboard() {
  const [monitors, overview] = await Promise.all([api('/api/monitors'), api('/api/overview')]);
  const tiles = `
    <div class="tiles">
      <div class="tile up"><div class="num">${overview.up}</div><div class="lbl">Up</div></div>
      <div class="tile down"><div class="num">${overview.down}</div><div class="lbl">Down</div></div>
      <div class="tile"><div class="num">${overview.paused}</div><div class="lbl">Paused</div></div>
      <div class="tile"><div class="num">${overview.total}</div><div class="lbl">Total</div></div>
    </div>`;
  const rows = monitors.map((m) => `
    <div class="monitor-row" data-id="${m.id}">
      <span class="badge ${m.status}">${m.status}</span>
      <div class="info">
        <div class="name">${esc(m.name)}</div>
        <div class="target">${esc(targetOf(m))}</div>
      </div>
      ${beatsHtml(m.recentBeats)}
      <div class="stats">
        ${m.lastLatency != null ? m.lastLatency + 'ms' : '—'}<br>
        ${fmtUptime(m.uptime24h)} (24h)
      </div>
    </div>`).join('');
  shell('#/', `
    <div class="page-head">
      <div><h1>Monitors</h1><div class="sub">${overview.total} monitor(s), refreshed every 10s</div></div>
      <a class="btn primary" href="#/monitors/new">+ Add monitor</a>
    </div>
    ${tiles}
    ${rows || '<div class="card muted">No monitors yet. Add your first monitor to start tracking uptime.</div>'}
  `);
  for (const row of app.querySelectorAll('.monitor-row')) {
    row.onclick = () => { location.hash = `#/monitors/${row.dataset.id}`; };
  }
  autoRefresh(() => renderDashboard().catch(() => {}));
}

// ---------- monitor detail ----------

async function renderMonitorDetail(id) {
  const m = await api(`/api/monitors/${id}?beats=200`);
  const channels = await api('/api/channels');
  const chanNames = (m.channels || [])
    .map((cid) => channels.find((c) => c.id === cid))
    .filter(Boolean).map((c) => esc(c.name)).join(', ') || 'none';
  const incidents = (m.incidents || []).map((inc) => `
    <tr>
      <td>${new Date(inc.startedAt).toLocaleString()}</td>
      <td>${inc.endedAt ? fmtDuration(inc.endedAt - inc.startedAt) : '<span class="badge down">ongoing</span>'}</td>
      <td>${esc(inc.reason || '')}</td>
    </tr>`).join('');
  const pushInfo = m.type === 'push' ? `
    <div class="card">
      <h3>Push URL</h3>
      <p class="muted" style="margin:0.4rem 0">Have your service call this URL at least every ${m.interval}s (grace ${m.grace}s). Optional <span class="mono">?ms=123</span> reports latency.</p>
      <p class="mono">${location.origin}/api/push/${esc(m.pushToken)}</p>
    </div>` : '';
  shell('#/', `
    <div class="page-head">
      <div>
        <h1><span class="badge ${m.status}">${m.status}</span> ${esc(m.name)}</h1>
        <div class="sub">${esc(targetOf(m))} · every ${m.interval}s · notify: ${chanNames}</div>
      </div>
      <div class="actions" style="margin:0">
        <button id="checknow" class="small">Check now</button>
        <button id="pausebtn" class="small">${m.active ? 'Pause' : 'Resume'}</button>
        <a class="btn small" href="#/monitors/${m.id}/edit">Edit</a>
        <button id="delbtn" class="small danger">Delete</button>
      </div>
    </div>
    <div class="tiles">
      <div class="tile"><div class="num">${m.lastLatency != null ? m.lastLatency + 'ms' : '—'}</div><div class="lbl">Latency</div></div>
      <div class="tile"><div class="num">${fmtUptime(m.uptime24h)}</div><div class="lbl">Uptime 24h</div></div>
      <div class="tile"><div class="num">${fmtUptime(m.uptime30d)}</div><div class="lbl">Uptime 30d</div></div>
      <div class="tile"><div class="num">${m.certDays != null ? m.certDays + 'd' : '—'}</div><div class="lbl">Cert expiry</div></div>
    </div>
    <div class="card">
      <h3>Response time</h3>
      <p class="muted" style="margin:0.3rem 0 0.6rem">Last check: ${fmtAgo(m.lastCheck)} — ${esc(m.lastMessage || 'no data')}</p>
      ${latencyChart(m.recentBeats)}
      ${beatsHtml(m.recentBeats, 80)}
    </div>
    ${pushInfo}
    <div class="card">
      <h3>Incidents</h3>
      ${incidents ? `<table><tr><th>Started</th><th>Duration</th><th>Reason</th></tr>${incidents}</table>`
        : '<p class="muted" style="margin-top:0.4rem">No incidents recorded. 🎉</p>'}
    </div>
  `);
  document.getElementById('checknow').onclick = async (e) => {
    e.target.disabled = true;
    await api(`/api/monitors/${id}/check`, { method: 'POST', body: {} }).catch(() => {});
    renderMonitorDetail(id);
  };
  document.getElementById('pausebtn').onclick = async () => {
    await api(`/api/monitors/${id}/${m.active ? 'pause' : 'resume'}`, { method: 'POST', body: {} });
    renderMonitorDetail(id);
  };
  document.getElementById('delbtn').onclick = async () => {
    if (!confirm(`Delete monitor "${m.name}" and its history?`)) return;
    await api(`/api/monitors/${id}`, { method: 'DELETE' });
    location.hash = '#/';
  };
  autoRefresh(() => renderMonitorDetail(id).catch(() => {}), 15000);
}

// ---------- monitor form ----------

async function renderMonitorForm(id) {
  stopRefresh();
  const channels = await api('/api/channels');
  const m = id ? await api(`/api/monitors/${id}`) : {
    type: 'http', name: '', url: 'https://', method: 'GET', acceptedStatus: '200-299',
    interval: 60, timeout: 10, retries: 1, channels: [], certCheck: true, certExpiryDays: 14,
    host: '', port: '', keyword: '', grace: 60
  };
  const chips = channels.map((c) => `
    <span class="chip ${m.channels.includes(c.id) ? 'on' : ''}" data-cid="${c.id}">${esc(c.name)} <span class="muted">(${c.type})</span></span>`).join('')
    || '<span class="muted">No notification channels yet — <a href="#/channels/new">create one</a>.</span>';

  shell('#/', `
    <div class="page-head"><h1>${id ? 'Edit monitor' : 'Add monitor'}</h1></div>
    <form id="mform" class="card">
      <div class="row">
        <div class="field"><label>Monitor type</label>
          <select id="f_type">
            <option value="http">HTTP(s) — website / API</option>
            <option value="tcp">TCP port</option>
            <option value="ping">Ping (ICMP)</option>
            <option value="push">Push heartbeat (cron / worker)</option>
          </select></div>
        <div class="field"><label>Friendly name</label><input type="text" id="f_name" required value="${esc(m.name)}"></div>
      </div>

      <div data-when="http">
        <div class="field"><label>URL</label><input type="text" id="f_url" value="${esc(m.url || 'https://')}"></div>
        <div class="row">
          <div class="field"><label>Method</label>
            <select id="f_method">${['GET', 'HEAD', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'].map((v) =>
              `<option ${m.method === v ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
          <div class="field"><label>Accepted status codes</label><input type="text" id="f_status" value="${esc(m.acceptedStatus || '200-299')}" placeholder="200-299,301"></div>
        </div>
        <div class="row">
          <div class="field"><label>Required keyword (optional)</label><input type="text" id="f_keyword" value="${esc(m.keyword || '')}"></div>
          <div class="field" style="align-self:end"><div class="checkbox">
            <input type="checkbox" id="f_kwinvert" ${m.keywordInvert ? 'checked' : ''}>
            <label for="f_kwinvert">Alert if keyword IS present</label></div></div>
        </div>
        <div class="row">
          <div class="field" style="align-self:end"><div class="checkbox">
            <input type="checkbox" id="f_cert" ${m.certCheck !== false ? 'checked' : ''}>
            <label for="f_cert">Check TLS certificate expiry</label></div></div>
          <div class="field"><label>Warn when cert expires within (days)</label>
            <input type="number" id="f_certdays" value="${m.certExpiryDays || 14}" min="1" max="365"></div>
        </div>
      </div>

      <div data-when="tcp ping">
        <div class="row">
          <div class="field"><label>Host</label><input type="text" id="f_host" value="${esc(m.host || '')}" placeholder="db.example.com"></div>
          <div class="field" data-when="tcp"><label>Port</label><input type="number" id="f_port" value="${esc(m.port || '')}" min="1" max="65535"></div>
        </div>
      </div>

      <div data-when="push">
        <div class="field"><label>Grace period (seconds)</label>
          <input type="number" id="f_grace" value="${m.grace || 60}" min="0" max="86400"></div>
        <p class="muted" style="margin-bottom:0.9rem">After saving, you'll get a unique push URL your job must call within every interval + grace window.</p>
      </div>

      <div class="row">
        <div class="field"><label>Check interval (seconds)</label><input type="number" id="f_interval" value="${m.interval || 60}" min="10" max="86400"></div>
        <div class="field"><label>Timeout (seconds)</label><input type="number" id="f_timeout" value="${m.timeout || 10}" min="1" max="120"></div>
        <div class="field"><label>Retries before down</label><input type="number" id="f_retries" value="${m.retries != null ? m.retries : 1}" min="0" max="10"></div>
      </div>

      <div class="field"><label>Notify via</label><div class="chips" id="chips">${chips}</div></div>
      <div class="error" id="formerr"></div>
      <div class="actions">
        <button class="primary" type="submit">${id ? 'Save changes' : 'Create monitor'}</button>
        <a class="btn" href="${id ? `#/monitors/${id}` : '#/'}">Cancel</a>
      </div>
    </form>
  `);

  const selected = new Set(m.channels || []);
  for (const chip of app.querySelectorAll('.chip')) {
    chip.onclick = () => {
      const cid = chip.dataset.cid;
      if (selected.has(cid)) { selected.delete(cid); chip.classList.remove('on'); }
      else { selected.add(cid); chip.classList.add('on'); }
    };
  }

  const typeSelect = document.getElementById('f_type');
  typeSelect.value = m.type;
  const syncVisibility = () => {
    for (const section of app.querySelectorAll('[data-when]')) {
      section.style.display = section.dataset.when.split(' ').includes(typeSelect.value) ? '' : 'none';
    }
  };
  typeSelect.onchange = syncVisibility;
  syncVisibility();

  document.getElementById('mform').onsubmit = async (e) => {
    e.preventDefault();
    const val = (fid) => document.getElementById(fid).value;
    const body = {
      type: typeSelect.value,
      name: val('f_name'),
      interval: val('f_interval'),
      timeout: val('f_timeout'),
      retries: val('f_retries'),
      channels: [...selected]
    };
    if (body.type === 'http') {
      Object.assign(body, {
        url: val('f_url'), method: val('f_method'), acceptedStatus: val('f_status'),
        keyword: val('f_keyword'), keywordInvert: document.getElementById('f_kwinvert').checked,
        certCheck: document.getElementById('f_cert').checked, certExpiryDays: val('f_certdays')
      });
    } else if (body.type === 'tcp') {
      Object.assign(body, { host: val('f_host'), port: val('f_port') });
    } else if (body.type === 'ping') {
      Object.assign(body, { host: val('f_host') });
    } else if (body.type === 'push') {
      Object.assign(body, { grace: val('f_grace') });
    }
    try {
      const saved = id
        ? await api(`/api/monitors/${id}`, { method: 'PUT', body })
        : await api('/api/monitors', { body });
      location.hash = `#/monitors/${saved.id}`;
    } catch (err) {
      document.getElementById('formerr').textContent = err.message;
    }
  };
}

// ---------- channels ----------

const CHANNEL_META = {
  email: { label: 'Email (SMTP)', fields: [
    ['host', 'SMTP host', 'smtp.example.com'], ['port', 'Port', '587'],
    ['secure:checkbox', 'Implicit TLS (port 465)'], ['username', 'Username', ''],
    ['password:password', 'Password', ''], ['from', 'From address', 'alerts@example.com'],
    ['fromName', 'From name', 'PulseWatch'], ['to', 'To (comma-separated)', 'you@example.com']
  ]},
  pushover: { label: 'Pushover', fields: [
    ['apiToken:password', 'API token', ''], ['userKey', 'User key', ''],
    ['device', 'Device (optional)', ''], ['sound', 'Sound (optional)', ''],
    ['priority', 'Priority for DOWN alerts (-2..2)', '1']
  ]},
  slack: { label: 'Slack', fields: [['webhookUrl', 'Incoming webhook URL', 'https://hooks.slack.com/services/…']] },
  discord: { label: 'Discord', fields: [['webhookUrl', 'Webhook URL', 'https://discord.com/api/webhooks/…']] },
  telegram: { label: 'Telegram', fields: [['botToken:password', 'Bot token', ''], ['chatId', 'Chat ID', '']] },
  webhook: { label: 'Generic webhook', fields: [['url', 'POST URL', 'https://example.com/hook']] }
};

async function renderChannels() {
  stopRefresh();
  const channels = await api('/api/channels');
  const rows = channels.map((c) => `
    <div class="channel-row">
      <div class="info">
        <div class="name"><strong>${esc(c.name)}</strong> ${c.enabled ? '' : '<span class="badge paused">disabled</span>'}</div>
        <div class="type">${CHANNEL_META[c.type] ? CHANNEL_META[c.type].label : c.type}</div>
      </div>
      <button class="small" data-test="${c.id}">Send test</button>
      <a class="btn small" href="#/channels/${c.id}/edit">Edit</a>
      <button class="small danger" data-del="${c.id}">Delete</button>
    </div>`).join('');
  shell('#/channels', `
    <div class="page-head">
      <div><h1>Notification channels</h1><div class="sub">Email, Pushover, Slack, Discord, Telegram and generic webhooks</div></div>
      <a class="btn primary" href="#/channels/new">+ Add channel</a>
    </div>
    <div id="chanmsg"></div>
    ${rows || '<div class="card muted">No channels yet. Add one, then attach it to your monitors.</div>'}
  `);
  const msg = document.getElementById('chanmsg');
  for (const btn of app.querySelectorAll('[data-test]')) {
    btn.onclick = async () => {
      btn.disabled = true; btn.textContent = 'Sending…';
      const out = await api(`/api/channels/${btn.dataset.test}/test`, { method: 'POST', body: {} });
      btn.disabled = false; btn.textContent = 'Send test';
      msg.innerHTML = out.ok ? '<p class="success">Test notification sent ✔</p>'
        : `<p class="error">Test failed: ${esc(out.error)}</p>`;
    };
  }
  for (const btn of app.querySelectorAll('[data-del]')) {
    btn.onclick = async () => {
      if (!confirm('Delete this channel?')) return;
      await api(`/api/channels/${btn.dataset.del}`, { method: 'DELETE' });
      renderChannels();
    };
  }
}

async function renderChannelForm(id) {
  stopRefresh();
  const existing = id ? (await api('/api/channels')).find((c) => c.id === id) : null;
  if (id && !existing) { location.hash = '#/channels'; return; }
  const current = existing || { type: 'slack', name: '', enabled: true, config: {} };

  const typeOptions = Object.entries(CHANNEL_META).map(([value, meta]) =>
    `<option value="${value}" ${current.type === value ? 'selected' : ''}>${meta.label}</option>`).join('');

  shell('#/channels', `
    <div class="page-head"><h1>${id ? 'Edit channel' : 'Add notification channel'}</h1></div>
    <form id="cform" class="card">
      <div class="row">
        <div class="field"><label>Type</label><select id="c_type" ${id ? 'disabled' : ''}>${typeOptions}</select></div>
        <div class="field"><label>Name</label><input type="text" id="c_name" required value="${esc(current.name)}" placeholder="Ops Slack"></div>
      </div>
      <div id="c_fields"></div>
      <div class="checkbox field"><input type="checkbox" id="c_enabled" ${current.enabled !== false ? 'checked' : ''}><label for="c_enabled">Enabled</label></div>
      <div class="error" id="cerr"></div>
      <div class="actions">
        <button class="primary" type="submit">${id ? 'Save changes' : 'Create channel'}</button>
        <a class="btn" href="#/channels">Cancel</a>
      </div>
    </form>
  `);

  const typeSelect = document.getElementById('c_type');
  const fieldsDiv = document.getElementById('c_fields');
  const renderFields = () => {
    const meta = CHANNEL_META[typeSelect.value];
    fieldsDiv.innerHTML = meta.fields.map(([spec, label, placeholder]) => {
      const [key, kind] = spec.split(':');
      const value = current.config[key] != null ? current.config[key] : '';
      if (kind === 'checkbox') {
        return `<div class="checkbox field"><input type="checkbox" id="cf_${key}" ${value ? 'checked' : ''}><label for="cf_${key}">${label}</label></div>`;
      }
      const type = kind === 'password' ? 'password' : 'text';
      return `<div class="field"><label>${label}</label><input type="${type}" id="cf_${key}" value="${esc(value)}" placeholder="${esc(placeholder || '')}"></div>`;
    }).join('');
  };
  typeSelect.onchange = renderFields;
  renderFields();

  document.getElementById('cform').onsubmit = async (e) => {
    e.preventDefault();
    const type = typeSelect.value;
    const config = {};
    for (const [spec] of CHANNEL_META[type].fields) {
      const [key, kind] = spec.split(':');
      const el = document.getElementById(`cf_${key}`);
      if (!el) continue;
      config[key] = kind === 'checkbox' ? el.checked : el.value;
    }
    const body = {
      type,
      name: document.getElementById('c_name').value,
      enabled: document.getElementById('c_enabled').checked,
      config
    };
    try {
      if (id) await api(`/api/channels/${id}`, { method: 'PUT', body });
      else await api('/api/channels', { body });
      location.hash = '#/channels';
    } catch (err) {
      document.getElementById('cerr').textContent = err.message;
    }
  };
}

// ---------- settings ----------

async function renderSettings() {
  stopRefresh();
  const [settings, monitors] = await Promise.all([api('/api/settings'), api('/api/monitors')]);
  const chips = monitors.map((m) => `
    <span class="chip ${settings.statusPage.monitors.includes(m.id) ? 'on' : ''}" data-mid="${m.id}">${esc(m.name)}</span>`).join('')
    || '<span class="muted">No monitors yet.</span>';
  shell('#/settings', `
    <div class="page-head"><h1>Settings</h1></div>
    <form id="sform" class="card">
      <h3 style="margin-bottom:0.8rem">General</h3>
      <div class="field"><label>Instance title</label><input type="text" id="s_title" value="${esc(settings.title)}"></div>
      <h3 style="margin:1.2rem 0 0.8rem">Public status page</h3>
      <div class="checkbox field"><input type="checkbox" id="s_spenabled" ${settings.statusPage.enabled ? 'checked' : ''}><label for="s_spenabled">Enable public status page at <span class="mono">/status</span></label></div>
      <div class="field"><label>Status page title</label><input type="text" id="s_sptitle" value="${esc(settings.statusPage.title)}"></div>
      <div class="field"><label>Description</label><textarea id="s_spdesc" rows="2">${esc(settings.statusPage.description)}</textarea></div>
      <div class="field"><label>Published monitors</label><div class="chips" id="spchips">${chips}</div></div>
      <div class="success" id="smsg"></div>
      <div class="actions"><button class="primary">Save settings</button></div>
    </form>
    <form id="pform" class="card">
      <h3 style="margin-bottom:0.8rem">Change admin password</h3>
      <div class="row">
        <div class="field"><label>Current password</label><input type="password" id="p_current" required></div>
        <div class="field"><label>New password (min 8 chars)</label><input type="password" id="p_next" minlength="8" required></div>
      </div>
      <div class="error" id="perr"></div>
      <div class="actions"><button class="primary">Change password</button></div>
    </form>
  `);
  const published = new Set(settings.statusPage.monitors);
  for (const chip of app.querySelectorAll('#spchips .chip')) {
    chip.onclick = () => {
      const mid = chip.dataset.mid;
      if (published.has(mid)) { published.delete(mid); chip.classList.remove('on'); }
      else { published.add(mid); chip.classList.add('on'); }
    };
  }
  document.getElementById('sform').onsubmit = async (e) => {
    e.preventDefault();
    await api('/api/settings', { method: 'PUT', body: {
      title: document.getElementById('s_title').value,
      statusPage: {
        enabled: document.getElementById('s_spenabled').checked,
        title: document.getElementById('s_sptitle').value,
        description: document.getElementById('s_spdesc').value,
        monitors: [...published]
      }
    }});
    document.getElementById('smsg').textContent = 'Saved ✔';
    setTimeout(() => { document.getElementById('smsg').textContent = ''; }, 2000);
  };
  document.getElementById('pform').onsubmit = async (e) => {
    e.preventDefault();
    const errEl = document.getElementById('perr');
    try {
      await api('/api/settings/password', { body: {
        current: document.getElementById('p_current').value,
        next: document.getElementById('p_next').value
      }});
      errEl.className = 'success';
      errEl.textContent = 'Password changed ✔';
      e.target.reset();
    } catch (err) {
      errEl.className = 'error';
      errEl.textContent = err.message;
    }
  };
}

// ---------- router ----------

async function route() {
  const hash = location.hash || '#/';
  try {
    const auth = await api('/api/auth/status');
    if (auth.needsSetup) return renderSetup();
    if (!auth.authed) return renderLogin();
    let m;
    if (hash === '#/' || hash === '') return await renderDashboard();
    if (hash === '#/monitors/new') return await renderMonitorForm(null);
    if ((m = /^#\/monitors\/([^/]+)\/edit$/.exec(hash))) return await renderMonitorForm(m[1]);
    if ((m = /^#\/monitors\/([^/]+)$/.exec(hash))) return await renderMonitorDetail(m[1]);
    if (hash === '#/channels') return await renderChannels();
    if (hash === '#/channels/new') return await renderChannelForm(null);
    if ((m = /^#\/channels\/([^/]+)\/edit$/.exec(hash))) return await renderChannelForm(m[1]);
    if (hash === '#/settings') return await renderSettings();
    location.hash = '#/';
  } catch (err) {
    if (err.message !== 'authentication required') {
      app.innerHTML = `<div class="auth-wrap"><div class="card">Error: ${esc(err.message)} — <a href="#/" onclick="location.reload()">reload</a></div></div>`;
    }
  }
}

window.addEventListener('hashchange', route);
route();
