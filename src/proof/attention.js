import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { acIds, criteriaOf, pathReferences, scIds } from '../core/quality.js';
import { readText, sectionBody } from '../core/util.js';
import { readState as readFlowState } from '../flows/engine.js';
import { buildGraph, impactOf } from '../intel/graph.js';
import { churn } from '../intel/hotspots.js';
import { git } from '../loop/git.js';
import { loopIds, loopPaths } from '../loop/model.js';
import { isTestPath } from '../memory/contracts.js';
import { readSealed } from '../sealed/model.js';
import { sealReport } from '../sealed/seal.js';
import { loadGraph } from '../subtasks/graph.js';

// The review budget. The reviewer is the bottleneck, and a complete PR draft does not say where
// to look. Each hunk of the diff gets a risk score from evidence Maverick already has: how far
// the file reaches (blast radius), how often it changes (hotspot), whether the loop's integrity
// audit warned about it, whether the judge was unsure or rejected a criterion it serves, whether
// the sealed tests caught a criterion the visible checks claimed (the escape set), and whether a
// test near it changed at all. The output is a short list, a time range (never a promise) and a
// proof tree per criterion: criterion → files → tests → evidence → verdict.

export const WEIGHTS = { blast: 1, hotspot: 0.5, integrity: 1.5, judge: 1, escape: 1.5, untested: 1 };
// Changed lines a reviewer reads per minute, fast and careful; weighted lines count risky ones more.
const PACE = { fast: 40, careful: 15 };

/** A file name from a `---`/`+++` line: git ends names with spaces with a tab and C-quotes unusual ones. */
export function diffName(raw, prefix) {
  let name = raw.replace(/\t$/, '');
  if (name.startsWith('"') && name.endsWith('"')) {
    const escapes = { n: '\n', t: '\t', '"': '"', '\\': '\\', a: '\x07', b: '\b', f: '\f', r: '\r', v: '\v' };
    const bytes = [];
    for (let index = 1; index < name.length - 1; index++) {
      const char = name[index];
      if (char !== '\\') { bytes.push(...Buffer.from(char)); continue; }
      const next = name[++index];
      if (/[0-7]/.test(next)) { bytes.push(parseInt(name.slice(index, index + 3), 8)); index += 2; } else bytes.push(...Buffer.from(escapes[next] ?? next));
    }
    name = Buffer.from(bytes).toString('utf8');
  }
  return name.startsWith(prefix) ? name.slice(prefix.length) : name;
}

/** Hunks of `git diff -U0`: `{ file, start, lines, added, deleted }` (start and lines in the new file). */
export function parseHunks(patch) {
  const hunks = [];
  let before = null, file = null, removed = false, current = null;
  for (const line of String(patch).split('\n')) {
    if (line.startsWith('diff --git ')) { before = null; file = null; removed = false; current = null; continue; }
    if (!current && line.startsWith('--- ')) { before = line === '--- /dev/null' ? null : diffName(line.slice(4), 'a/'); continue; }
    if (!current && line.startsWith('+++ ')) { removed = line === '+++ /dev/null'; file = removed ? before : diffName(line.slice(4), 'b/'); continue; }
    const head = line.match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/);
    if (head) { current = { file, start: Number(head[3]), lines: Number(head[4] ?? 1), added: 0, deleted: 0, ...(removed && { removed: true }) }; hunks.push(current); continue; }
    if (!current) continue;
    if (line.startsWith('+')) current.added += 1;
    else if (line.startsWith('-')) current.deleted += 1;
  }
  return hunks.filter(item => item.file);
}

/** The hunks of the change since `against`, untracked files as one hunk each. */
async function changeHunks(cwd, against) {
  if (!(await git(cwd, ['rev-parse', '--is-inside-work-tree'])).ok) return [];
  const diff = await git(cwd, ['-c', 'core.quotePath=false', 'diff', '-U0', '--no-color', '--no-ext-diff', '--src-prefix=a/', '--dst-prefix=b/', '--relative', against, '--', '.', ':(exclude).maverick']);
  if (!diff.ok) throw new Error(`cannot compare with ${against}: ${diff.stderr.trim().split('\n').at(-1) || 'not a git repository'}`);
  const hunks = parseHunks(diff.stdout);
  const untracked = await git(cwd, ['ls-files', '--others', '--exclude-standard', '-z', '--', '.', ':(exclude).maverick']);
  for (const file of untracked.ok ? untracked.stdout.split('\0').filter(Boolean) : []) {
    const lines = (await readFile(join(cwd, file), 'utf8').catch(() => '')).split('\n').length;
    hunks.push({ file, start: 1, lines, added: lines, deleted: 0, created: true });
  }
  return hunks.filter(item => item.file);
}

