import { randomUUID } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { selectSubtask, startAgentRun } from '../commands/agent.js';
import { loadConfig } from '../core/config.js';
import { getTask, listTasks } from '../core/tasks.js';
import { captureOutput, commandAvailable } from '../core/util.js';
import { listModels } from '../runtime/models.js';
import { PERMISSIONS, resolveRun, stageDefaults } from '../runtime/policy.js';
import { AGENT_STAGES, EFFORTS, RECOMMENDED, STAGE_IDS, stageOf } from '../runtime/stages.js';
import { providersFor, resolveBin } from '../runtime/providers.js';
import { setStatus } from '../subtasks/graph.js';
import { exclusive, requireSlug } from './api.js';

// Agent runs started from Lens live in this process: their events stream to the page as they
// happen, and the runtime writes the same transcript `maverick agent run` writes.

const fail = (message, status = 400) => Object.assign(new Error(message), { status });
const text = (value, max) => (typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : undefined);
const parseLines = body => body.split('\n').filter(Boolean).map(line => { try { return JSON.parse(line); } catch { return null; } }).filter(Boolean);
const MAX_EVENTS = 3000;

export function createAgentHub({ cwd, main, broadcast = () => {}, onFinish = () => {} }) {
  const live = new Map();
  const view = run => { const { controller, ...rest } = run; return { ...rest, events: undefined, eventCount: run.events.length }; };

  async function providers() {
    const config = await loadConfig(cwd), trusted = config.runtime?.trusted || [];
    return {
      providers: providersFor(config).map(provider => { const bin = resolveBin(provider, config, cwd); return { id: provider.id, name: provider.name, bin, installed: commandAvailable(bin, cwd), trusted: trusted.includes(provider.id), permissions: PERMISSIONS.filter(level => provider.permissions[level] === true), efforts: provider.efforts || [], recommended: RECOMMENDED[provider.id] || {}, custom: Boolean(provider.custom) }; }),
      stages: AGENT_STAGES, stageDefaults: stageDefaults(config, providersFor(config), STAGE_IDS), configuredStages: config.runtime?.stages || {},
      permissions: PERMISSIONS, efforts: EFFORTS, maxPermission: config.runtime?.maxPermission || 'edit', default: config.runtime?.default || null, routes: config.runtime?.routes || [], timeoutMinutes: config.runtime?.timeoutMinutes || 30
    };
  }

  /** Trust decisions go through `maverick agent trust`, so Lens and the CLI write the same file. */
  async function trust(body) {
    const provider = text(body.provider, 60), max = text(body.maxPermission, 20);
    if (!provider || !/^[a-z0-9][a-z0-9-]*$/.test(provider)) throw fail('A provider id is required.');
    if (max && !PERMISSIONS.includes(max)) throw fail(`maxPermission must be one of ${PERMISSIONS.join(', ')}`);
    const argv = ['agent', body.trusted === false ? 'untrust' : 'trust', provider, '--yes', ...(max && body.trusted !== false ? ['--max-permission', max] : [])];
    return exclusive(async () => {
      try { const { output } = await captureOutput(() => main(argv, cwd)); return { ok: true, command: `maverick ${argv.join(' ')}`, output }; }
      catch (error) { return { ok: false, command: `maverick ${argv.join(' ')}`, output: error.output || '', error: error.message }; }
    });
  }

  /** Models for the picker: listed by the provider's CLI when it can, suggested otherwise. */
  async function models(id) {
    const config = await loadConfig(cwd), provider = providersFor(config).find(item => item.id === id);
    if (!provider) throw fail('Unknown provider.', 404);
    return { provider: provider.id, efforts: provider.efforts || [], ...(await listModels(provider, config, cwd)) };
  }

  /** Stage defaults go through `maverick agent stage`, like trust, so Lens and the CLI write the same file. */
  async function setStage(body) {
    const stage = text(body.stage, 20);
    if (!STAGE_IDS.includes(stage)) throw fail(`stage must be one of ${STAGE_IDS.join(', ')}`);
    const provider = text(body.provider, 60), model = typeof body.model === 'string' ? body.model.trim().slice(0, 120) : undefined, effort = typeof body.effort === 'string' ? body.effort.trim() : undefined;
    if (provider && !/^[a-z0-9][a-z0-9-]*$/.test(provider)) throw fail('Unknown provider.');
    if (model && !/^[\w.:/@-]+$/.test(model)) throw fail('A model id has no spaces or shell characters.');
    if (effort && !EFFORTS.includes(effort)) throw fail(`effort must be one of ${EFFORTS.join(', ')}`);
    const argv = ['agent', 'stage', stage, ...(body.reset ? ['--reset'] : [...(provider ? ['--provider', provider] : []), ...(model !== undefined ? ['--model', model] : []), ...(effort !== undefined ? ['--effort', effort] : [])]), '--json'];
    return exclusive(async () => {
      try { const { output } = await captureOutput(() => main(argv, cwd)); return { ok: true, command: `maverick ${argv.slice(0, -1).join(' ')}`, data: JSON.parse(output) }; }
      catch (error) { return { ok: false, command: `maverick ${argv.slice(0, -1).join(' ')}`, error: error.message }; }
    });
  }

  async function start(body) {
    const task = requireSlug(body.task), { dir } = await getTask(cwd, task), config = await loadConfig(cwd);
    if ([...live.values()].some(run => run.task === task && run.status === 'running')) throw fail(`An agent is already running on ${task}. Stop it or wait for it to finish.`, 409);
    // Choosing the subtask and the provider are request problems (400), not server errors.
    const invalid = error => { throw fail(error.message); };
    const subtask = body.subtask ? await selectSubtask(dir, String(body.subtask)).catch(invalid) : undefined;
    const issues = Array.isArray(body.issues) ? body.issues.filter(item => typeof item === 'string').slice(0, 50).map(item => item.slice(0, 500)) : undefined;
    const options = { provider: text(body.provider, 60), model: text(body.model, 120), effort: text(body.effort, 20), permission: text(body.permission, 20) };
    // Resolve first so an untrusted provider or a permission above the ceiling fails before anything changes.
    let plan; try { plan = resolveRun(config, { ...options, subtask, stage: stageOf({ issues }) }, providersFor(config)); } catch (error) { invalid(error); }
    if (subtask?.status === 'pending') await setStatus(dir, task, subtask.id, 'in-progress');
    const controller = new globalThis.AbortController();
    const run = { id: randomUUID(), task, subtask: subtask?.id || null, subtaskTitle: subtask?.title || null, provider: plan.provider.id, providerName: plan.provider.name, model: plan.model || null, effort: plan.effort || null, stage: plan.stage, permission: plan.permission, kind: issues?.length ? 'fix' : subtask ? 'subtask' : 'task', instruction: text(body.prompt, 4000) || null, status: 'running', startedAt: new Date().toISOString(), endedAt: null, events: [], result: null, controller };
    live.set(run.id, run);
    const onEvent = event => {
      const item = { at: new Date().toISOString(), ...event };
      run.events.push(item); if (run.events.length > MAX_EVENTS) run.events.splice(0, run.events.length - MAX_EVENTS);
      broadcast('agent', { id: run.id, event: item });
    };
    startAgentRun(cwd, { slug: task, dir, config, subtask, instruction: run.instruction || undefined, issues, options, onEvent, signal: controller.signal })
      .then(({ run: result }) => {
        run.status = controller.signal.aborted ? 'stopped' : result.ok ? 'ok' : 'failed';
        run.result = { ok: result.ok, problems: result.problems, warnings: result.warnings || [], status: result.result?.status || null, summary: result.result?.summary || null, questions: result.result?.questions || [], filesChanged: result.result?.filesChanged || [], disputes: result.result?.disputes || [], durationMs: result.durationMs, cost: result.cost ?? null, transcript: relative(cwd, result.transcript) };
      })
      .catch(error => { run.status = controller.signal.aborted ? 'stopped' : 'failed'; run.result = { ok: false, problems: [error.message], warnings: [], questions: [], filesChanged: [] }; onEvent({ type: 'error', message: error.message }); })
      .finally(() => { run.endedAt = new Date().toISOString(); broadcast('agent-end', { id: run.id, status: run.status }); onFinish(); });
    return view(run);
  }

  function stop(id) {
    const run = live.get(String(id || ''));
    if (!run) throw fail('Unknown run.', 404);
    if (run.status === 'running') run.controller.abort();
    return view(run);
  }

  function get(id) {
    const run = live.get(String(id || ''));
    if (!run) throw fail('Unknown run.', 404);
    return { ...view(run), events: run.events };
  }

  /** Transcripts of every task, newest first, plus the runs this Lens process started. */
  async function runs() {
    const config = await loadConfig(cwd), history = [];
    const running = [...live.values()].filter(run => run.status === 'running');
    for (const { task } of await listTasks(cwd, config).catch(() => [])) {
      const dir = join(cwd, config.taskRoot, task, 'runs');
      for (const file of (await readdir(dir).catch(() => [])).filter(name => name.endsWith('.jsonl'))) {
        const events = parseLines(await readFile(join(dir, file), 'utf8').catch(() => ''));
        const first = events.find(event => event.type === 'start'), end = events.findLast(event => event.type === 'end'), result = events.findLast(event => event.type === 'result');
        if (!end && running.some(run => run.task === task && run.provider === first?.provider)) continue; // shown as live
        history.push({ task, file, provider: first?.provider || file.replace(/^.*-/, '').replace(/\.jsonl$/, ''), model: first?.model || null, permission: first?.permission || null, at: first?.at || null, ok: end?.ok ?? null, status: end?.status ?? null, durationMs: end?.durationMs ?? null, cost: result?.cost ?? null, problems: end?.problems || [], tools: events.filter(event => event.type === 'tool').length });
      }
    }
    return { live: [...live.values()].sort((a, b) => b.startedAt.localeCompare(a.startedAt)).map(view), history: history.sort((a, b) => String(b.at).localeCompare(String(a.at))).slice(0, 200) };
  }

  async function transcript(task, file) {
    const slug = requireSlug(task), name = String(file || '');
    if (!/^[\w.-]+\.jsonl$/.test(name)) throw fail('Unknown transcript.');
    const { dir } = await getTask(cwd, slug);
    const body = await readFile(join(dir, 'runs', name), 'utf8').catch(() => null);
    if (body === null) throw fail('Transcript not found.', 404);
    return { task: slug, file: name, events: parseLines(body).slice(-MAX_EVENTS) };
  }

  function close() { for (const run of live.values()) if (run.status === 'running') run.controller.abort(); }
  return { providers, models, setStage, trust, start, stop, get, runs, transcript, close };
}
