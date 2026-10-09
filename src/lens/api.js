import { readFile, readdir, stat } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { loadFlows, findFlow } from '../flows/model.js';
import { autoApproves, readState, runFlow } from '../flows/engine.js';
import { taskStage } from '../core/pipeline.js';
import { acIds, pathReferences } from '../core/quality.js';
import { getTask, listTasks } from '../core/tasks.js';
import { loadConfig } from '../core/config.js';
import { captureOutput, sectionBody } from '../core/util.js';
import { loadGraph, STATUSES } from '../subtasks/graph.js';

// Lens reads task state straight from the task files, the same way the CLI does, and changes it
// only by running Maverick commands: the cockpit never has its own copy of the truth.

const SLUG = /^[a-z0-9][a-z0-9-]{1,80}$/;
const PLAN = /^(?:PRD|SPEC|TECHSPEC|TASK)\.md$/;
const read = path => readFile(path, 'utf8').catch(() => '');
const bullets = text => String(text).split('\n').map(line => line.match(/^\s*[-*]\s+(?:\[[ xX]\]\s*)?(.+)$/)?.[1]?.trim()).filter(Boolean);

export function requireSlug(value) {
  const slug = String(value || '');
  if (!SLUG.test(slug)) throw Object.assign(new Error('A valid task id is required.'), { status: 400 });
  return slug;
}

// Every in-process Maverick command writes through one shared output sink, so commands run one at a time.
let queue = Promise.resolve();
export function exclusive(fn) { const run = queue.then(fn, fn); queue = run.catch(() => {}); return run; }

async function artifactList(dir) {
  const files = [];
  const add = async (path, kind) => { const info = await stat(path).catch(() => null); if (info?.isFile()) files.push({ file: relative(dir, path), kind, size: info.size, updated: info.mtime.toISOString() }); };
  for (const name of (await readdir(dir).catch(() => [])).filter(name => name.endsWith('.md')).sort()) await add(join(dir, name), PLAN.test(name) ? 'plan' : name === 'REVIEW.md' ? 'review' : 'report');
  for (const name of (await readdir(join(dir, 'subtasks')).catch(() => [])).filter(name => name.endsWith('.md')).sort()) await add(join(dir, 'subtasks', name), 'subtask');
  return files;
}

// Flows a task can use: `ship` always, `spec` for spec-driven tasks, and any flow that already ran for it.
async function taskFlows(cwd, dir, preset) {
  const [{ flows }, config] = await Promise.all([loadFlows(cwd), loadConfig(cwd).catch(() => null)]), result = [];
  for (const flow of flows) {
    const state = await readState(dir, flow.name);
    if (!state.runs.length && flow.name !== 'ship' && !(flow.name === 'spec' && preset.id === 'spec-driven')) continue;
    result.push({
      name: flow.name, description: flow.description, source: flow.source, contract: flow.contract,
      gates: flow.gates.map(gate => ({ id: gate.id, type: gate.type, run: gate.run, severity: gate.severity, description: gate.description, prompt: gate.prompt })),
      status: state.status || 'not run', approvals: state.approvals || {}, autoApprove: autoApproves(config, flow.name), lastRun: state.runs.at(-1) || null,
      history: state.runs.slice(-10).map(run => ({ at: run.at, outcome: run.outcome, iteration: run.iteration }))
    });
  }
  return result.sort((a, b) => (a.name === 'ship' ? -1 : b.name === 'ship' ? 1 : a.name.localeCompare(b.name)));
}

function activityOf(flows, artifacts) {
  const tone = { done: 'ok', revise: 'bad', stalled: 'bad', exhausted: 'bad', 'awaiting-approval': 'warn' };
  const items = [];
  for (const flow of flows) {
    for (const run of flow.history) items.push({ at: run.at, tone: tone[run.outcome] || 'info', text: `${flow.name} flow ran`, detail: run.outcome.replace(/-/g, ' ') });
    for (const [gate, approval] of Object.entries(flow.approvals)) items.push({ at: approval.at, tone: approval.decision === 'approve' ? 'accent' : 'bad', text: `${approval.by} ${approval.decision === 'approve' ? 'approved' : 'requested changes on'} ${gate}`, detail: approval.reason || '' });
  }
  for (const artifact of artifacts.filter(item => item.kind !== 'report')) items.push({ at: artifact.updated, tone: 'info', text: `${artifact.file} updated`, detail: '' });
  return items.sort((a, b) => b.at.localeCompare(a.at)).slice(0, 40);
}

