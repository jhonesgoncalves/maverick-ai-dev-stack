import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { loadConfig } from '../core/config.js';
import { getTask } from '../core/tasks.js';
import { brand, commandAvailable, exists, output, pretty, rel } from '../core/util.js';
import { resolveRun, stageDefaults, PERMISSIONS } from '../runtime/policy.js';
import { AGENT_STAGES, EFFORTS, STAGE_IDS, stageOf } from '../runtime/stages.js';
import { providersFor, resolveBin, shellFor } from '../runtime/providers.js';
import { detectStack, selectVerificationCommands } from '../core/stack.js';
import { buildPrompt } from '../runtime/prompt.js';
import { runAgent } from '../runtime/session.js';
import { loadGraph, setStatus } from '../subtasks/graph.js';

const str = value => (typeof value === 'string' ? value : undefined);

/** Streams normalised events to the terminal; JSON mode stays silent until the summary. */
export function printer(options) {
  if (options.json || options.quiet) return () => {};
  return event => {
    if (event.type === 'start') output(`▶ ${event.provider}${event.model ? ` (${event.model})` : ''} · permission ${event.permission}`);
    else if (event.type === 'text' && event.text.trim()) output(event.text.trim());
    else if (event.type === 'tool') output(`  → ${event.name}${event.detail ? ` ${event.detail}` : ''}`);
    else if (event.type === 'error') output(`  ! ${event.message}`);
  };
}

export async function selectSubtask(taskDir, reference) {
  if (!reference) return undefined;
  const graph = await loadGraph(taskDir);
  if (graph.problems.length) throw new Error(`fix the subtask graph first: ${graph.problems.join('; ')}`);
  const subtask = reference === 'next' ? graph.items.find(item => item.ready) : graph.items.find(item => item.id === String(reference).padStart(2, '0'));
  if (!subtask) throw new Error(reference === 'next' ? 'no subtask is ready; run maverick subtask list' : `subtask not found: ${reference}`);
  if (subtask.status !== 'in-progress' && !subtask.ready) throw new Error(`subtask ${subtask.id} is not ready (status ${subtask.status}, depends on ${subtask.dependsOn.join(', ') || 'nothing'})`);
  return subtask;
}

/** Shared by `agent run` and `flow run --agent`. */
export async function startAgentRun(cwd, { slug, dir, config, subtask, instruction, issues, options, onEvent, signal }) {
  const plan = resolveRun(config, { provider: str(options.provider) || str(options.agent), model: str(options.model), effort: str(options.effort), permission: str(options.permission), subtask, stage: stageOf({ issues }) }, providersFor(config));
  // The project's checks: listed in the prompt, and the only shell an `edit` run gets where the tool can scope it.
  const commands = selectVerificationCommands(await detectStack(cwd), config);
  const subtaskFile = subtask ? rel(cwd, join(dir, 'subtasks', subtask.file)) : undefined;
  const prompt = await buildPrompt({ taskDir: dir, task: slug, subtask, subtaskFile, instruction, issues, commands, shell: shellFor(plan.provider, plan.permission) });
  const timeoutMs = Math.round((Number(options.timeout) || config.runtime?.timeoutMinutes || 30) * 60000);
  if (options.dryRun) return { dryRun: true, plan, prompt, invocation: plan.provider.invocation({ prompt: '<prompt>', model: plan.model, effort: plan.effort, permission: plan.permission, commands }) };
  const controller = new globalThis.AbortController(), abort = () => controller.abort();
  process.once('SIGINT', abort);
  // Lens stops a run through its own signal; the terminal still stops it with Ctrl+C.
  if (signal) { if (signal.aborted) abort(); else signal.addEventListener('abort', abort, { once: true }); }
  try {
    const run = await runAgent({ cwd, config, taskDir: dir, task: slug, provider: plan.provider, model: plan.model, effort: plan.effort, permission: plan.permission, commands, prompt, timeoutMs, signal: controller.signal, onEvent });
    return { plan, run };
  } finally { process.removeListener('SIGINT', abort); signal?.removeEventListener('abort', abort); }
}

