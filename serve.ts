// serve.ts — a tiny static server for game/, the whole game in one file.
// Port 8080 by default, --port N overrides; a path outside game/ is 403,
// a missing file 404, and the URL is printed on a single stdout line.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, normalize, sep } from 'node:path';

const root = join(new URL('.', import.meta.url).pathname, 'game');

const PORT_ARG = process.argv.indexOf('--port');
const port = Number(PORT_ARG >= 0 ? process.argv[PORT_ARG + 1] : 8080);

const MIME: Record<string, string> = {
  html: 'text/html; charset=utf-8',
  js: 'text/javascript; charset=utf-8',
  mjs: 'text/javascript; charset=utf-8',
  css: 'text/css; charset=utf-8',
  json: 'application/json; charset=utf-8',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  svg: 'image/svg+xml',
  woff2: 'font/woff2',
  wasm: 'application/wasm',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
};

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const rel = url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname).replace(/^\/+/, '');
    const target = normalize(join(root, rel));
    if (target !== root && !target.startsWith(root + sep)) {
      res.writeHead(403, { 'Content-Type': 'text/plain' });
      res.end('403 Forbidden');
      return;
    }
    let data;
    try {
      data = await readFile(target);
    } catch {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('404 Not Found');
      return;
    }
    const ext = target.split('.').pop()?.toLowerCase() ?? '';
    res.writeHead(200, { 'Content-Type': MIME[ext] ?? 'application/octet-stream' });
    res.end(data);
  } catch {
    res.writeHead(400, { 'Content-Type': 'text/plain' });
    res.end('400 Bad Request');
  }
});

server.listen(port, () => console.log(`http://localhost:${port}`));