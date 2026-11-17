// A static file server for the game/ directory, for local playtesting.
// Node 22, the standard library only. Files are confined under game/
// (404 on a miss, 403 outside), and one line with the URL is printed.
// `node serve.ts` serves on 8080; pass --port <n> to change it.

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const game = join(import.meta.dirname, 'game');
const port = Number(process.argv[process.argv.indexOf('--port') + 1] ?? 8080);

const MIME = {
  html: 'text/html', js: 'text/javascript', mjs: 'text/javascript',
  css: 'text/css', json: 'application/json', png: 'image/png',
  jpg: 'image/jpeg', jpeg: 'image/jpeg', svg: 'image/svg+xml',
  woff2: 'font/woff2', wasm: 'application/wasm', wav: 'audio/wav', ogg: 'audio/ogg',
};

createServer(async (req, res) => {
  let url;
  try {
    url = decodeURIComponent(new URL(req.url ?? '/', 'http://localhost').pathname);
  } catch {
    res.writeHead(400).end('Bad Request');
    return;
  }
  const rel = url === '/' ? 'index.html' : url.slice(1);
  const file = normalize(join(game, rel));
  if (file !== game && !file.startsWith(game + '/')) {
    res.writeHead(403).end('Forbidden');
    return;
  }
  try {
    const info = await stat(file);
    if (!info.isFile()) throw new Error('not a file');
    const type = MIME[extname(file).slice(1).toLowerCase()] ?? 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': type, 'Content-Length': info.size });
    res.end(await readFile(file));
  } catch {
    res.writeHead(404).end('Not Found');
  }
}).listen(port, () => console.log(`http://localhost:${port}`));