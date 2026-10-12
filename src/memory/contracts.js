import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseFrontmatter, renderFrontmatter } from '../capabilities/model.js';
import { acIds, criteriaOf, declaredScope, pathReferences, scIds } from '../core/quality.js';
import { detectStack } from '../core/stack.js';
import { exists, readText, sectionBody } from '../core/util.js';
import { globToRegex } from '../intel/architecture.js';
import { git } from '../loop/git.js';
import { planRuns, runTestFile, testRunners } from '../proof/runner.js';
import { readSealed } from '../sealed/model.js';
import { loadGraph } from '../subtasks/graph.js';

// Living contracts: what a finished task promised, kept as a guard for the next change. When a
// task is done, the SPEC's invariants and the criteria its committed sealed tests prove become
// `.maverick/contracts/C-NN.md`, anchored to the files that implement them. A later change that
// touches an anchor sees the contract in its prompt and must keep it (its tests still pass) or
// revoke it in its PRD ("Revokes C-03: <why>"). A contract has an owner and a review date, so
// stale ones surface instead of piling up.

export const CONTRACTS_DIR = join('.maverick', 'contracts');
const ID = /^C-\d{2,4}$/;
const REVIEW_DAYS = 180;
const TEST_FILE = /(^|\/)(tests?|__tests__|spec)\/|[._-](test|spec)\.[a-z0-9]+$|_test\.(go|py|exs|dart|rb)$|(^|\/)test_[^/]+\.py$|Test\.(php|java|kt)$/i;
export const isTestPath = path => TEST_FILE.test(path);

const dirOf = cwd => join(cwd, CONTRACTS_DIR);
const today = () => new Date().toISOString().slice(0, 10);
const plusDays = days => new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);

/** Every contract of the project, by id: `{ id, path, data, body }`. */
export async function listContracts(cwd) {
  const dir = dirOf(cwd), contracts = [];
  for (const name of (await readdir(dir).catch(() => [])).filter(name => /^C-\d+\.md$/.test(name)).sort((a, b) => Number(a.slice(2, -3)) - Number(b.slice(2, -3)))) {
    const { data, body } = parseFrontmatter(await readFile(join(dir, name), 'utf8'));
    if (ID.test(data.id || '')) contracts.push({ id: data.id, path: join(CONTRACTS_DIR, name), data: { anchors: [], tests: [], criteria: [], ...data }, body });
  }
  return contracts;
}

export async function readContract(cwd, id) {
  if (!ID.test(id || '')) throw new Error('contract ids look like C-01');
  const found = (await listContracts(cwd)).find(item => item.id === id);
  if (!found) throw new Error(`contract not found: ${id}; list them with maverick contract list`);
  return found;
}

async function writeContract(cwd, data, body) {
  await mkdir(dirOf(cwd), { recursive: true });
  await writeFile(join(dirOf(cwd), `${data.id}.md`), renderFrontmatter(data, body));
}

const matcher = globs => { const patterns = globs.map(glob => globToRegex(glob)); return path => patterns.some(pattern => pattern.test(path)); };

/** Active contracts with an anchor or a test among `files`, with the files that matched. */
export function contractsTouching(contracts, files) {
  return contracts.filter(item => item.data.status === 'active').map(item => {
    const anchor = matcher(item.data.anchors), test = matcher(item.data.tests);
    return { ...item, anchored: files.filter(anchor), guarded: files.filter(test) };
  }).filter(item => item.anchored.length || item.guarded.length);
}

/** Overdue for review: past `reviewBy`. */
export const overdue = (contract, now = today()) => contract.data.status === 'active' && contract.data.reviewBy && contract.data.reviewBy < now;

/** "Revokes C-03: …" (also Revoga/Revoca) in a PRD: the contracts this task means to retire, with the reason. */
export function revocations(prd = '') {
  const found = new Map();
  for (const match of String(prd).matchAll(/\b(?:revokes?|revoga|revoca)\s+(C-\d{2,4})\b:?\s*([^\n]*)/gi)) found.set(match[1].toUpperCase(), match[2].trim());
  return found;
}

/**
 * What a finished task leaves behind: one contract per SPEC invariant (anchored to the task's
 * source files) and one per criterion its committed sealed tests prove (anchored to the files of
 * the subtasks that cite it). Idempotent: a source already harvested from this task is skipped.
 */
