'use strict';

const http = require('http');
const path = require('path');
const { Store } = require('./lib/store');
const { Scheduler } = require('./lib/scheduler');
const { buildRouter } = require('./lib/api');
const { sendJson, serveStatic } = require('./lib/http-util');

const PORT = parseInt(process.env.PORT || '3300', 10);
const HOST = process.env.HOST || '0.0.0.0';
const DATA_FILE = process.env.PULSEWATCH_DATA || path.join(__dirname, 'data', 'pulsewatch.json');
const PUBLIC_DIR = path.join(__dirname, 'public');

function createApp({ dataFile = DATA_FILE } = {}) {
  const store = new Store(dataFile);
  const scheduler = new Scheduler(store);
  const router = buildRouter({ store, scheduler });

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const pathname = url.pathname;

    try {
      const matched = router.match(req.method, pathname);
      if (matched) {
        await matched.handler(req, res, matched.params, url.searchParams);
        return;
      }
      if (pathname.startsWith('/api/')) {
        sendJson(res, 404, { error: 'not found' });
        return;
      }

      // Static files & SPA routes.
      if (req.method === 'GET' || req.method === 'HEAD') {
        if (pathname === '/' || pathname === '/index.html') {
          if (serveStatic(res, PUBLIC_DIR, 'index.html')) return;
        }
        if (pathname === '/status' || pathname === '/status/') {
          if (serveStatic(res, PUBLIC_DIR, 'status.html')) return;
        }
        if (serveStatic(res, PUBLIC_DIR, pathname.slice(1))) return;
      }
      sendJson(res, 404, { error: 'not found' });
    } catch (err) {
      const status = err.statusCode || 500;
      if (status >= 500) console.error(`[http] ${req.method} ${pathname}:`, err);
      if (!res.headersSent) sendJson(res, status, { error: err.message || 'internal error' });
      else res.end();
    }
  });

  return { server, store, scheduler };
}

if (require.main === module) {
  const app = createApp();
  app.scheduler.start();
  app.server.listen(PORT, HOST, () => {
    console.log(`PulseWatch listening on http://${HOST}:${PORT}`);
    console.log(`Dashboard:   http://localhost:${PORT}/`);
    console.log(`Status page: http://localhost:${PORT}/status`);
  });

  const shutdown = () => {
    console.log('shutting down…');
    app.scheduler.stop();
    app.server.close();
    app.store.flush();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

module.exports = { createApp };
