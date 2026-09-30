// Gateway mini yang meniru URL Supabase untuk pengujian lokal:
//   /auth/v1/*  → Supabase Auth (GoTrue)      /rest/v1/* → PostgREST
//   /config.js  → konfigurasi lokal           lainnya    → file statis dari web/
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { ANON_KEY } from './keys.mjs';

const PORT = Number(process.env.GATEWAY_PORT ?? 8080);
const AUTH = process.env.AUTH_URL ?? 'http://127.0.0.1:9999';
const REST = process.env.REST_URL ?? 'http://127.0.0.1:3001';
const WEB_DIR = path.resolve(process.env.WEB_DIR ?? new URL('../../web', import.meta.url).pathname);
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };

function proxy(req, res, target, prefix) {
  const url = new URL(req.url.slice(prefix.length) || '/', target);
  const upstream = http.request(url, { method: req.method, headers: { ...req.headers, host: url.host } }, (up) => {
    res.writeHead(up.statusCode, up.headers);
    up.pipe(res);
  });
  upstream.on('error', (err) => {
    res.writeHead(502);
    res.end(String(err));
  });
  req.pipe(upstream);
}

http
  .createServer((req, res) => {
    if (req.url.startsWith('/auth/v1')) return proxy(req, res, AUTH, '/auth/v1');
    if (req.url.startsWith('/rest/v1')) return proxy(req, res, REST, '/rest/v1');
    if (req.url.split('?')[0] === '/config.js') {
      res.writeHead(200, { 'content-type': TYPES['.js'] });
      return res.end(`window.KWU_CONFIG = ${JSON.stringify({ supabaseUrl: `http://localhost:${PORT}`, supabaseAnonKey: ANON_KEY, emailDomain: 'logbook-kwu.local' })};`);
    }
    const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html';
    const file = path.join(WEB_DIR, rel);
    if (!file.startsWith(WEB_DIR) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404);
      return res.end('not found');
    }
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] ?? 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  })
  .listen(PORT, () => console.log(`gateway http://localhost:${PORT}`));