async function run(cwd, slug, options) {
  const { dir } = await getTask(cwd, slug), config = await loadConfig(cwd);
  const subtask = await selectSubtask(dir, str(options.subtask) || (options.subtask === true ? 'next' : undefined));
  if (subtask && subtask.status === 'pending' && !options.dryRun) await setStatus(dir, slug, subtask.id, 'in-progress');
  const outcome = await startAgentRun(cwd, { slug, dir, config, subtask, instruction: str(options.prompt), options, onEvent: printer(options) });
  if (outcome.dryRun) {
    const { plan, prompt, invocation } = outcome;
    const argv = [resolveBin(plan.provider, config, cwd), ...invocation.args];
    if (options.json) return output(JSON.stringify({ provider: plan.provider.id, model: plan.model || null, effort: plan.effort || null, stage: plan.stage, permission: plan.permission, route: plan.route, argv, stdin: invocation.input !== undefined, prompt }, null, 2));
    return output(`${brand()} / AGENT (dry run)\nProvider: ${plan.provider.name} (${plan.route})\nModel: ${plan.model || 'provider default'}\nReasoning: ${plan.effort || 'provider default'}\nStage: ${plan.stage}\nPermission: ${plan.permission}\nCommand: ${argv.join(' ')}${invocation.input !== undefined ? ' < prompt' : ''}\n\n----- prompt -----\n${prompt}`);
  }
  const { plan, run: result } = outcome;
  const payload = { provider: plan.provider.id, model: plan.model || null, effort: plan.effort || null, permission: plan.permission, ok: result.ok, problems: result.problems, status: result.result?.status || null, summary: result.result?.summary || null, questions: result.result?.questions || [], filesChanged: result.result?.filesChanged || [], sessionId: result.sessionId || null, durationMs: result.durationMs, cost: result.cost ?? null, subtask: subtask?.id || null, transcript: rel(cwd, result.transcript), warnings: result.warnings };
  if (options.json) output(JSON.stringify(payload, null, 2));
  else {
    output(`\n${brand()} / AGENT ${result.ok ? 'FINISHED' : 'FAILED'} in ${Math.round(result.durationMs / 1000)}s${payload.cost != null ? ` · $${Number(payload.cost).toFixed(4)}` : ''}`);
    result.problems.forEach(problem => output(`! ${problem}`));
    result.warnings.forEach(warning => output(`WARN ${warning}`));
    if (result.result) { output(`Status: ${result.result.status}\n${result.result.summary}`); result.result.questions.forEach(question => output(`? ${question}`)); }
    else if (result.ok) output('The agent did not return a maverick-result block; review its output before trusting it.');
    output(`Transcript: ${payload.transcript}${subtask ? `\nWhen verified: maverick subtask set ${slug} ${subtask.id} done` : ''}\nNext: maverick flow run ship ${slug}`);
  }
  if (!result.ok) throw new Error('agent run failed');
}

async function confirm(question, options) {
  if (options.yes) return true;
  if (!process.stdin.isTTY || !process.stdout.isTTY) throw new Error('rerun with --yes to confirm');
  const prompt = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await prompt.question(`${question} [y/N] `); prompt.close();
  return /^y(es)?$/i.test(answer.trim());
}

