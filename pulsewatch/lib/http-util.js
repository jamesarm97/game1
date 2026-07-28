'use strict';

const fs = require('fs');
const path = require('path');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon'
};

class Router {
  constructor() {
    this.routes = [];
  }

  add(method, pattern, handler) {
    const names = [];
    const regex = new RegExp('^' + pattern.replace(/:[^/]+/g, (m) => {
      names.push(m.slice(1));
      return '([^/]+)';
    }) + '/?$');
    this.routes.push({ method, regex, names, handler });
  }

  get(p, h) { this.add('GET', p, h); }
  post(p, h) { this.add('POST', p, h); }
  put(p, h) { this.add('PUT', p, h); }
  delete(p, h) { this.add('DELETE', p, h); }

  match(method, pathname) {
    for (const route of this.routes) {
      if (route.method !== method) continue;
      const m = route.regex.exec(pathname);
      if (m) {
        const params = {};
        route.names.forEach((n, i) => { params[n] = decodeURIComponent(m[i + 1]); });
        return { handler: route.handler, params };
      }
    }
    return null;
  }
}

function readBody(req, limit = 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(new Error('request body too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

async function readJson(req) {
  const raw = await readBody(req);
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    const err = new Error('invalid JSON body');
    err.statusCode = 400;
    throw err;
  }
}

function sendJson(res, status, obj, extraHeaders = {}) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    ...extraHeaders
  });
  res.end(body);
}

function serveStatic(res, rootDir, urlPath) {
  const clean = path.normalize(urlPath).replace(/^(\.\.[/\\])+/, '');
  const filePath = path.join(rootDir, clean);
  if (!filePath.startsWith(rootDir)) {
    res.writeHead(403); res.end('forbidden'); return true;
  }
  let stat;
  try {
    stat = fs.statSync(filePath);
  } catch {
    return false;
  }
  if (!stat.isFile()) return false;
  res.writeHead(200, {
    'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream',
    'Content-Length': stat.size,
    'Cache-Control': 'no-cache'
  });
  fs.createReadStream(filePath).pipe(res);
  return true;
}

module.exports = { Router, readJson, readBody, sendJson, serveStatic };
