# 📡 PulseWatch

Self-hosted **web / service / app monitoring** with multi-channel alerting — a lightweight,
zero-dependency alternative in the spirit of Pagerly / Uptime Kuma. Monitor websites, APIs,
TCP services and background jobs, get notified the moment something breaks (and when it
recovers), and publish a public status page for your users.

Built with **plain Node.js — no npm dependencies, no build step, no database server**.
State is persisted to a single JSON file.

## Features

**Monitor types**
- **HTTP(S)** — status-code ranges (e.g. `200-299,301`), custom method/headers/body,
  required-keyword or forbidden-keyword content checks, redirect following
- **TLS certificate expiry** — warns before an HTTPS certificate runs out (configurable threshold)
- **TCP port** — connect checks for databases, mail servers, game servers…
- **Ping (ICMP)** — uses the system `ping` binary when available
- **Push heartbeat** — passive monitors for cron jobs / workers: your job calls a unique
  URL; if it goes quiet past interval + grace, you get alerted

**Alerting**
- Notification channels: **Email (SMTP)**, **Pushover**, **Slack**, **Discord**,
  **Telegram**, and **generic webhooks**
- Down + recovery (with downtime duration) + certificate-expiry notifications
- Per-monitor channel assignment, per-channel test button
- Configurable retries before a monitor is declared down (with fast re-checks while confirming)

**Visibility**
- Live dashboard with up/down tiles, heartbeat bars, response-time chart, uptime
  (24 h from checks, 30 d from incident history) and full incident log per monitor
- **Public status page** at `/status` — pick which monitors are published; no login required
- REST API for everything the UI does

**Ops niceties**
- Single admin password (scrypt-hashed), cookie sessions, first-run setup screen
- Atomic JSON persistence; survives restarts without re-alerting on boot
- Runs anywhere Node ≥ 18.17 runs; Dockerfile included

## Quick start

```bash
cd pulsewatch
npm start            # listens on http://localhost:3300
```

Open http://localhost:3300, set an admin password, add your first monitor, add a
notification channel under **Notifications**, and attach it to the monitor.

### Configuration

| Env var           | Default                     | Purpose                       |
|-------------------|-----------------------------|-------------------------------|
| `PORT`            | `3300`                      | HTTP listen port              |
| `HOST`            | `0.0.0.0`                   | Bind address                  |
| `PULSEWATCH_DATA` | `./data/pulsewatch.json`    | Path of the JSON state file   |

### Docker

```bash
docker build -t pulsewatch .
docker run -d -p 3300:3300 -v pulsewatch-data:/app/data pulsewatch
```

## Notification channel setup

| Channel  | What you need |
|----------|---------------|
| Email    | SMTP host/port (587 STARTTLS or 465 implicit TLS), optional username/password, from + to addresses |
| Pushover | Application API token + user key ([pushover.net](https://pushover.net)) |
| Slack    | Incoming-webhook URL (Slack app → Incoming Webhooks) |
| Discord  | Channel webhook URL (Channel settings → Integrations → Webhooks) |
| Telegram | Bot token (via @BotFather) + chat ID |
| Webhook  | Any URL that accepts a JSON `POST` (`{event, title, message, monitor, timestamp}`) |

## Push heartbeat monitors

Create a **Push heartbeat** monitor and PulseWatch gives you a unique URL:

```
*/5 * * * * curl -fsS http://your-host:3300/api/push/<token> > /dev/null
```

If no beat arrives within `interval + grace` seconds the monitor goes down and your
channels fire. Append `?ms=123` to report a duration/latency for the chart.

## REST API (cookie-authenticated)

```
GET    /api/auth/status              POST /api/auth/setup | login | logout
GET    /api/monitors                 POST /api/monitors
GET    /api/monitors/:id             PUT  /api/monitors/:id      DELETE /api/monitors/:id
POST   /api/monitors/:id/check | pause | resume
GET    /api/channels                 POST /api/channels
PUT    /api/channels/:id             DELETE /api/channels/:id    POST /api/channels/:id/test
GET    /api/settings                 PUT  /api/settings          POST /api/settings/password
GET    /api/overview
GET    /api/public/status            # public, powers /status
GET|POST /api/push/:token            # public, heartbeat endpoint
```

## Tests

```bash
npm test
```

Runs an end-to-end suite (auth, monitor lifecycle, up→down→recovery notifications via a
local webhook receiver, push heartbeats, status page, validation) against a real server
instance on an ephemeral port.

## Notes & limits

- Single admin user by design; put it behind a reverse proxy with TLS for production use.
- ICMP ping requires the `ping` binary; in minimal containers use TCP/HTTP monitors instead.
- Heartbeat history is capped (~2 500 checks per monitor); 30-day uptime is derived from
  incident records so it stays accurate beyond that window.
