import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { URL } from 'node:url';
import { clearTimeout, setTimeout } from 'node:timers';
import { buildProjectIndex, cacheProjectIndex } from '../core/lens-index.js';
const page = new URL('./ui/index.html', import.meta.url);
export async function startDashboard({ cwd, host = '127.0.0.1', port = 4173, watch = true } = {}) {
  if (!['127.0.0.1', 'localhost', '::1'].includes(host)) throw new Error('dashboard host must be loopback-only');
  if (!Number.isInteger(Number(port)) || Number(port) < 1 || Number(port) > 65535) throw new Error('dashboard port must be between 1 and 65535');
  let index = await buildProjectIndex(cwd); await cacheProjectIndex(cwd, index); let timer;
  const refresh = async () => { index = await buildProjectIndex(cwd); await cacheProjectIndex(cwd, index); };
  const server = createServer(async (req, res) => { if (req.url === '/api/project') { res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }); return res.end(JSON.stringify(index)); } if (req.url === '/api/refresh' && req.method === 'POST') { await refresh(); res.writeHead(204); return res.end(); } if (req.url === '/' || req.url?.startsWith('/?')) { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'content-security-policy': "default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'" }); return res.end(await readFile(page, 'utf8')); } res.writeHead(404); res.end('Not found'); });
  if (watch) { const { watch: fsWatch } = await import('node:fs'); const watcher = fsWatch(cwd, { recursive: true }, () => { clearTimeout(timer); timer = setTimeout(() => refresh().catch(() => {}), 250); }); server.once('close', () => watcher.close()); }
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(Number(port), host, resolve); }); return server;
}