/** Edits the project configuration: trust is a reviewed, committed decision, not a flag. */
async function trust(cwd, id, options, add = true) {
  const config = await loadConfig(cwd), providers = providersFor(config);
  const provider = providers.find(item => item.id === id);
  if (!provider) throw new Error(`unknown provider ${id || ''}; available: ${providers.map(item => item.id).join(', ')}`);
  const path = join(cwd, '.maverick', 'config.json');
  const current = await exists(path) ? JSON.parse(await readFile(path, 'utf8')) : { version: 1 };
  const runtime = { ...current.runtime };
  const trusted = new Set(runtime.trusted || []);
  if (add) trusted.add(id); else trusted.delete(id);
  runtime.trusted = [...trusted].sort();
  const max = str(options.maxPermission);
  if (max && !PERMISSIONS.includes(max)) throw new Error(`--max-permission must be one of ${PERMISSIONS.join(', ')}`);
  if (add && max) runtime.maxPermission = max;
  if (add && !runtime.default) runtime.default = { provider: id };
  if (!add && runtime.default?.provider === id) delete runtime.default;
  const ceiling = runtime.maxPermission || 'edit';
  const message = add ? `Trust ${provider.name} to run in ${cwd} with up to "${ceiling}" permission? It will run ${[provider.bin].flat().join(' or ')} with your user account.` : `Stop trusting ${provider.name}?`;
  if (!await confirm(message, options)) return output('Nothing changed.');
  await mkdir(join(cwd, '.maverick'), { recursive: true });
  await writeFile(path, pretty({ ...current, runtime }));
  output(options.json ? JSON.stringify({ trusted: runtime.trusted, maxPermission: ceiling, default: runtime.default || null }) : `${brand()} / AGENT\n✓ ${add ? 'trusted' : 'untrusted'} ${id}; runtime written to ${rel(cwd, path)}\nMax permission: ${ceiling}. Commit this file so the team reviews the decision.`);
}

/** Sets or clears a workflow step's default agent, model and reasoning in `runtime.stages`. */
async function stage(cwd, id, options) {
  const config = await loadConfig(cwd), providers = providersFor(config);
  if (!id) {
    const defaults = stageDefaults(config, providers, STAGE_IDS);
    if (options.json) return output(JSON.stringify({ stages: AGENT_STAGES.map(item => ({ ...item, ...defaults[item.id] })) }, null, 2));
    return output(`${brand()} / AGENT STAGES\n\n${AGENT_STAGES.map(item => { const value = defaults[item.id]; return `${item.id.padEnd(10)}${String(value.provider || 'not set').padEnd(13)}${String(value.model || 'provider default').padEnd(22)}${(value.effort || '—').padEnd(8)}${value.configured ? 'configured' : 'recommended'}`; }).join('\n')}\n\nChange one with: maverick agent stage <stage> --provider <id> --model <model> --effort <level>`);
  }
  if (!STAGE_IDS.includes(id)) throw new Error(`stage must be one of ${STAGE_IDS.join(', ')}`);
  const provider = str(options.provider) || str(options.agent), model = str(options.model), effort = str(options.effort);
  const definition = provider && providers.find(item => item.id === provider);
  if (provider && !definition) throw new Error(`unknown provider ${provider}; available: ${providers.map(item => item.id).join(', ')}`);
  if (effort && !EFFORTS.includes(effort)) throw new Error(`--effort must be one of ${EFFORTS.join(', ')}`);
  const target = definition || providers.find(item => item.id === (config.runtime?.stages?.[id]?.provider || config.runtime?.default?.provider));
  if (effort && target && !target.efforts?.includes(effort)) throw new Error(`${target.name} ${target.efforts?.length ? `accepts reasoning ${target.efforts.join(', ')}` : 'has no reasoning setting'}`);
  const path = join(cwd, '.maverick', 'config.json');
  const current = await exists(path) ? JSON.parse(await readFile(path, 'utf8')) : { version: 1 };
  const runtime = { ...current.runtime }, stages = { ...runtime.stages };
  if (options.reset) delete stages[id];
  else {
    const entry = { ...stages[id], ...(provider && { provider }), ...(model && { model }), ...(effort && { effort }) };
    // A new agent drops the old agent's model and reasoning unless new ones are given.
    if (provider && stages[id]?.provider !== provider) { if (!model) delete entry.model; if (!effort) delete entry.effort; }
    if (options.model === '') delete entry.model;
    if (options.effort === '') delete entry.effort;
    if (!Object.keys(entry).length) throw new Error('pass --provider, --model or --effort, or --reset');
    stages[id] = entry;
  }
  if (Object.keys(stages).length) runtime.stages = stages; else delete runtime.stages;
  await mkdir(join(cwd, '.maverick'), { recursive: true });
  await writeFile(path, pretty({ ...current, runtime }));
  const value = stageDefaults(await loadConfig(cwd), providers, [id])[id];
  output(options.json ? JSON.stringify({ stage: id, ...value }) : `${brand()} / AGENT\n✓ ${id}: ${value.provider || 'no agent'} · ${value.model || 'provider default'} · ${value.effort || 'default reasoning'}${options.reset ? ' (back to the recommendation)' : ''}\nWritten to ${rel(cwd, path)}.`);
}