/** Everything the task page shows, read from the task directory. */
export async function taskDetail(cwd, slug) {
  const { dir, preset, meta } = await getTask(cwd, requireSlug(slug));
  const [status, graph, artifacts, flows] = await Promise.all([taskStage(dir, preset, slug), loadGraph(dir), artifactList(dir), taskFlows(cwd, dir, preset)]);
  const [prd, spec, techspec] = await Promise.all(['PRD.md', 'SPEC.md', 'TECHSPEC.md'].map(file => read(join(dir, file))));
  const tested = acIds(sectionBody(techspec, 'Test Plan')), specified = acIds(spec);
  const criteria = sectionBody(prd, 'Acceptance Criteria').split('\n').filter(line => acIds(line).length).map(line => {
    const id = acIds(line)[0];
    return { id, text: line.replace(/^\s*[-*]\s*(?:\[[ xX]\]\s*)?/, '').replace(new RegExp(`^\\**${id}\\**\\s*[:—-]?\\s*`), '').trim(), specified: specified.includes(id), tested: tested.includes(id), tasks: graph.items.filter(item => acIds(item.body).includes(id)).map(item => item.id) };
  });
  const subtasks = graph.items.map(item => ({ id: item.id, file: item.file, title: item.title, status: item.status, ready: item.ready, type: item.type || null, complexity: item.complexity || null, dependsOn: item.dependsOn, checklist: { total: item.checklist.total, done: item.checklist.done }, criteria: acIds(item.body), files: pathReferences(sectionBody(item.body, 'Files'), { includeNew: true }) }));
  const title = meta.idea || prd.match(/^#\s+(.+)$/m)?.[1]?.replace(/^PRD\s*[—-]\s*/, '').trim() || slug;
  return {
    id: slug, title, workflow: preset.id, stages: preset.stages, stage: status.stage, next: status.next, created: meta.createdAt || null,
    goal: sectionBody(prd, 'Overview').trim(), goals: bullets(sectionBody(prd, 'Goals')), nonGoals: bullets(sectionBody(prd, 'Non-Goals')),
    scope: pathReferences([sectionBody(techspec, 'File References'), sectionBody(techspec, 'Impact')].join('\n'), { includeNew: true }),
    criteria, subtasks, subtaskProblems: graph.problems, statuses: STATUSES, artifacts, flows,
    evidence: artifacts.some(item => item.file === 'EVIDENCE.md'), activity: activityOf(flows, artifacts)
  };
}

/** One task file, only from inside the task directory. */
export async function taskArtifact(cwd, slug, file) {
  const { dir } = await getTask(cwd, requireSlug(slug));
  const name = String(file || '');
  if (!/^(?:subtasks\/)?[\w.-]+\.md$/.test(name) || name.includes('..')) throw Object.assign(new Error('Unknown artifact.'), { status: 400 });
  const text = await readFile(join(dir, name), 'utf8').catch(() => null);
  if (text === null) throw Object.assign(new Error('Artifact not found.'), { status: 404 });
  return { file: name, content: text };
}

/** Every recorded flow run across tasks, newest first. */
export async function allRuns(cwd) {
  const config = await loadConfig(cwd), runs = [];
  for (const task of await listTasks(cwd, config).catch(() => [])) {
    const slug = task.task, dir = join(cwd, config.taskRoot, slug);
    for (const name of (await readdir(join(dir, 'flows')).catch(() => [])).filter(file => file.endsWith('.json'))) {
      const state = JSON.parse(await read(join(dir, 'flows', name)) || '{}');
      for (const run of state.runs || []) runs.push({ task: slug, flow: state.flow || name.replace(/\.json$/, ''), at: run.at, outcome: run.outcome, iteration: run.iteration, results: (run.results || []).map(result => ({ id: result.id, type: result.type, severity: result.severity, status: result.status, issues: result.issues || [], summary: result.summary || '' })) });
    }
  }
  return runs.sort((a, b) => b.at.localeCompare(a.at)).slice(0, 200);
}

// The commands the cockpit may run on a task, with the arguments it adds. Nothing else is reachable.
const TASK_COMMANDS = { validate: [], verify: [], guard: [], security: [], deps: [], readiness: [], review: ['--diff'], checkpoint: [], pr: [] };

/** Runs one whitelisted Maverick command and returns its output; failures are results, not errors. */
export async function runAction(cwd, main, body) {
  const action = String(body.action || ''), task = requireSlug(body.task);
  let argv;
  if (TASK_COMMANDS[action]) argv = [action, task, ...TASK_COMMANDS[action]];
  else if (action === 'subtask-set') {
    const id = String(body.id || ''), status = String(body.status || '');
    if (!/^\d{2,3}$/.test(id) || !STATUSES.includes(status)) throw Object.assign(new Error('A subtask id and a valid status are required.'), { status: 400 });
    argv = ['subtask', 'set', task, id, status, ...(body.force && status === 'done' ? ['--force'] : [])];
  } else if (action === 'flow-run') {
    const flow = await findFlow(cwd, String(body.flow || 'ship')), { dir } = await getTask(cwd, task);
    return exclusive(async () => {
      try {
        const result = await runFlow({ cwd, task, taskDir: dir, invoke: argv2 => main(argv2, cwd) }, flow, { reset: Boolean(body.reset), autoApprove: body.autoApprove === true });
        return { ok: true, action, run: result.run, next: result.next, notes: result.notes };
      } catch (error) { return { ok: false, action, error: error.message }; }
    });
  } else throw Object.assign(new Error(`Unknown action: ${action || '(none)'}`), { status: 400 });
  return exclusive(async () => {
    try { const { output } = await captureOutput(() => main(argv, cwd)); return { ok: true, action, command: `maverick ${argv.join(' ')}`, output }; }
    catch (error) { return { ok: false, action, command: `maverick ${argv.join(' ')}`, output: error.output || '', error: error.message }; }
  });
}

/** Turns a flow's auto-approval on or off with `maverick flow auto-approve`, so Lens and the CLI write the same file. */
export async function setAutoApprove(cwd, main, body) {
  const flow = String(body.flow || '');
  if (!/^[a-z0-9][a-z0-9-]{0,40}$/.test(flow)) throw Object.assign(new Error('A flow name is required.'), { status: 400 });
  const argv = ['flow', 'auto-approve', flow, body.enabled ? 'on' : 'off'];
  return exclusive(async () => {
    try { const { output } = await captureOutput(() => main([...argv, '--json'], cwd)); return { ok: true, command: `maverick ${argv.join(' ')}`, ...JSON.parse(output) }; }
    catch (error) { return { ok: false, command: `maverick ${argv.join(' ')}`, error: error.message }; }
  });
}
