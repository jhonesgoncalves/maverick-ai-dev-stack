import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { URL } from 'node:url';
import { clearTimeout, setTimeout } from 'node:timers';
import { buildProjectIndex, cacheProjectIndex } from '../core/lens-index.js';
const page = new URL('./ui/index.html', import.meta.url);
const interactions = new URL('./ui/interactions.js', import.meta.url);
async function requestBody(req) { const chunks = []; for await (const chunk of req) chunks.push(chunk); try { return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); } catch { return {}; } }
function json(res, status, body) { res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }); res.end(JSON.stringify(body)); }
export async function startDashboard({ cwd, host = '127.0.0.1', port = 4173, watch = true } = {}) {
  if (!['127.0.0.1', 'localhost', '::1'].includes(host)) throw new Error('dashboard host must be loopback-only');
  if (!Number.isInteger(Number(port)) || Number(port) < 1 || Number(port) > 65535) throw new Error('dashboard port must be between 1 and 65535');
  let index = await buildProjectIndex(cwd); await cacheProjectIndex(cwd, index); let timer;
  const refresh = async () => { index = await buildProjectIndex(cwd); await cacheProjectIndex(cwd, index); };
  const server = createServer(async (req, res) => { if (req.url === '/api/project') return json(res, 200, index); if (req.url === '/api/refresh' && req.method === 'POST') { await refresh(); res.writeHead(204); return res.end(); } if (req.url === '/api/improvements' && req.method === 'POST') { const body = await requestBody(req), slug = String(body.slug || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 81); if (!/^[a-z0-9][a-z0-9-]{1,80}$/.test(slug)) return json(res, 400, { error: 'A valid improvement title is required.' }); try { const { main } = await import('../cli.js'); await main(['task', slug, '--preset', body.preset === 'strict-review' ? 'strict-review' : 'spec-driven'], cwd); await refresh(); return json(res, 201, { slug, preset: body.preset === 'strict-review' ? 'strict-review' : 'spec-driven' }); } catch (error) { return json(res, 409, { error: error.message }); } } if (req.url === '/interactions.js') { res.writeHead(200, { 'content-type': 'application/javascript; charset=utf-8', 'cache-control': 'no-store' }); return res.end(await readFile(interactions, 'utf8')); } if (req.url === '/' || req.url?.startsWith('/?')) { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'content-security-policy': "default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'" }); return res.end(await readFile(page, 'utf8')); } res.writeHead(404); res.end('Not found'); });
  if (watch) { const { watch: fsWatch } = await import('node:fs'); const watcher = fsWatch(cwd, { recursive: true }, () => { clearTimeout(timer); timer = setTimeout(() => refresh().catch(() => {}), 250); }); server.once('close', () => watcher.close()); }
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(Number(port), host, resolve); }); return server;
}
