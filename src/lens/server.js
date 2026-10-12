import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { URL } from 'node:url';
import { clearTimeout, setTimeout } from 'node:timers';
import { buildProjectIndex, cacheProjectIndex } from '../core/lens-index.js';
import { buildDevtools, serializeDevtools } from '../intel/devtools.js';
import { findFlow } from '../flows/model.js';
import { readState, recordApproval, runFlow } from '../flows/engine.js';
import { getTask } from '../core/tasks.js';
import { main } from '../cli.js';
import { allRuns, exclusive, requireSlug, runAction, setAutoApprove, taskArtifact, taskDetail } from './api.js';
import { createAgentHub } from './agents.js';
import { createLoopHub } from './loops.js';
import { capabilities, capability, changeCapabilities, changeSettings, settings } from './system.js';

const ui = new URL('./ui/', import.meta.url);
const page = new URL('./index.html', ui);
// The UI is plain files under ui/: JavaScript modules, CSS and the favicon. Paths are checked, never joined blindly.
const TYPES = { '.js': 'application/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml' };
const ASSET = /^\/(?:[a-z0-9-]+\/)?[a-z0-9-]+\.(?:js|css|svg)$/;
const LOOPBACK = new Set(['127.0.0.1', 'localhost', '::1', '[::1]']);

async function requestBody(req) { const chunks = []; for await (const chunk of req) chunks.push(chunk); try { return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); } catch { return {}; } }
function json(res, status, body) { res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }); res.end(JSON.stringify(body)); }
const hostOf = value => String(value || '').replace(/:\d+$/, '').toLowerCase();