/**
 * What a review compares with when none is given: the commit the task's newest loop started from,
 * else where the branch left the base branch (pr.base, main or master), else HEAD. Comparing with
 * HEAD alone shows nothing once the work is committed on a feature branch.
 */
export async function reviewBase(cwd, taskDir, config = {}) {
  const ok = async ref => (ref && (await git(cwd, ['rev-parse', '--verify', '-q', `${ref}^{commit}`])).ok ? ref : null);
  const [id] = await loopIds(taskDir);
  const start = id ? (await readFile(loopPaths(taskDir, id).ledger, 'utf8').catch(() => '')).split('\n')[0] : '';
  const loopBase = start ? JSON.parse(start).data?.baseHead : null;
  if (await ok(loopBase)) return loopBase;
  for (const name of [config.pr?.base, 'main', 'master'].filter(Boolean)) {
    if (!await ok(name)) continue;
    const base = await git(cwd, ['merge-base', 'HEAD', name]), head = await git(cwd, ['rev-parse', 'HEAD']);
    if (base.ok && head.ok && base.stdout.trim() !== head.stdout.trim()) return base.stdout.trim();
  }
  return 'HEAD';
}

/** The newest loop's state, for its integrity warnings and judge verdicts. */
async function latestLoop(taskDir) {
  const [id] = await loopIds(taskDir);
  return id ? JSON.parse(await readFile(loopPaths(taskDir, id).state, 'utf8').catch(() => 'null')) : null;
}

/** Judge evidence per criterion from the task's flows (newest run of each), plus the lowest confidence seen. */
async function judgeEvidence(taskDir, loop) {
  const names = (await readdir(join(taskDir, 'flows')).catch(() => [])).filter(name => name.endsWith('.json')).map(name => name.slice(0, -5));
  const criteria = new Map(), confidences = [];
  for (const name of names) {
    const state = await readFlowState(taskDir, name).catch(() => null);
    for (const result of state?.runs?.at(-1)?.results || []) for (const verdict of result.judge?.verdicts || []) {
      if (typeof verdict.confidence === 'number') confidences.push(verdict.confidence);
      for (const item of verdict.criteria || []) criteria.set(item.id, [...(criteria.get(item.id) || []), { met: item.met, by: `${verdict.provider} (${verdict.family})`, evidence: item.evidence || '' }]);
    }
  }
  const last = loop?.iterations?.filter(item => item.judge).at(-1)?.judge;
  for (const verdict of last?.verdicts || []) if (typeof verdict.confidence === 'number') confidences.push(verdict.confidence);
  for (const item of last?.criteria || []) for (const entry of item.criteria || []) criteria.set(entry.id, [...(criteria.get(entry.id) || []), { met: entry.met, by: item.family, evidence: '' }]);
  return { criteria, confidence: confidences.length ? Math.min(...confidences) : null, status: last?.status || null };
}

/** The criteria the sealed tests say were promised and not delivered, once a reviewer has opened the seal. */
async function sealedEscape({ cwd, task, taskDir, config }) {
  const sealed = await readSealed(taskDir);
  // While sealed, the escape set stays in the vault: this report lands in the task, where a builder could read it.
  if (!sealed || sealed.status !== 'committed') return { state: sealed?.status || null, escape: [] };
  const report = await sealReport({ cwd, task, taskDir, config, reveal: true }).catch(() => null);
  return { state: sealed.status, escape: report?.last?.metrics?.escape || [] };
}

const round = value => Math.round(value * 100) / 100;

/**
 * The review budget of a change: hunks ranked by risk, the few that deserve most of the time, a
 * time range, and a proof tree per criterion.
 */
