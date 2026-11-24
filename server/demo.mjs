import { createServer } from 'node:http';
import { mkdir, readFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { Readable } from 'node:stream';
import { createApi } from './api.mjs';
import { qrSVG } from './qr.mjs';
import { sqliteStore } from './sqlite.mjs';
import { seedDemo } from './store.mjs';

export async function createDemo({ path = new URL('../data/demo.sqlite', import.meta.url), origin } = {}) {
  if (path instanceof URL) await mkdir(new URL('.', path), { recursive: true });
  const store = sqliteStore(path instanceof URL ? path : String(path));
  await seedDemo(store);
  const api = createApi({ store, origin, demoEnabled: true, demoSecret: randomBytes(32) });
  const assets = { '/app.js': 'text/javascript', '/staff.js': 'text/javascript', '/site.css': 'text/css', '/logo.svg': 'image/svg+xml' };
  const document = await readFile(new URL('../server/shell.html', import.meta.url));
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url, origin || 'http://' + req.headers.host);
      if (url.pathname === '/qr') {
        const target = new URL(url.searchParams.get('url'));
        if (!['http:', 'https:'].includes(target.protocol)) throw new RangeError('Invalid QR URL.');
        res.writeHead(200, { 'Content-Type': 'image/svg+xml', 'X-Content-Type-Options': 'nosniff' });
        res.end(qrSVG(target.href));
        return;
      }
      if (url.pathname.startsWith('/api/')) {
        const request = new Request(url, {
          method: req.method, headers: req.headers,
          ...(!['GET', 'HEAD'].includes(req.method) ? { body: Readable.toWeb(req), duplex: 'half' } : {})
        });
        const response = await api(request);
        res.writeHead(response.status, Object.fromEntries(response.headers));
        res.end(Buffer.from(await response.arrayBuffer()));
        return;
      }
      if (Object.hasOwn(assets, url.pathname)) {
        const data = await readFile(new URL('../public' + url.pathname, import.meta.url));
        res.writeHead(200, { 'Content-Type': assets[url.pathname] + '; charset=utf-8', 'X-Content-Type-Options': 'nosniff' });
        res.end(data);
        return;
      }
      if (url.pathname === '/favicon.ico') { res.writeHead(204); res.end(); return; }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(document);
    } catch (error) {
      if (!res.headersSent) res.writeHead(error instanceof RangeError || error instanceof TypeError ? 400 : 500);
      res.end('ScanServe could not load this request.');
    }
  });
  server.on('close', () => store.close());
  return server;
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const host = process.env.DEMO_HOST || '127.0.0.1';
  const port = Number(process.env.PORT || 3000);
  const server = await createDemo();
  server.listen(port, host, () => {
    const address = 'http://' + (host === '0.0.0.0' ? '127.0.0.1' : host) + ':' + server.address().port;
    console.log('ScanServe PH demo · ' + address);
    if (process.argv.includes('--open') && process.platform === 'win32') {
      const browser = spawn('explorer.exe', [address], { detached: true, stdio: 'ignore', windowsHide: true });
      browser.on('error', () => console.log('Open the address above in your browser.'));
      browser.unref();
    }
  });
}
