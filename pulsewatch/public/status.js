/* PulseWatch public status page */
'use strict';

const page = document.getElementById('page');

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

function fmtUptime(ratio) {
  return ratio == null ? '—' : (ratio * 100).toFixed(2) + '%';
}

function beatsHtml(beats, count = 45) {
  const shown = (beats || []).slice(-count);
  const pad = count - shown.length;
  let html = '<div class="beats">';
  for (let i = 0; i < pad; i++) html += '<i></i>';
  for (const b of shown) {
    html += `<i class="${b.ok ? 'ok' : 'fail'}" title="${esc(new Date(b.t).toLocaleString())} — ${b.ok ? 'up' : 'down'}"></i>`;
  }
  return html + '</div>';
}

const BANNER = {
  up: 'All systems operational',
  down: 'Some systems are down',
  degraded: 'Partial degradation',
  unknown: 'Status unknown'
};

async function load() {
  try {
    const res = await fetch('/api/public/status');
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `HTTP ${res.status}`);
    const data = await res.json();
    document.title = data.title || 'Service Status';
    const monitors = data.monitors.map((m) => `
      <div class="monitor-row" style="cursor:default">
        <span class="badge ${m.status}">${m.status}</span>
        <div class="info"><div class="name">${esc(m.name)}</div></div>
        ${beatsHtml(m.recentBeats)}
        <div class="stats">${fmtUptime(m.uptime24h)} (24h)<br>${fmtUptime(m.uptime30d)} (30d)</div>
      </div>`).join('');
    page.innerHTML = `
      <div class="status-head">
        <h1>📡 ${esc(data.title)}</h1>
        <p class="muted">${esc(data.description || '')}</p>
      </div>
      <div class="status-banner ${data.overall}">${BANNER[data.overall] || data.overall}</div>
      ${monitors || '<div class="card muted" style="text-align:center">No services published yet.</div>'}
      <p class="footer-note">Updated ${new Date(data.generatedAt).toLocaleTimeString()} · auto-refreshes every 30s · powered by PulseWatch</p>`;
  } catch (err) {
    page.innerHTML = `<div class="card" style="text-align:center">Status page unavailable: ${esc(err.message)}</div>`;
  }
}

load();
setInterval(load, 30000);