export async function reviewBudget({ cwd, task, taskDir, config, against = 'HEAD' }) {
  const hunks = await changeHunks(cwd, against);
  const changed = [...new Set(hunks.map(item => item.file))], tests = changed.filter(isTestPath);
  const [graph, counts, loop, plan, prd, spec, escape] = await Promise.all([
    changed.length ? buildGraph(cwd) : null, churn(cwd).catch(() => new Map()), latestLoop(taskDir), loadGraph(taskDir),
    readText(join(taskDir, 'PRD.md')), readText(join(taskDir, 'SPEC.md')), sealedEscape({ cwd, task, taskDir, config })
  ]);
  const judge = await judgeEvidence(taskDir, loop);
  const criteria = criteriaOf(prd, spec);
  // Which criteria each file serves: the subtasks that list it and the criteria they cite.
  const serves = new Map();
  for (const item of plan.items) {
    const ids = [...acIds(item.body), ...scIds(item.body)];
    for (const file of pathReferences(sectionBody(item.body, 'Files'), { includeNew: true })) serves.set(file, [...new Set([...(serves.get(file) || []), ...ids])]);
  }
  const unmet = new Set([...judge.criteria].filter(([, list]) => list.some(item => item.met === false)).map(([id]) => id));
  const warned = new Map();
  for (const iteration of loop?.iterations || []) if (iteration.decision === 'accepted') for (const finding of iteration.findings || []) if (finding.file) warned.set(finding.file, [...new Set([...(warned.get(finding.file) || []), finding.kind])]);
  // Churn is keyed by repository path; the diff is relative to the project, which may be a subdirectory.
  const prefix = (await git(cwd, ['rev-parse', '--show-prefix'])).stdout?.trim() || '';
  const churnOf = file => counts.get(`${prefix}${file}`) || 0;
  const maxChurn = Math.max(3, ...counts.values());

  const scored = hunks.map(hunk => {
    const file = hunk.file, ids = serves.get(file) || [], signals = {}, why = [], brief = [];
    const impact = graph ? impactOf(graph, file) : null;
    if (impact?.known && impact.dependents.length) { signals.blast = Math.min(1, Math.log2(1 + impact.dependents.length) / 6); why.push(`${impact.dependents.length} dependent file(s)`); }
    const commits = churnOf(file);
    if (commits >= 3) { signals.hotspot = round(commits / maxChurn); why.push(`hotspot: ${commits} commits in 6 months`); }
    // The detection's kind is for humans; what a builder could read says only that there was one.
    if (warned.has(file)) { signals.integrity = 1; why.push(`integrity warned: ${warned.get(file).join(', ')}`); brief.push('an integrity warning'); }
    const rejected = ids.filter(id => unmet.has(id));
    if (rejected.length) { signals.judge = 1; why.push(`the judge rejected ${rejected.join(', ')}`); }
    else if (ids.length && judge.confidence !== null && judge.confidence < 0.8) { signals.judge = round(1 - judge.confidence); why.push(`the judge was unsure (${Math.round(judge.confidence * 100)}%)`); }
    const escaped = ids.filter(id => escape.escape.includes(id));
    if (escaped.length) { signals.escape = 1; why.push(`sealed tests caught ${escaped.join(', ')} that the visible checks passed`); }
    // Only code the import graph knows can be reached by a test; docs and configuration are not "untested".
    if (impact?.known && !isTestPath(file) && !hunk.removed) {
      const near = impact?.known ? impact.dependents.filter(item => item.test && item.depth <= 2).map(item => item.id) : [];
      if (!near.some(item => tests.includes(item))) { signals.untested = near.length ? 0.5 : 1; why.push(near.length ? 'no nearby test changed' : 'no test reaches this file'); }
    }
    const lines = hunk.added + hunk.deleted, risk = round(Object.entries(signals).reduce((sum, [key, value]) => sum + WEIGHTS[key] * value, 0));
    return { file, start: hunk.start, end: hunk.start + Math.max(0, hunk.lines - 1), lines, added: hunk.added, deleted: hunk.deleted, ...(hunk.created && { created: true }), ...(hunk.removed && { removed: true }), criteria: ids, signals, risk, weighted: round(lines * (1 + risk)), why, brief: [...why.filter(reason => !reason.startsWith('integrity warned')), ...brief] };
  }).sort((a, b) => b.risk * Math.log2(2 + b.lines) - a.risk * Math.log2(2 + a.lines) || b.lines - a.lines);

  const weighted = scored.reduce((sum, item) => sum + item.weighted, 0);
  const total = scored.reduce((sum, item) => sum + item.risk * Math.log2(2 + item.lines), 0);
  // Focus: the riskiest hunks until they hold most of the risk, at most five.
  const focus = [];
  let covered = 0;
  for (const item of scored) { if (!item.risk || focus.length >= 5 || (focus.length && covered >= total * 0.7)) break; focus.push(item); covered += item.risk * Math.log2(2 + item.lines); }
  const minutes = { low: Math.max(1, Math.round(weighted / PACE.fast)), high: Math.max(1, Math.round(weighted / PACE.careful)) };

  const tree = criteria.map(item => {
    const files = changed.filter(file => (serves.get(file) || []).includes(item.id) && !isTestPath(file));
    const proving = tests.filter(file => (serves.get(file) || []).includes(item.id));
    const verdicts = judge.criteria.get(item.id) || [];
    const verdict = escape.escape.includes(item.id) ? 'escaped' : verdicts.some(entry => entry.met === false) ? 'rejected' : verdicts.length && verdicts.every(entry => entry.met) ? 'met' : 'unjudged';
    return { id: item.id, text: item.text, files, tests: proving, judges: verdicts.map(entry => ({ by: entry.by, met: entry.met, evidence: entry.evidence.slice(0, 160) })), verdict };
  });
  return { against, files: changed.length, hunks: scored.length, lines: scored.reduce((sum, item) => sum + item.lines, 0), minutes, focus, hunksRanked: scored, tree, judge: { confidence: judge.confidence, status: judge.status }, sealed: escape.state, weights: WEIGHTS };
}

