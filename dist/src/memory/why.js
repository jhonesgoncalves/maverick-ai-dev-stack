import { readFile, realpath } from 'node:fs/promises';
import { isAbsolute, join, relative, sep } from 'node:path';
import { loadConfig } from '../core/config.js';
import { acIds, criteriaOf, pathReferences, scIds } from '../core/quality.js';
import { listTasks, taskMeta, taskPath } from '../core/tasks.js';
import { exists, readText, sectionBody } from '../core/util.js';
import { readState as readFlowState } from '../flows/engine.js';
import { globToRegex } from '../intel/architecture.js';
import { git, listCheckpointRefs, readCommit } from '../loop/git.js';
import { readLedger } from '../loop/ledger.js';
import { LOOP_DEFAULTS, loopIds, loopPaths } from '../loop/model.js';
import { readSealed } from '../sealed/model.js';
import { loadGraph } from '../subtasks/graph.js';
import { contractsTouching, listContracts } from './contracts.js';

// `maverick why <file:line>`: git blame says who and when; this says why. It walks edges that
// already exist: blame → the commit's "Maverick task" trailer → the loop checkpoint that wrote the
// line (blame of the current content against each loop's checkpoint chain, so no text matching)
// → the ledger's iteration (agent, model, effort, gates, integrity) → the subtask and the
// criteria it serves → the judges, the sealed suite, the flows' approvals and the human review →
// the contracts that guard the line now. What is missing is said, never invented.

const ZERO = /^0{40}$/;
const SUBJECT = /^maverick loop (\S+) #(\d+)(?: \((.+)\))?/;

/** Maverick's commit trailers: the task (`maverick pr`), and a loop checkpoint's loop and iteration. */
export function parseTrailers(message = '') {
  const subject = String(message).match(SUBJECT);
  return {
    task: String(message).match(/^Maverick task:\s*(\S+)/m)?.[1] || subject?.[1] || null,
    loopId: String(message).match(/^Maverick-Loop:\s*(\S+)/m)?.[1] || null,
    iteration: Number(String(message).match(/^Maverick-Iteration:\s*(\d+)/m)?.[1] ?? NaN),
    label: subject?.[3] || null
  };
}

/** `git blame --porcelain` of one line; with `rev`, the current content is blamed against that commit's history. */
async function blame(cwd, file, line, { rev } = {}) {
  const args = ['blame', '--porcelain', '-L', `${line},${line}`, ...(rev ? ['--contents', file, rev] : []), '--', file];
  const result = await git(cwd, args);
  if (!result.ok) return null;
  const lines = result.stdout.split('\n'), [commit] = lines[0].split(' '), field = name => lines.find(item => item.startsWith(`${name} `))?.slice(name.length + 1);
  return { commit, uncommitted: ZERO.test(commit), author: field('author') || null, at: field('author-time') ? new Date(Number(field('author-time')) * 1000).toISOString() : null, summary: field('summary') || null };
}

/** The tip of each loop's checkpoint chain for a task, newest loop first. Checkpoint refs first; after `loop clean`, the ledgers' records. */
export async function loopTips(cwd, taskDir, task) {
  const tips = new Map();
  for (const ref of await listCheckpointRefs(cwd, task, { lanes: true })) {
    const loopId = parseTrailers((await readCommit(cwd, ref.commit))?.message).loopId;
    if (loopId && (!tips.has(loopId) || tips.get(loopId).n < ref.n)) tips.set(loopId, { loopId, n: ref.n, commit: ref.commit });
  }
  for (const loopId of await loopIds(taskDir)) {
    if (tips.has(loopId)) continue;
    const entries = await readLedger(loopPaths(taskDir, loopId).ledger).catch(() => []);
    const last = entries.map(entry => entry.data?.checkpoint).filter(point => point?.commit).at(-1);
    if (last && (await git(cwd, ['cat-file', '-e', `${last.commit}^{commit}`])).ok) tips.set(loopId, { loopId, n: last.n, commit: last.commit });
  }
  return [...tips.values()].sort((a, b) => b.loopId.localeCompare(a.loopId));
}