export async function startLens({ cwd, host = '127.0.0.1', port = 4173, watch = true } = {}) {
  if (!LOOPBACK.has(host)) throw new Error('Lens host must be loopback-only');
  if (!Number.isInteger(Number(port)) || Number(port) < 1 || Number(port) > 65535) throw new Error('Lens port must be between 1 and 65535');
  // Every state-changing request must carry this per-process token, which only the page
  // served by this process knows. Host checks stop DNS-rebinding pages from reading data.
  const token = randomBytes(24).toString('hex');
  let index = await buildProjectIndex(cwd); await cacheProjectIndex(cwd, index); let timer;
  let devtools = null, building = null, version = 0;
  const clients = new Set();
  const broadcast = (event, data = {}) => { for (const client of clients) client.write(`event: ${event}\ndata: ${JSON.stringify({ version, ...data })}\n\n`); };
  const analysis = () => {
    if (devtools) return Promise.resolve(devtools);
    if (!building) building = buildDevtools(cwd).then(report => { devtools = report; building = null; return report; }, error => { building = null; throw error; });
    return building;
  };
  const refresh = async () => { index = await buildProjectIndex(cwd); await cacheProjectIndex(cwd, index); devtools = null; version++; broadcast('changed'); };
  const agents = createAgentHub({ cwd, main, broadcast, onFinish: () => refresh().catch(() => {}) });
  const loops = createLoopHub({ cwd, broadcast, onEnd: () => refresh().catch(() => {}) });
  const server = createServer(async (req, res) => {
    const url = new URL(req.url || '/', 'http://localhost');
    if (!LOOPBACK.has(hostOf(req.headers.host))) { res.writeHead(421); return res.end('Misdirected request'); }
    if (req.method === 'POST' && (req.headers['x-lens-token'] !== token || (req.headers.origin && !LOOPBACK.has(hostOf(new URL(req.headers.origin).host))))) return json(res, 403, { error: 'Missing or invalid Lens token.' });
    try {
      if (url.pathname === '/api/project') return json(res, 200, index);
      if (url.pathname === '/api/task-flow') {
        const task = String(url.searchParams.get('task') || '');
        if (!/^[a-z0-9][a-z0-9-]{1,80}$/.test(task)) return json(res, 400, { error: 'A valid task id is required.' });
        const name = String(url.searchParams.get('flow') || 'ship');
        const [flow, item] = await Promise.all([findFlow(cwd, name), getTask(cwd, task)]);
        const state = await readState(item.dir, flow.name);
        return json(res, 200, { task, flow: { name: flow.name, description: flow.description, contract: flow.contract, gates: flow.gates }, state, lastRun: state.runs.at(-1) || null });
      }
      if (url.pathname === '/api/task') return json(res, 200, await taskDetail(cwd, url.searchParams.get('task')));
      if (url.pathname === '/api/artifact') return json(res, 200, await taskArtifact(cwd, url.searchParams.get('task'), url.searchParams.get('file')));
      if (url.pathname === '/api/runs') return json(res, 200, { runs: await allRuns(cwd) });
      if (url.pathname === '/api/action' && req.method === 'POST') { const body = await requestBody(req); requireSlug(body.task); const result = await runAction(cwd, main, body); await refresh(); return json(res, 200, result); }
      if (url.pathname === '/api/agents' && req.method === 'GET') return json(res, 200, await agents.providers());
      if (url.pathname === '/api/agents/runs') return json(res, 200, await agents.runs());
      if (url.pathname === '/api/agents/run' && req.method === 'GET') return json(res, 200, agents.get(url.searchParams.get('id')));
      if (url.pathname === '/api/agents/transcript') return json(res, 200, await agents.transcript(url.searchParams.get('task'), url.searchParams.get('file')));
      if (url.pathname === '/api/agents/run' && req.method === 'POST') { const run = await agents.start(await requestBody(req)); await refresh(); return json(res, 202, run); }
      if (url.pathname === '/api/agents/stop' && req.method === 'POST') return json(res, 200, agents.stop((await requestBody(req)).id));
      if (url.pathname === '/api/agents/models') return json(res, 200, await agents.models(url.searchParams.get('provider')));
      if (url.pathname === '/api/agents/stage' && req.method === 'POST') { const result = await agents.setStage(await requestBody(req)); await refresh(); return json(res, 200, result); }
      if (url.pathname === '/api/agents/trust' && req.method === 'POST') { const result = await agents.trust(await requestBody(req)); await refresh(); return json(res, 200, result); }
      if (url.pathname === '/api/loops' && req.method === 'GET') return json(res, 200, await loops.list());
      if (url.pathname === '/api/loop' && req.method === 'GET') return json(res, 200, await loops.detail(url.searchParams.get('task'), url.searchParams.get('id')));
      if (url.pathname === '/api/loop/ledger' && req.method === 'GET') return json(res, 200, await loops.ledger(url.searchParams.get('task'), url.searchParams.get('id')));
      if (url.pathname === '/api/loops/stop' && req.method === 'POST') { const body = await requestBody(req); return json(res, 202, await loops.stop(body.task, body.id, body.reason)); }
      if (url.pathname === '/api/capabilities' && req.method === 'GET') return json(res, 200, await capabilities(main, cwd));
      if (url.pathname === '/api/capability') return json(res, 200, await capability(main, cwd, url.searchParams.get('ref')));
      if (url.pathname === '/api/capabilities' && req.method === 'POST') { const result = await changeCapabilities(main, cwd, await requestBody(req)); if (result.ok && result.data?.applied !== false) await refresh(); return json(res, 200, result); }
      if (url.pathname === '/api/settings' && req.method === 'GET') return json(res, 200, await settings(main, cwd));
      if (url.pathname === '/api/settings' && req.method === 'POST') { const result = await changeSettings(main, cwd, await requestBody(req)); await refresh(); return json(res, 200, result); }
      if (url.pathname === '/api/devtools') { if (url.searchParams.has('refresh')) devtools = null; return json(res, 200, serializeDevtools(await analysis())); }
      if (url.pathname === '/api/source') {
        // Only files the analysis already knows can be read: no path traversal, no secrets.
        const report = await analysis(), file = url.searchParams.get('file') || '';
        const known = report.fileIndex.has(file) || report.routes.items.some(route => route.file === file) || report.integrations.manifests.includes(file);
        if (!known) return json(res, 404, { error: 'Unknown file.' });
        const text = await readFile(join(report.root, file), 'utf8').catch(() => null);
        if (text === null) return json(res, 404, { error: 'File not readable.' });
        const lines = text.split('\n');
        return json(res, 200, { file, root: report.root, lines: lines.length > 4000 ? lines.slice(0, 4000) : lines, truncated: lines.length > 4000, imports: report.edges.filter(edge => edge[0] === file).map(edge => edge[1]), importedBy: report.edges.filter(edge => edge[1] === file).map(edge => edge[0]) });
      }
      if (url.pathname === '/api/events') {
        res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive' });
        res.write(`event: ready\ndata: ${JSON.stringify({ version })}\n\n`);
        clients.add(res); req.once('close', () => clients.delete(res));
        return undefined;
      }
      if (url.pathname === '/api/refresh' && req.method === 'POST') { await refresh(); res.writeHead(204); return res.end(); }
      if (url.pathname === '/api/improvements' && req.method === 'POST') {
        const body = await requestBody(req), slug = String(body.slug || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 81);
        if (!/^[a-z0-9][a-z0-9-]{1,80}$/.test(slug)) return json(res, 400, { error: 'A valid improvement title is required.' });
        const idea = [body.title, body.detail].filter(value => typeof value === 'string' && value.trim()).join('. ') || slug, workflow = ['strict', 'spec-driven'].includes(body.preset) ? body.preset : 'standard';
        // Lens only creates the task; the PRD, spec and tasks are written with an agent (maverick new <slug>).
        try { await exclusive(() => main(['new', idea, '--slug', slug, '--no-launch', ...(workflow === 'standard' ? [] : ['--workflow', workflow])], cwd)); await refresh(); return json(res, 201, { slug, preset: workflow }); } catch (error) { return json(res, 409, { error: error.message }); }
      }
      if (url.pathname === '/api/task-flow/run' && req.method === 'POST') {
        const body = await requestBody(req), task = String(body.task || ''), name = String(body.flow || 'ship');
        if (!/^[a-z0-9][a-z0-9-]{1,80}$/.test(task)) return json(res, 400, { error: 'A valid task id is required.' });
        const [flow, item] = await Promise.all([findFlow(cwd, name), getTask(cwd, task)]);
        const invoke = async argv => main(argv, cwd);
        const result = await exclusive(() => runFlow({ cwd, task, taskDir: item.dir, invoke }, flow, { reset: Boolean(body.reset), autoApprove: body.autoApprove === true }));
        await refresh();
        return json(res, 200, { flow: flow.name, task, run: result.run, next: result.next, notes: result.notes });
      }
      if (url.pathname === '/api/task-flow/auto-approve' && req.method === 'POST') { const result = await setAutoApprove(cwd, main, await requestBody(req)); await refresh(); return json(res, 200, result); }
      if (url.pathname === '/api/task-flow/approval' && req.method === 'POST') {
        const body = await requestBody(req), task = String(body.task || ''), name = String(body.flow || 'ship'), gateId = String(body.gate || ''), decision = body.decision === 'reject' ? 'reject' : 'approve';
        if (!/^[a-z0-9][a-z0-9-]{1,80}$/.test(task)) return json(res, 400, { error: 'A valid task id is required.' });
        if (decision === 'reject' && (typeof body.reason !== 'string' || !body.reason.trim())) return json(res, 400, { error: 'A rejection needs a reason.' });
        const [flow, item] = await Promise.all([findFlow(cwd, name), getTask(cwd, task)]);
        if (!flow.gates.some(candidate => candidate.id === gateId && ['approval', 'judge'].includes(candidate.type))) return json(res, 404, { error: 'Approval gate not found.' });
        const by = typeof body.by === 'string' && body.by.trim().slice(0, 80) || 'human', reason = typeof body.reason === 'string' && body.reason.trim() ? body.reason.trim().slice(0, 500) : undefined;
        const invoke = async argv => main(argv, cwd);
        const { approval, run, next } = await exclusive(() => recordApproval({ cwd, task, taskDir: item.dir, invoke }, flow, gateId, { decision, by, reason }));
        await refresh();
        return json(res, 200, { approval, outcome: run?.outcome || null, next });
      }
      if (req.method === 'GET' && ASSET.test(url.pathname)) {
        const body = await readFile(new URL(`.${url.pathname}`, ui)).catch(() => null);
        if (body !== null) { res.writeHead(200, { 'content-type': TYPES[url.pathname.slice(url.pathname.lastIndexOf('.'))], 'cache-control': 'no-store' }); return res.end(body); }
      }
      if (url.pathname === '/') {
        const html = (await readFile(page, 'utf8')).replace('<meta charset="utf-8">', `<meta charset="utf-8"><meta name="lens-token" content="${token}">`);
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'content-security-policy': "default-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; script-src 'self' 'unsafe-inline'; frame-ancestors 'none'" });
        return res.end(html);
      }
      res.writeHead(404); res.end('Not found');
    } catch (error) { if (!res.headersSent) json(res, error.status || (/not found/i.test(error.message) ? 404 : 500), { error: error.message }); }
  });
  if (watch) {
    const { watch: fsWatch } = await import('node:fs');
    const watcher = fsWatch(cwd, { recursive: true }, (_event, name) => {
      // Ignore Maverick's own cache and Git internals, or every refresh would trigger another.
      if (name && /(^|[\\/])(\.git|node_modules|\.maverick[\\/]cache)([\\/]|$)/.test(String(name))) return;
      // A running loop writes its state often: the Loops view follows it without rebuilding the index.
      if (name && /[\\/]loops[\\/]/.test(String(name))) { loops.onFileChange(name); return; }
      clearTimeout(timer); timer = setTimeout(() => refresh().catch(() => {}), 300);
    });
    server.once('close', () => { watcher.close(); for (const client of clients) client.end(); });
  }
  server.once('close', () => { agents.close(); loops.close(); });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(Number(port), host, resolve); }); return server;
}