export async function harvestContracts({ cwd, task, taskDir, by = process.env.USER || 'human' }) {
  const [prd, spec] = await Promise.all([readText(join(taskDir, 'PRD.md')), readText(join(taskDir, 'SPEC.md'))]);
  const criteria = criteriaOf(prd, spec), graph = await loadGraph(taskDir), scope = await declaredScope(taskDir), sealed = await readSealed(taskDir);
  const existing = await listContracts(cwd), have = new Set(existing.filter(item => item.data.task === task).map(item => item.data.source));
  let next = Math.max(0, ...existing.map(item => Number(item.id.slice(2)))) + 1;
  const sourceFiles = scope.all.filter(path => !isTestPath(path)), created = [];
  const filesFor = id => [...new Set(graph.items.filter(item => [...acIds(item.body), ...scIds(item.body)].includes(id)).flatMap(item => pathReferences(sectionBody(item.body, 'Files'), { includeNew: true })))];
  const add = async ({ source, title, text, ids, anchors, tests, why }) => {
    if (have.has(source) || !anchors.length) return;
    const id = `C-${String(next++).padStart(2, '0')}`;
    const data = { id, title: title.slice(0, 120), task, source, criteria: ids, anchors, tests, owner: by, created: today(), reviewBy: plusDays(REVIEW_DAYS), status: 'active' };
    const body = `# ${id} ${data.title}\n\n## Invariant\n${text}\n\n## Why\n${why}\n\n## Keep or revoke\nA change to an anchored file keeps this contract (its tests still pass) or revokes it in its own PRD: write \`Revokes ${id}: <the reason>\`. \`maverick contract check\` enforces it; \`maverick why <file:line>\` shows it.\n`;
    await writeContract(cwd, data, body);
    have.add(source); created.push({ id, ...data });
  };
  // The SPEC's invariants hold for the whole change, so they guard every source file it declared.
  const invariants = sectionBody(spec, 'Invariants').split('\n').map(line => line.match(/^\s*[-*]\s+(?:\[[ xX]\]\s*)?(.+)$/)?.[1]?.trim()).filter(Boolean);
  for (const [index, text] of invariants.entries()) {
    const ids = [...acIds(text), ...scIds(text)];
    await add({ source: `invariant-${index + 1}`, title: text.replace(/[`*_]/g, ''), text, ids, anchors: sourceFiles, tests: [], why: `An invariant of task \`${task}\` (SPEC.md › Invariants).` });
  }
  // Criteria proven by sealed tests a reviewer committed: those tests are the contract's guard.
  for (const item of criteria) {
    const tests = [...new Set((sealed?.decision?.decision === 'commit' ? sealed.decision.tests || [] : []).filter(test => test.ids.includes(item.id)).map(test => test.file))];
    if (!tests.length) continue;
    const anchors = filesFor(item.id).filter(path => !isTestPath(path));
    await add({ source: item.id, title: item.text || item.id, text: `${item.id}: ${item.text}`, ids: [item.id], anchors: anchors.length ? anchors : sourceFiles, tests, why: `Acceptance criterion ${item.id} of task \`${task}\` (${item.source}), proven by sealed tests written by another model family and committed${sealed.decision.protect ? ' as protected regression tests' : ''} by ${sealed.decision.by}.` });
  }
  return created;
}

/** Applies the revocations a finished task's PRD declared ("Revokes C-03: …"), on the record. */
export async function applyRevocations(cwd, { task, prd, by }) {
  const applied = [], active = new Set((await listContracts(cwd)).filter(item => item.data.status === 'active').map(item => item.id));
  for (const [id, reason] of revocations(prd)) if (active.has(id)) applied.push(await revokeContract(cwd, id, { by, reason: reason || `revoked by task ${task}`, task }));
  return applied;
}

/** Retires a contract, recording who and why. */
export async function revokeContract(cwd, id, { by = process.env.USER || 'human', reason, task } = {}) {
  const contract = await readContract(cwd, id);
  if (contract.data.status !== 'active') throw new Error(`${id} is already ${contract.data.status}`);
  if (!reason) throw new Error('a revocation needs a reason: --reason "<why>"');
  await writeContract(cwd, { ...contract.data, status: 'revoked', revoked: { by, at: today(), reason, ...(task && { task }) } }, contract.body);
  return { id, by, reason };
}

/** Marks a contract reviewed: the owner confirms it still holds, and its next review moves out. */
export async function reviewContract(cwd, id, { by = process.env.USER || 'human' } = {}) {
  const contract = await readContract(cwd, id);
  await writeContract(cwd, { ...contract.data, owner: contract.data.owner || by, reviewed: today(), reviewBy: plusDays(REVIEW_DAYS) }, contract.body);
  return { id, reviewBy: plusDays(REVIEW_DAYS) };
}

/** Paths changed since `against` (deleted and untracked included), outside `.maverick/`; null outside git. */
export async function changedPaths(cwd, against = 'HEAD') {
  if (!(await git(cwd, ['rev-parse', '--is-inside-work-tree'])).ok) return null;
  // A repository without commits compares with the empty tree: everything in it is new.
  if (against === 'HEAD' && !(await git(cwd, ['rev-parse', '--verify', '-q', 'HEAD'])).ok) against = (await git(cwd, ['hash-object', '-t', 'tree', '/dev/null'])).stdout.trim() || '4b825dc642cb6eb9a060e54bf8d69288fbee4904';
  const diff = await git(cwd, ['-c', 'core.quotePath=false', 'diff', '--name-only', '-z', '--relative', against, '--', '.', ':(exclude).maverick']);
  if (!diff.ok) throw new Error(`cannot compare with ${against}: ${diff.stderr.trim().split('\n').at(-1) || 'not a git repository'}`);
  const untracked = await git(cwd, ['ls-files', '--others', '--exclude-standard', '-z', '--', '.', ':(exclude).maverick']);
  return [...new Set([...diff.stdout.split('\0'), ...(untracked.ok ? untracked.stdout.split('\0') : [])].filter(Boolean))].sort();
}

/**
 * The contracts gate. Every active contract the change touches must be kept (its tests exist and
 * pass) or revoked by the task's PRD. Without a task (CI), touching an anchor is drift: reported,
 * and with `strict` a failure. A contract's test that was deleted is always a failure.
 */
export async function checkContracts({ cwd, config, files, prd = null, strict = false, run = true }) {
  const contracts = await listContracts(cwd), touched = contractsTouching(contracts, files), revoking = revocations(prd || '');
  const findings = [], results = [];
  const stack = run && touched.some(item => item.data.tests.length) ? await detectStack(cwd) : null;
  const runners = stack ? await testRunners(cwd, config, stack) : [];
  for (const contract of touched) {
    const id = contract.id;
    if (revoking.has(id)) { results.push({ id, status: 'revoked-by-task', reason: revoking.get(id) }); continue; }
    const missing = [];
    for (const test of contract.data.tests) if (!await exists(join(cwd, test))) missing.push(test);
    if (missing.length) { findings.push({ severity: 'block', id, kind: 'contract-test-deleted', message: `${id} "${contract.data.title}": its test ${missing.join(', ')} is gone; restore it or revoke the contract in the PRD (Revokes ${id}: <why>)` }); results.push({ id, status: 'broken' }); continue; }
    const outcome = { id, status: 'kept', anchored: contract.anchored, tests: [] };
    if (run && contract.data.tests.length) {
      const { plan, unmatched } = planRuns(runners, contract.data.tests);
      for (const { path, runner } of plan) { const result = await runTestFile({ dir: cwd, path, runner }); outcome.tests.push({ path, ok: result.ok }); }
      for (const path of unmatched) outcome.tests.push({ path, ok: null });
      const failed = outcome.tests.filter(item => item.ok === false).map(item => item.path);
      if (failed.length) { outcome.status = 'broken'; findings.push({ severity: 'block', id, kind: 'contract-broken', message: `${id} "${contract.data.title}": ${failed.join(', ')} fails; keep the contract, or revoke it in the PRD (Revokes ${id}: <why>)` }); }
      else if (outcome.tests.some(item => item.ok === null)) findings.push({ severity: 'warn', id, kind: 'contract-unmeasured', message: `${id}: no test runner matches ${outcome.tests.filter(item => item.ok === null).map(item => item.path).join(', ')}; declare one in verification.runners` });
    } else if (!contract.data.tests.length) findings.push(prd === null
      ? { severity: strict ? 'block' : 'warn', id, kind: 'contract-drift', message: `${id} "${contract.data.title}": ${contract.anchored.join(', ')} changed outside a Maverick task; the contract has no test, so a human confirms it still holds` }
      : { severity: 'warn', id, kind: 'contract-unguarded', message: `${id} "${contract.data.title}": no test guards it; the reviewer confirms it still holds` });
    if (prd === null && contract.data.tests.length && outcome.status === 'kept') findings.push({ severity: 'warn', id, kind: 'contract-drift', message: `${id} "${contract.data.title}": ${contract.anchored.join(', ') || contract.guarded.join(', ')} changed outside a Maverick task; its tests still pass` });
    results.push(outcome);
  }
  for (const id of revoking.keys()) if (!contracts.some(item => item.id === id && item.data.status === 'active')) findings.push({ severity: 'warn', id, kind: 'contract-unknown', message: `the PRD revokes ${id}, but no active contract has that id` });
  const due = contracts.filter(item => overdue(item));
  return { ok: !findings.some(item => item.severity === 'block'), files: files.length, touched: results, findings, overdue: due.map(item => ({ id: item.id, title: item.data.title, owner: item.data.owner, reviewBy: item.data.reviewBy })), active: contracts.filter(item => item.data.status === 'active').length };
}

/** The prompt section for an agent about to edit `files`: the contracts anchored there, as constraints. */
export function contractSection(touched) {
  if (!touched.length) return null;
  return { title: 'Contracts in these files', body: `Earlier tasks left these contracts on files you may edit. Keep each one: its behavior must still hold and its tests must still pass. If the task really requires breaking one, stop and report it in "disputes"; only a human revokes a contract.\n\n${touched.slice(0, 12).map(item => `- ${item.id} ${item.data.title} (from \`${item.data.task}\`; files: ${item.anchored.slice(0, 4).map(path => `\`${path}\``).join(', ') || '—'}${item.data.tests.length ? `; tests: ${item.data.tests.slice(0, 3).map(path => `\`${path}\``).join(', ')}` : ''})`).join('\n')}` };
}