const iterationOf = (entries, n, type) => entries.filter(entry => entry.type === type && entry.data?.n === n).at(-1)?.data || null;

/** What a loop's ledger says about iteration `n`: who built it, what checked it, what judged it. */
function builtFrom(entries, n, scope) {
  const start = iterationOf(entries, n, 'iteration-start'), end = iterationOf(entries, n, 'iteration-end');
  const judges = entries.filter(entry => entry.type === 'judge' && entry.data.n >= n && (entry.data.scope === (scope || start?.scope) || entry.data.scope === 'task')).map(entry => entry.data);
  const sealed = entries.filter(entry => entry.type === 'sealed' && entry.data.total !== undefined).at(-1)?.data || null;
  const stop = entries.filter(entry => entry.type === 'stop').at(-1)?.data || null;
  return {
    agent: start && { provider: start.provider, model: start.model, effort: start.effort, rung: start.rung, scope: start.scope },
    decision: end?.decision || null,
    gates: end?.score?.gates || null,
    integrity: end ? { findings: end.findings || [], tainted: end.tainted || [] } : null,
    agentRun: end?.agent ? { costUsd: end.agent.costUsd, tokens: end.agent.tokens } : null,
    judges: [judges.find(item => item.scope !== 'task'), judges.filter(item => item.scope === 'task').at(-1)].filter(Boolean).map(item => ({ scope: item.scope, status: item.status, verdicts: item.verdicts || [] })),
    sealed: sealed && { passed: sealed.passed, total: sealed.total, scope: sealed.scope },
    outcome: stop?.outcome || null
  };
}

/** The human decision in REVIEW.md: the ticked option of its Decision checklist. */
export function reviewDecision(text = '') {
  return String(text).match(/- \[[xX]\] (approve with follow-up|approve|request changes)/)?.[1] || null;
}

/** The task's latest flow runs, gate by gate, and the human approvals recorded on them. */
export async function flowEvidence(taskDir) {
  const { readdir } = await import('node:fs/promises');
  const names = (await readdir(join(taskDir, 'flows')).catch(() => [])).filter(name => name.endsWith('.json')).map(name => name.slice(0, -5));
  const gates = {}, approvals = [];
  for (const name of names) {
    const state = await readFlowState(taskDir, name).catch(() => null);
    for (const result of state?.runs?.at(-1)?.results || []) gates[result.id] = { status: result.status, type: result.type || null, flow: name, ...(result.judge && { judge: result.judge.verdicts?.map(item => ({ provider: item.provider, family: item.family, verdict: item.verdict, confidence: item.confidence })) }) };
    for (const [gate, approval] of Object.entries(state?.approvals || {})) approvals.push({ flow: name, gate, decision: approval.decision, by: approval.by, at: approval.at, auto: Boolean(approval.auto) });
  }
  return { gates, approvals };
}

/** Task-level evidence and decisions: PR, completion, review, seal, flows. */
export async function taskEvidence(taskDir) {
  const [meta, review, sealed, flows] = await Promise.all([taskMeta(taskDir), readText(join(taskDir, 'REVIEW.md')), readSealed(taskDir), flowEvidence(taskDir)]);
  return {
    pullRequest: meta.pullRequest ? { url: meta.pullRequest.url, number: meta.pullRequest.number || null, at: meta.pullRequest.at } : null,
    done: meta.done ? { by: meta.done.by, at: meta.done.at } : null,
    review: reviewDecision(review),
    sealed: sealed ? { status: sealed.status, tests: sealed.tests, sealer: sealed.sealer?.human ? `${sealed.sealer.human} (human)` : sealed.sealer ? `${sealed.sealer.provider} (${sealed.sealer.family})` : null, decision: sealed.decision ? { decision: sealed.decision.decision, by: sealed.decision.by, protect: Boolean(sealed.decision.protect) } : null } : null,
    flows
  };
}