const range = minutes => (minutes.low === minutes.high ? `~${minutes.low} min` : `~${minutes.low}–${minutes.high} min`);

/** One line for PR-DRAFT and the terminal. */
export const budgetLine = budget => (budget.hunks ? `This change needs ${range(budget.minutes)} of review${budget.focus.length ? `; start with ${budget.focus.length === 1 ? 'this hunk' : `these ${budget.focus.length} hunks`}` : ''}.` : 'Nothing changed.');

/**
 * REVIEW-BUDGET.md. Without `detailed` it is the copy that lives in the task, where a builder may
 * read it on a later loop: detection kinds and the judges' evidence stay in the detailed copy.
 */
export function renderBudgetReport(task, budget, { detailed = true, detailPath = null } = {}) {
  const reasons = item => (detailed ? item.why : item.brief);
  const hunk = item => `- \`${item.file}:${item.start}${item.end > item.start ? `-${item.end}` : ''}\`${item.created ? ' (new file)' : item.removed ? ' (deleted)' : ''} · +${item.added}/−${item.deleted} · risk ${item.risk}${item.criteria.length ? ` · ${item.criteria.join(', ')}` : ''}\n  ${reasons(item).join('; ') || 'no risk signal'}`;
  const node = item => `- **${item.id}** ${item.text} → ${item.verdict.toUpperCase()}\n  - files: ${item.files.map(file => `\`${file}\``).join(', ') || '—'}\n  - tests: ${item.tests.map(file => `\`${file}\``).join(', ') || '—'}${item.judges.length ? `\n  - judges: ${item.judges.map(entry => `${entry.by} ${entry.met ? '✓' : '✗'}${detailed && entry.evidence ? ` ${entry.evidence}` : ''}`).join('; ')}` : ''}`;
  return `# Review Budget — ${task}

Compared with \`${budget.against}\` · ${budget.files} file(s), ${budget.hunks} hunk(s), ${budget.lines} changed line(s).

**${budgetLine(budget)}** The time is a range from changed lines weighted by risk, not a promise.${!detailed && detailPath ? `\n\nDetection kinds and the judges' evidence are in the detailed copy, outside the work tree: \`${detailPath}\`.` : ''}

## Where to look first
${budget.focus.map(hunk).join('\n') || '- No hunk carries a risk signal; read the diff in order.'}

## Proof tree by criterion
${budget.tree.map(node).join('\n') || '- The task has no acceptance criteria with ids.'}

## Every hunk, by risk
${budget.hunksRanked.slice(0, 40).map(hunk).join('\n') || '- none'}${budget.hunksRanked.length > 40 ? `\n- … ${budget.hunksRanked.length - 40} more` : ''}

## How the score works
Each hunk's risk is the weighted sum of its signals (each 0–1): ${Object.entries(budget.weights).map(([key, value]) => `${key} ×${value}`).join(', ')}. The sealed escape set is used only after a reviewer opened the seal${budget.sealed === 'sealed' ? ' (this task\'s seal is still closed)' : ''}.
`;
}