async function list(cwd, options) {
  const config = await loadConfig(cwd), trusted = config.runtime?.trusted || [];
  const rows = providersFor(config).map(provider => ({ id: provider.id, name: provider.name, bin: resolveBin(provider, config, cwd), installed: commandAvailable(resolveBin(provider, config, cwd), cwd), trusted: trusted.includes(provider.id), permissions: PERMISSIONS.filter(level => provider.permissions[level] === true), custom: Boolean(provider.custom) }));
  if (options.json) return output(JSON.stringify({ providers: rows, maxPermission: config.runtime?.maxPermission || 'edit', default: config.runtime?.default || null, routes: config.runtime?.routes || [] }, null, 2));
  output(`${brand()} / AGENTS\n\n${rows.map(row => `${row.id.padEnd(13)}${(row.installed ? 'installed' : 'missing').padEnd(11)}${(row.trusted ? 'trusted' : '—').padEnd(9)}${row.permissions.join(', ')}${row.custom ? '  [custom]' : ''}`).join('\n')}\n\nMax permission: ${config.runtime?.maxPermission || 'edit'} · default: ${config.runtime?.default?.provider || 'not set'}\nTrust one with: maverick agent trust <provider>`);
}

async function runs(cwd, slug, options) {
  const { dir } = await getTask(cwd, slug);
  const files = (await readdir(join(dir, 'runs')).catch(() => [])).filter(file => file.endsWith('.jsonl')).sort();
  const items = [];
  for (const file of files) {
    const events = (await readFile(join(dir, 'runs', file), 'utf8')).split('\n').filter(Boolean).map(line => { try { return JSON.parse(line); } catch { return null; } }).filter(Boolean);
    const start = events.find(event => event.type === 'start'), end = events.findLast(event => event.type === 'end');
    items.push({ file: rel(cwd, join(dir, 'runs', file)), provider: start?.provider, at: start?.at, ok: end?.ok ?? null, status: end?.status ?? null, durationMs: end?.durationMs ?? null });
  }
  if (options.json) return output(JSON.stringify(items, null, 2));
  output(items.length ? items.map(item => `${item.at}  ${String(item.provider).padEnd(12)}${item.ok === null ? 'incomplete' : item.ok ? 'ok' : 'failed'}${item.status ? ` · ${item.status}` : ''}  ${item.file}`).join('\n') : `No agent runs for ${slug} yet.`);
}

async function agentCommand(cwd, [action, target], options = {}) {
  if (!action || action === 'list') return list(cwd, options);
  if (action === 'run') return run(cwd, target, options);
  if (action === 'trust') return trust(cwd, target, options, true);
  if (action === 'untrust') return trust(cwd, target, options, false);
  if (action === 'runs') return runs(cwd, target, options);
  if (action === 'stage' || action === 'stages') return stage(cwd, target, options);
  throw new Error('use agent list, agent trust <provider>, agent untrust <provider>, agent stage [<stage>], agent run <task>, or agent runs <task>');
}

export const agentCommands = [
  { id: 'agent', description: 'Run trusted AI coding agents headlessly with scoped permissions.', aliases: [], usage: 'agent list|trust|untrust|stage [<stage>]|run <task>|runs <task>', run: ({ cwd, rest, options }) => agentCommand(cwd, rest, options) }
];