/** The subtask an iteration worked on (from its label or scope), else the subtasks whose Files list `file`. */
async function intentOf(taskDir, file, scopeId) {
  const [graph, prd, spec] = await Promise.all([loadGraph(taskDir), readText(join(taskDir, 'PRD.md')), readText(join(taskDir, 'SPEC.md'))]);
  const all = criteriaOf(prd, spec), lists = item => pathReferences(sectionBody(item.body, 'Files'), { includeNew: true }).includes(file);
  const chosen = scopeId ? graph.items.filter(item => item.id === scopeId) : graph.items.filter(lists);
  const ids = [...new Set(chosen.flatMap(item => [...acIds(item.body), ...scIds(item.body)]))];
  return { subtasks: chosen.map(item => ({ id: item.id, title: item.title, status: item.status })), criteria: ids.map(id => all.find(item => item.id === id) || { id, text: '', source: null }), inferred: !scopeId && chosen.length > 0 };
}

const relativeTo = (cwd, file) => (isAbsolute(file) ? relative(cwd, file) : file).replace(/^\.\//, '').split('\\').join('/');

/** Parses `path:line` (or `path#L12`). */
export function parseLocation(spec = '') {
  const match = String(spec).match(/^(.+?)(?::(\d+)|#L(\d+))$/);
  if (!match) throw new Error('give a location as <file>:<line>, for example src/orders.js:88');
  return { file: match[1], line: Number(match[2] || match[3]) };
}

/**
 * The chain from one line to its criterion, iteration, evidence and decision. Every link is
 * optional: a repository without Maverick history gets blame and whatever contracts apply, plus
 * the list of what is missing.
 */
export async function traceLine(cwd, location) {
  const { file: given, line } = typeof location === 'string' ? parseLocation(location) : location;
  const file = relativeTo(cwd, given), path = join(cwd, file);
  if (!await exists(path)) throw new Error(`no such file: ${file}`);
  // Only files of this project: no absolute path, `..` or symlink may lead outside it.
  const [root, real] = await Promise.all([realpath(cwd), realpath(path)]);
  if (real !== root && !real.startsWith(root + sep)) throw new Error(`${file} is outside the project`);
  const content = await readFile(path, 'utf8'), lines = content.split('\n');
  if (content.endsWith('\n')) lines.pop();
  if (!Number.isInteger(line) || line < 1 || line > lines.length) throw new Error(`${file} has ${lines.length} line(s); line ${line} is out of range`);
  const config = await loadConfig(cwd), missing = [];
  const result = { file, line, text: lines[line - 1], commit: null, task: null, intent: null, built: null, proven: null, decided: null, guards: null, missing };

  const repo = (await git(cwd, ['rev-parse', '--is-inside-work-tree'])).ok, head = repo ? await blame(cwd, file, line) : null;
  if (!repo) missing.push('git history: this is not a git repository');
  // A file the loop created and nobody committed yet has no blame on HEAD, but it does on the loop's checkpoints.
  else result.commit = !head || head.uncommitted ? { uncommitted: true } : { sha: head.commit, author: head.author, at: head.at, summary: head.summary };
  const headTask = head && !head.uncommitted ? parseTrailers((await readCommit(cwd, head.commit))?.message).task : null;

  // Find the loop iteration that wrote the line: blame the current content against each loop's chain.
  const tasks = (await listTasks(cwd, config)).map(item => item.task), order = [...new Set([headTask, ...tasks].filter(slug => slug && tasks.includes(slug)))];
  let found = null, laterEdit = false, blameFailed = false;
  for (const slug of order) {
    const taskDir = taskPath(cwd, config, slug);
    for (const tip of repo ? await loopTips(cwd, taskDir, slug) : []) {
      const hit = await blame(cwd, file, line, { rev: tip.commit });
      // No blame because the file is not in that checkpoint is normal; a failure on a file that is there is git's.
      if (!hit) { blameFailed ||= (await git(cwd, ['cat-file', '-e', `${tip.commit}:./${file}`])).ok; continue; }
      if (hit.uncommitted) { laterEdit = laterEdit || slug === headTask; continue; }
      const trailers = parseTrailers((await readCommit(cwd, hit.commit))?.message);
      if (trailers.loopId === tip.loopId && trailers.iteration > 0) { found = { task: slug, loopId: tip.loopId, iteration: trailers.iteration, label: trailers.label, checkpoint: hit.commit, at: hit.at }; break; }
    }
    if (found) break;
  }

  const slug = found?.task || headTask;
  let taskDir = null;
  if (slug && tasks.includes(slug)) {
    taskDir = taskPath(cwd, config, slug);
    const meta = await taskMeta(taskDir);
    result.task = { slug, idea: meta.idea || slug.replace(/-/g, ' '), via: found ? 'loop checkpoint' : 'commit trailer' };
  } else if (slug) missing.push(`task ${slug}: named by the commit, but not found in ${config.taskRoot}`);
  else {
    // No trailer and no checkpoint: tasks that declared this file are candidates, not proof.
    const candidates = [];
    for (const name of tasks) if ((await intentOf(taskPath(cwd, config, name), file)).subtasks.length) candidates.push(name);
    if (candidates.length) result.candidates = candidates;
    missing.push(candidates.length ? `task: no commit trailer or loop checkpoint links this line; tasks that planned this file: ${candidates.join(', ')}` : 'task: no Maverick task wrote or planned this line');
  }

  if (taskDir) {
    let ledger = [];
    if (found) {
      ledger = await readLedger(loopPaths(taskDir, found.loopId).ledger).catch(() => []);
      const subtaskId = found.label?.match(/^subtask (\d+)$/)?.[1] || null;
      const built = builtFrom(ledger, found.iteration, subtaskId);
      const scope = subtaskId || (built.agent?.scope && built.agent.scope !== 'goal' ? built.agent.scope : null);
      result.intent = await intentOf(taskDir, file, scope);
      result.built = { loopId: found.loopId, iteration: found.iteration, label: found.label, checkpoint: found.checkpoint.slice(0, 12), at: found.at, human: found.label === 'human change', ...built.agent && { agent: built.agent }, decision: built.decision, ...(built.agentRun && { run: built.agentRun }) };
      result.proven = { gates: built.gates, integrity: built.integrity, sealed: built.sealed, loopOutcome: built.outcome };
      result.decided = { judges: built.judges };
      if (!ledger.length) missing.push(`ledger of loop ${found.loopId}: not found (the loop directory was removed)`);
      if (laterEdit) missing.push('the line was edited again after the loop; the iteration shown wrote an earlier version');
    } else {
      result.intent = await intentOf(taskDir, file, null);
      missing.push(`loop iteration: no checkpoint of this task's loops wrote this line (built outside a loop, or the checkpoints were cleaned and garbage-collected)${blameFailed ? '; git could not blame against a checkpoint (git blame --contents with a revision needs git 2.41 or later)' : ''}`);
    }
    const evidence = await taskEvidence(taskDir);
    result.proven = { ...result.proven, flows: evidence.flows.gates, sealedSuite: evidence.sealed };
    result.decided = { ...result.decided, approvals: evidence.flows.approvals, review: evidence.review, pullRequest: evidence.pullRequest, done: evidence.done };
    if (!result.intent.criteria.length) missing.push('criteria: the subtask cites no AC or SC id');
    if (!evidence.review) missing.push('human review: REVIEW.md records no decision');
    if (!result.decided.judges?.length && !Object.values(evidence.flows.gates).some(gate => gate.judge)) missing.push('judge: no independent verdict recorded');
  }

  const contracts = contractsTouching(await listContracts(cwd), [file]);
  const protectedPaths = config.loop?.protectedPaths || LOOP_DEFAULTS.protectedPaths;
  result.guards = { contracts: contracts.map(item => ({ id: item.id, title: item.data.title, task: item.data.task, tests: item.data.tests, role: item.anchored.length ? 'anchor' : 'test' })), protected: protectedPaths.filter(glob => globToRegex(glob).test(file)) };
  return result;
}

/** `why --ac AC-02 <task>`: the reverse walk, from a criterion to its files, tests, verdicts and contracts. */
export async function traceCriterion(cwd, task, id) {
  const config = await loadConfig(cwd), taskDir = taskPath(cwd, config, task);
  if (!await exists(taskDir)) throw new Error(`task not found: ${task}`);
  const wanted = String(id).toUpperCase().replace(/^(AC|SC)-(\d)$/, '$1-0$2');
  const [graph, prd, spec, sealed, flows] = await Promise.all([loadGraph(taskDir), readText(join(taskDir, 'PRD.md')), readText(join(taskDir, 'SPEC.md')), readSealed(taskDir), flowEvidence(taskDir)]);
  const criterion = criteriaOf(prd, spec).find(item => item.id === wanted);
  if (!criterion) throw new Error(`${wanted} is not a criterion of ${task} (PRD.md Acceptance Criteria or SPEC.md Behavior)`);
  const subtasks = graph.items.filter(item => [...acIds(item.body), ...scIds(item.body)].includes(wanted));
  const files = [...new Set(subtasks.flatMap(item => pathReferences(sectionBody(item.body, 'Files'), { includeNew: true })))];
  const iterations = [];
  for (const loopId of await loopIds(taskDir)) {
    const entries = await readLedger(loopPaths(taskDir, loopId).ledger).catch(() => []);
    for (const entry of entries.filter(item => item.type === 'iteration-start' && subtasks.some(subtask => subtask.id === item.data.scope))) {
      const end = iterationOf(entries, entry.data.n, 'iteration-end');
      iterations.push({ loopId, n: entry.data.n, subtask: entry.data.scope, provider: entry.data.provider, model: entry.data.model, decision: end?.decision || null });
    }
  }
  const verdicts = Object.entries(flows.gates).filter(([, gate]) => gate.judge).map(([gate, value]) => ({ gate, status: value.status }));
  const judged = [];
  for (const name of (await (await import('node:fs/promises')).readdir(taskDir).catch(() => [])).filter(item => /^JUDGE-.+\.md$/.test(item))) {
    const row = (await readText(join(taskDir, name))).split('\n').find(item => item.startsWith(`| ${wanted} |`));
    if (row) judged.push({ report: name, row: row.split('|').slice(3, -1).join('|').trim() });
  }
  const committed = sealed?.decision?.decision === 'commit' ? (sealed.decision.tests || []).filter(test => test.ids.includes(wanted)).map(test => ({ id: test.id, file: test.file })) : [];
  const contracts = (await listContracts(cwd)).filter(item => item.data.criteria.includes(wanted) && item.data.task === task).map(item => ({ id: item.id, title: item.data.title, status: item.data.status, tests: item.data.tests }));
  return { task, criterion, subtasks: subtasks.map(item => ({ id: item.id, title: item.title, status: item.status })), files, iterations, judges: { flows: verdicts, criteria: judged }, sealed: { tests: committed, state: sealed ? sealed.status : null }, contracts };
}

const short = text => (text && text.length > 90 ? `${text.slice(0, 87)}…` : text || '');
const pct = value => (typeof value === 'number' ? ` ${value.toFixed(2)}` : '');

/** The terminal rendering: one line per link of the chain, then what is missing. */
export function renderTrace(trace) {
  const rows = [`${trace.file}:${trace.line}   ${short(trace.text.trim())}`];
  const add = (label, text) => { if (text) rows.push(`${label.padEnd(10)}${text}`); };
  const c = trace.commit;
  add('Commit', c ? (c.uncommitted ? 'not committed yet' : `${c.sha.slice(0, 10)} ${c.author || ''} ${c.at ? c.at.slice(0, 10) : ''} · ${short(c.summary)}`) : null);
  if (trace.task) {
    const pr = trace.decided?.pullRequest, done = trace.decided?.done;
    add('Task', `${trace.task.slug}${pr ? `  (PR ${pr.number ? `#${pr.number}` : pr.url}${done ? `, done ${done.at.slice(0, 10)}` : ''})` : done ? `  (done ${done.at.slice(0, 10)})` : ''}`);
  } else if (trace.candidates) add('Task?', `planned by ${trace.candidates.join(', ')} (no commit or checkpoint proves it)`);
  const intent = trace.intent;
  if (intent && (intent.criteria.length || intent.subtasks.length)) add('Intent', `${intent.criteria.map(item => `${item.id}${item.text ? ` ${short(item.text)}` : ''}`).join(' · ') || '—'}${intent.inferred ? ' (from the subtask files)' : ''}`);
  const b = trace.built;
  if (b) add('Built', `${intent?.subtasks[0] ? `subtask ${intent.subtasks[0].id} · ` : ''}loop ${b.loopId} · iteration ${b.iteration}${b.human ? ' · a human change the loop adopted' : b.agent ? ` · ${b.agent.provider}${b.agent.model ? ` ${b.agent.model}` : ''}${b.agent.effort ? ` (${b.agent.effort})` : ''}` : ''}${b.decision ? ` · ${b.decision}` : ''}`);
  const p = trace.proven;
  if (p) {
    const parts = [];
    if (p.gates) { const entries = Object.entries(p.gates); parts.push(entries.every(([, status]) => status === 'pass') ? `checks PASS (${entries.map(([id]) => id).join(', ')})` : `gates ${entries.map(([id, status]) => `${id} ${status.toUpperCase()}`).join(', ')}`); }
    if (p.integrity) parts.push(p.integrity.findings.length ? `integrity ${p.integrity.findings.join(', ')}` : 'integrity clean');
    if (p.sealed) parts.push(`sealed ${p.sealed.passed}/${p.sealed.total}`);
    else if (p.sealedSuite) parts.push(`sealed suite ${p.sealedSuite.status}${p.sealedSuite.sealer ? ` (${p.sealedSuite.sealer})` : ''}`);
    for (const id of ['ablation', 'architecture', 'integrity', 'verify', 'contracts']) if (p.flows?.[id] && !(id === 'integrity' && p.integrity)) parts.push(`${id} ${p.flows[id].status}`);
    add('Proven', parts.join(' · '));
  }
  const d = trace.decided;
  if (d) {
    const parts = [];
    for (const judge of d.judges || []) parts.push(`judge ${judge.verdicts.map(item => `${item.provider} (${item.family})${pct(item.confidence)} ${String(item.verdict || 'no verdict').toUpperCase()}`).join(', ') || judge.status}${judge.scope === 'task' ? ' on the whole change' : ''}`);
    for (const approval of (d.approvals || []).filter(item => !item.auto)) parts.push(`${approval.gate}: ${approval.decision} by ${approval.by}`);
    if (d.review) parts.push(`human review: ${d.review}`);
    add('Decided', parts.join(' · '));
  }
  const g = trace.guards;
  if (g && (g.contracts.length || g.protected.length)) add('Guards', [...g.contracts.map(item => `contract ${item.id} "${short(item.title)}"${item.tests.length ? ` · test ${item.tests.join(', ')}` : ''}`), ...g.protected.map(glob => `protected path ${glob}`)].join(' · '));
  if (trace.missing.length) rows.push('', 'Missing:', ...trace.missing.map(item => `  - ${item}`));
  return rows.join('\n');
}

export function renderCriterion(trace) {
  const rows = [`${trace.criterion.id}  ${trace.criterion.text}  (${trace.task}, ${trace.criterion.source})`];
  rows.push(`Subtasks  ${trace.subtasks.map(item => `${item.id} ${item.title} [${item.status}]`).join(' · ') || 'none cites it'}`);
  rows.push(`Files     ${trace.files.join(', ') || '—'}`);
  if (trace.iterations.length) rows.push(`Built     ${trace.iterations.map(item => `loop ${item.loopId} #${item.n} ${item.provider} ${item.decision || '?'}`).join(' · ')}`);
  if (trace.judges.criteria.length) rows.push(...trace.judges.criteria.map(item => `Judged    ${item.report}: ${short(item.row)}`));
  rows.push(`Sealed    ${trace.sealed.tests.length ? trace.sealed.tests.map(item => `${item.id} ${item.file}`).join(', ') : trace.sealed.state ? `suite ${trace.sealed.state}${trace.sealed.state === 'sealed' ? ' (tests stay hidden until the review)' : ''}` : 'no sealed suite'}`);
  rows.push(`Contracts ${trace.contracts.map(item => `${item.id} [${item.status}]`).join(', ') || 'none'}`);
  return rows.join('\n');
}
