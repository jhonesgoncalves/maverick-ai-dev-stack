import { mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { createHmac } from 'node:crypto';
import { open as openFile } from 'node:fs/promises';
import { overlaps } from '../core/home.js';
import { lacksGitBaseline } from '../core/project-tools.js';
import { acIds, scIds } from '../core/quality.js';
import { exists, pretty } from '../core/util.js';
import { git, inPlace, repoInfo, resolveRef, treeOf } from '../loop/git.js';
import { canonical, openLedger, readLedger, verifyChain } from '../loop/ledger.js';
import { testRunners } from '../proof/runner.js';
import { authorSuite, buildersOf, familiesOf, sealerPrompt } from './author.js';
import { aad, checkBundle, newSealId, readSealed, SEAL_SCHEMA, sealedSettings, sealPaths, sealReadiness, sourceHashes, SURFACES, suiteDigest, taskCriteria, writeSealed, SEALED_SCHEMA } from './model.js';
import { holdoutMetrics, runSuite } from './run.js';
import { readVaultJson, vaultKey, vaultRoot, writeVaultFile } from './vault.js';
import { lintSurface } from './surface.js';
import { createResolver } from '../intel/graph.js';

// The life of a seal: `seal` writes it (an independent agent, or a human with --from-file),
// checks every test fails on the code as it is, encrypts it and writes SEALED.json; `seal
// approve` records the human's approval; loops and the `sealed` gate query it; `unseal`
// opens it at review time, to commit the tests as protected regression tests or discard them.

/** The working tree as a tree object, through a private index; the user's index is never touched. */
async function snapshot(cwd) {
  const scratch = await mkdtemp(join(tmpdir(), 'maverick-seal-index-'));
  try { return await inPlace({ cwd, task: 'seal', indexFile: join(scratch, 'index'), inflight: scratch }).snapshot(); } finally { await rm(scratch, { recursive: true, force: true }); }
}

async function listFiles(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...await listFiles(path)); else if (entry.isFile()) out.push(path);
  }
  return out;
}

/**
 * A suite a human wrote: a bundle JSON, or a directory (or one file) whose paths, relative to
 * it, are where the tests go in the project. Each file is one sealed test, held to the AC and
 * SC ids its content names.
 */
export async function readHumanSuite(source) {
  const path = resolve(source);
  if (path.endsWith('.json')) return JSON.parse(await readFile(path, 'utf8'));
  const info = await stat(path);
  const files = info.isDirectory() ? (await listFiles(path)).sort() : [path];
  const root = info.isDirectory() ? path : dirname(path);
  const bundle = { files: [], tests: [] };
  for (const file of files) {
    const content = await readFile(file, 'utf8'), rel = relative(root, file).split(sep).join('/');
    bundle.files.push({ path: rel, role: 'test', content });
    bundle.tests.push({ id: `ST-${String(bundle.tests.length + 1).padStart(2, '0')}`, file: bundle.files.length - 1, name: rel, match: 'file', ids: [...acIds(content), ...scIds(content)], kind: /\bregression\b/i.test(content.split('\n')[0]) ? 'regression' : 'behavior' });
  }
  return bundle;
}

const runningLoop = async taskDir => { const { lockHolder } = await import('../loop/engine.js'); return lockHolder(taskDir); };

/** A digest of results that only the vault key can produce: the loop's ledger (in the work tree) never lets a builder recover them. */
const resultMac = (key, tests) => createHmac('sha256', key).update(canonical(tests)).digest('hex');

/**
 * The code a suite is checked against: `--base <ref>`, else the tree the newest loop started
 * from (so sealing again after a loop does not measure the built change), else the working tree.
 */
async function sealBase(cwd, taskDir, options) {
  if (typeof options.base === 'string') { const commit = await resolveRef(cwd, options.base); if (!commit) throw new Error(`unknown revision: ${options.base}`); return { tree: await treeOf(cwd, commit), from: options.base }; }
  const { newestTaskLoop } = await import('../loop/model.js'), { readState } = await import('../loop/engine.js'), id = await newestTaskLoop(taskDir);
  const state = id ? await readState(taskDir, id).catch(() => null) : null;
  if (state?.baseTree) return { tree: state.baseTree, from: `the start of loop ${id}` };
  return { tree: await snapshot(cwd), from: 'the working tree' };
}

/** One query of a seal at a time: a flow gate and a loop never write the same result or fork its ledger. */
async function withSealLock(dir, fn) {
  await mkdir(dir, { recursive: true, mode: 0o700 });
  const path = join(dir, 'query.lock');
  let handle;
  try { handle = await openFile(path, 'wx'); } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    const holder = Number((await readFile(path, 'utf8').catch(() => '')).trim());
    let alive = false;
    try { if (holder) { process.kill(holder, 0); alive = true; } } catch (kill) { alive = kill.code === 'EPERM'; }
    if (alive) throw new Error(`the sealed suite is already running (pid ${holder}); try again when it finishes`);
    await rm(path, { force: true });
    handle = await openFile(path, 'wx');
  }
  try { await handle.write(String(process.pid)); await handle.close(); return await fn(); } finally { await rm(path, { force: true }); }
}

/** What `seal --dry-run` shows: the sealer it would pick, the surface, the criteria and the prompt. */
export async function planSeal({ cwd, task, taskDir, config, stack, options = {} }) {
  const settings = { ...sealedSettings(config), ...(typeof options.surface === 'string' && { surface: options.surface }) };
  const criteria = await taskCriteria(taskDir), runners = await testRunners(cwd, config, stack), builders = buildersOf(config);
  const { selectJudge } = await import('../flows/judge.js');
  const selected = options.fromFile ? null : selectJudge({ config, cwd, makers: builders, gate: { provider: settings.sealer.provider, model: settings.sealer.model, effort: settings.sealer.effort }, stage: 'seal' });
  return { task, surface: settings.surface, criteria, runners: runners.map(item => ({ name: item.name, match: item.match, source: item.source })), builders: familiesOf(builders, config), sealer: selected ? (selected.reason ? { problem: selected.reason } : { provider: selected.plan.provider.id, model: selected.plan.model || null, family: selected.family }) : { human: true }, prompt: options.fromFile ? null : await sealerPrompt({ cwd, taskDir, task, criteria, surface: settings.surface, runners }) };
}

/**
 * Seals a task's acceptance tests. Refuses what it cannot keep sealed or cannot run: no
 * criteria, a vault inside the project, a path that already exists, tests no runner matches.
 */
export async function createSeal({ cwd, task, taskDir, config, stack, options = {}, by = process.env.USER || 'human', signal }) {
  const started = Date.now();
  const settings = { ...sealedSettings(config), ...(typeof options.surface === 'string' && { surface: options.surface }) };
  if (!SURFACES.includes(settings.surface)) throw new Error(`--surface must be one of ${SURFACES.join(', ')}`);
  const info = await repoInfo(cwd);
  if (!info.repo || !info.head || await lacksGitBaseline(cwd)) throw new Error('sealing needs a git repository with the project committed: the sealed tests are checked against its code');
  if (overlaps(vaultRoot(cwd, task), cwd)) throw new Error(`the vault (${vaultRoot(cwd, task)}) and the project overlap; set MAVERICK_HOME outside the project`);
  if (await runningLoop(taskDir)) throw new Error('a loop is running for this task; seal before the loop starts, or stop it first');
  const criteria = await taskCriteria(taskDir);
  if (!criteria.length) throw new Error('PRD.md has no acceptance criteria with ids (AC-01) and SPEC.md no scenarios (SC-01): there is nothing to seal yet');
  const runners = await testRunners(cwd, config, stack), { tree: base, from } = await sealBase(cwd, taskDir, options), warnings = [];
  if (options.fromFile && overlaps(resolve(options.fromFile), cwd)) throw new Error(`${options.fromFile} is inside the project, where a builder can read it; keep the suite outside the project and pass that path`);
  const authored = options.fromFile ? { raw: await readHumanSuite(options.fromFile), sealer: { human: by }, builders: buildersOf(config), transcript: null } : await authorSuite({ cwd, taskDir, task, config, base, criteria, settings, runners, signal });
  if (!authored.raw) throw new Error(`the sealer ${authored.sealer.provider} returned no valid maverick-sealed block${authored.problems?.length ? ` (${authored.problems.join('; ')})` : ''}; run maverick seal again, or write the suite yourself and pass --from-file`);
  const { bundle, problems } = checkBundle(authored.raw, criteria);
  if (problems?.length) throw new Error(`the sealed suite is not valid: ${problems.slice(0, 5).join('; ')}`);
  const [spec, techspec] = await Promise.all(['SPEC.md', 'TECHSPEC.md'].map(name => readFile(join(taskDir, name), 'utf8').catch(() => '')));
  const tracked = (await git(cwd, ['ls-files', '-z', '--', '.', ':(exclude).maverick'])).stdout.split('\0').filter(Boolean);
  const resolveImport = await createResolver(cwd, [...tracked, ...bundle.files.map(file => file.path)], new Map(bundle.files.map(file => [file.path, file.content])));
  const surfaceLint = lintSurface(bundle, { surface: settings.surface, spec, techspec, resolveImport });
  if (!surfaceLint.ok) throw new Error(`sealed surface lint failed: ${surfaceLint.findings.filter(item => item.severity === 'block').map(item => item.message).join('; ')}`);
  warnings.push(...surfaceLint.findings.map(item => `${item.file}: ${item.message}`));
  for (const file of bundle.files) {
    if ((await git(cwd, ['cat-file', '-e', `${base}:./${file.path}`])).ok) throw new Error(`${file.path} already exists in the project; sealed tests go to new paths`);
    if ((await git(cwd, ['log', '--all', '--format=%h', '-1', '--', file.path])).stdout.trim()) warnings.push(`${file.path} appears in the git history, so a builder could read it there`);
  }
  // Vacuity on the base: a sealed test that already passes cannot tell a built change from none.
  const check = await runSuite({ cwd, tree: base, bundle, runners, timeoutMs: settings.timeoutMinutes * 60000, signal });
  if (check.unmatched.length === bundle.files.filter(file => file.role === 'test').length) throw new Error(`no runner matches the sealed tests (${check.unmatched.slice(0, 3).join(', ')}); declare verification.runners in .maverick/config.json`);
  if (check.unmatched.length) warnings.push(`no runner matches ${check.unmatched.join(', ')}; their tests are not measured`);
  const status = new Map(check.tests.map(item => [item.id, item.status]));
  const discriminating = bundle.tests.filter(test => status.get(test.id) === 'fail').map(test => test.id);
  const vacuous = bundle.tests.filter(test => status.get(test.id) === 'pass' && test.kind !== 'regression').map(test => test.id);
  if (!discriminating.length && !bundle.tests.some(test => test.kind === 'regression' && status.get(test.id) === 'pass')) throw new Error(`no sealed test fails on ${from}, so none can tell a built change from none; check --base, or the tests`);
  const sealId = newSealId(), paths = sealPaths(cwd, task, sealId), key = await vaultKey(settings, cwd), digest = suiteDigest(bundle);
  await mkdir(paths.dir, { recursive: true, mode: 0o700 });
  await writeVaultFile(paths.suite, key, JSON.stringify(bundle), aad(sealId, 'suite'));
  await writeVaultFile(paths.base, key, JSON.stringify({ tree: base, tests: check.tests, files: check.files }), aad(sealId, 'base'));
  if (authored.transcript?.length) await writeVaultFile(join(paths.transcripts, 'sealer.jsonl.enc'), key, authored.transcript, aad(sealId, 'transcript'));
  const builders = familiesOf(authored.builders, config);
  const ledger = await openLedger(paths.ledger, sealId, { schema: SEAL_SCHEMA });
  await ledger.append('seal-create', { task, suiteDigest: digest, sealer: authored.sealer, builders, base, surface: settings.surface, tests: bundle.tests.length, files: bundle.files.length });
  await ledger.append('seal-check', { base, from, resultDigest: resultMac(key, check.tests), discriminating: discriminating.length, vacuous: vacuous.length, unmeasured: check.tests.filter(item => item.status === 'unmeasured').length, flaky: check.tests.filter(item => item.status === 'flaky').length });
  const previous = await readSealed(taskDir);
  if (previous?.sealId && previous.status === 'sealed') await appendSealLedger(cwd, task, previous.sealId, 'seal-superseded', { by: sealId });
  const perCriterion = Object.fromEntries(criteria.map(item => [item.id, bundle.tests.filter(test => test.ids.includes(item.id)).length]));
  const sealed = {
    schema: SEALED_SCHEMA, sealId, task, status: 'sealed', createdAt: new Date().toISOString(), suiteDigest: digest,
    sealer: authored.sealer, builders, base, surface: settings.surface, sources: await sourceHashes(taskDir),
    tests: bundle.tests.length, discriminating: discriminating.length, vacuous: vacuous.length, criteria: perCriterion,
    authoring: { costUsd: authored.costUsd ?? (options.fromFile ? 0 : null), tokens: authored.tokens ?? null, durationMs: Date.now() - started },
    uncovered: criteria.filter(item => !perCriterion[item.id]).map(item => item.id), surfaceLint: { ok: surfaceLint.ok, warnings: surfaceLint.findings.length }, approval: null, ledgerHead: ledger.head
  };
  await writeSealed(taskDir, sealed);
  if (options.fromFile) warnings.push(`the plaintext suite is still at ${resolve(options.fromFile)}; delete it or move it out of any agent's reach`);
  return { sealed, warnings, costUsd: authored.costUsd ?? null, tokens: authored.tokens ?? null };
}

/** Appends to a seal's own ledger (the vault's record of everything done with it). */
export async function appendSealLedger(cwd, task, sealId, type, data) {
  const ledger = await openLedger(sealPaths(cwd, task, sealId).ledger, sealId, { schema: SEAL_SCHEMA });
  return ledger.append(type, data);
}

/** A human approves the sealed suite: required (by default) before it decides a loop. */
export async function approveSeal({ cwd, task, taskDir, config, by = process.env.USER || 'human' }) {
  const readiness = await sealReadiness(taskDir, { ...sealedSettings(config), requireApproval: false, review: { required: false } });
  if (readiness.state === 'missing') throw new Error(`${task} has no sealed suite; write one with maverick seal ${task}`);
  if (readiness.state !== 'ready') throw new Error(`the seal is ${readiness.state}${readiness.detail ? `: ${readiness.detail}` : ''}`);
  if (config.sealed?.review?.required && (readiness.sealed.review?.verdict !== 'pass' || readiness.sealed.review?.digest !== readiness.sealed.suiteDigest)) throw new Error('an independent suite review must pass before approval: maverick seal review <task>');
  const approval = { by, at: new Date().toISOString() };
  const entry = await appendSealLedger(cwd, task, readiness.sealed.sealId, 'seal-approve', approval);
  await writeSealed(taskDir, { ...readiness.sealed, approval, ledgerHead: entry.hash });
  return approval;
}

/** Opens a seal for the machine: the suite (checked against its digest) and the tests that failed on the base. */
export async function openSeal(cwd, task, sealed, config) {
  const settings = sealedSettings(config), paths = sealPaths(cwd, task, sealed.sealId), key = await vaultKey(settings, cwd);
  if (!await exists(paths.suite)) throw new Error(`the sealed suite ${sealed.sealId} is not in the vault (${paths.dir})`);
  const bundle = await readVaultJson(paths.suite, key, aad(sealed.sealId, 'suite'));
  if (suiteDigest(bundle) !== sealed.suiteDigest) throw new Error('the sealed suite does not match the digest in SEALED.json');
  const base = await readVaultJson(paths.base, key, aad(sealed.sealId, 'base'));
  return { bundle, base, key, paths, settings, discriminating: new Set(base.tests.filter(item => item.status === 'fail').map(item => item.id)) };
}

/**
 * Runs the sealed suite against `tree` and records the run: the results go to the vault,
 * encrypted; the seal's ledger gets their digest. Returns the metrics for the caller to
 * expose as its feedback policy allows.
 */
export async function querySeal({ cwd, task, taskDir, config, stack, tree, scope, loopId = null, visible = null, signal, timeoutMinutes }) {
  const sealed = await readSealed(taskDir);
  const { bundle, key, paths, settings, discriminating } = await openSeal(cwd, task, sealed, config);
  return withSealLock(paths.dir, async () => {
    const started = Date.now();
    const runners = await testRunners(cwd, config, stack);
    const run = await runSuite({ cwd, tree, bundle, runners, timeoutMs: (timeoutMinutes || settings.timeoutMinutes) * 60000, signal });
    const metrics = holdoutMetrics({ bundle, tests: run.tests, discriminating, suspended: sealed.suspended || [], visible });
    const ledger = await openLedger(paths.ledger, sealed.sealId, { schema: SEAL_SCHEMA });
    if (settings.ratchet) {
      const previous = ledger.entries.findLast(entry => entry.type === 'seal-run');
      if (previous) {
        const last = await readVaultJson(join(paths.results, `${String(previous.data.query).padStart(4, '0')}.enc`), key, aad(sealed.sealId, `result-${previous.data.query}`));
        const passed = new Set(last.tests.filter(test => test.status === 'pass' && !(sealed.suspended || []).includes(test.id)).map(test => test.id));
        metrics.regressions = run.tests.filter(test => passed.has(test.id) && test.status === 'fail').length;
      }
    }
    const query = ledger.entries.filter(entry => entry.type === 'seal-run').length + 1, resultDigest = resultMac(key, run.tests);
    await writeVaultFile(join(paths.results, `${String(query).padStart(4, '0')}.enc`), key, JSON.stringify({ scope, loopId, tree, tests: run.tests, files: run.files, metrics, at: new Date().toISOString() }), aad(sealed.sealId, `result-${query}`));
    await ledger.append('seal-run', { scope, loopId, tree, resultDigest, query, S: metrics.S, OI: metrics.OI, durationMs: Date.now() - started });
    return { sealed, metrics, resultDigest, query, bundle };
  });
}

/** Everything a human may see about a seal: with `reveal`, the tests (names and criteria) and their last results. */
export async function sealReport({ cwd, task, taskDir, config, reveal = false }) {
  const settings = sealedSettings(config), readiness = await sealReadiness(taskDir, settings), sealed = readiness.sealed;
  if (!sealed) return { state: 'missing' };
  const paths = sealPaths(cwd, task, sealed.sealId), entries = await readLedger(paths.ledger), chain = verifyChain(entries, sealed.sealId, { schema: SEAL_SCHEMA });
  const runs = entries.filter(entry => entry.type === 'seal-run');
  const report = { state: readiness.state, detail: readiness.detail || null, sealed, ledger: { ok: chain.ok, entries: entries.length, problems: chain.problems.map(item => item.problem) }, queries: runs.length };
  if (!reveal || ['discarded'].includes(sealed.status)) return report;
  let opened;
  try { opened = await openSeal(cwd, task, sealed, config); } catch (error) { return { ...report, tampered: error.message }; }
  const last = runs.length ? await readVaultJson(join(paths.results, `${String(runs.at(-1).data.query).padStart(4, '0')}.enc`), opened.key, aad(sealed.sealId, `result-${runs.at(-1).data.query}`)).catch(error => ({ error: error.message })) : null;
  const status = new Map((last?.tests || []).map(item => [item.id, item.status])), base = new Map(opened.base.tests.map(item => [item.id, item.status]));
  return { ...report, last: last && !last.error ? { scope: last.scope, loopId: last.loopId, at: last.at, metrics: last.metrics } : last, tests: opened.bundle.tests.map(test => ({ id: test.id, name: test.name, ids: test.ids, kind: test.kind, file: opened.bundle.files[test.file].path, base: base.get(test.id) || null, last: status.get(test.id) || null, active: (sealed.suspended || []).includes(test.id) ? false : test.kind === 'regression' || opened.discriminating.has(test.id) })) };
}

/**
 * Opens the seal at review time. `commit` writes the tests into the project for a human to
 * commit (and, with `protect`, adds them to loop.protectedPaths so loops can never change them);
 * `discard` deletes the suite and its results from the vault. Both are recorded.
 */
export async function unseal({ cwd, task, taskDir, config, decision, protect = false, by = process.env.USER || 'human', force = false }) {
  const sealed = await readSealed(taskDir);
  if (!sealed) throw new Error(`${task} has no sealed suite`);
  if (sealed.status !== 'sealed') throw new Error(`the seal was already ${sealed.status}`);
  if (await runningLoop(taskDir)) throw new Error('a loop is running for this task; unseal once it stops');
  const paths = sealPaths(cwd, task, sealed.sealId);
  let written = [], tests = [];
  if (decision === 'commit') {
    const { bundle } = await openSeal(cwd, task, sealed, config);
    for (const file of bundle.files) {
      const path = join(cwd, file.path), current = await readFile(path, 'utf8').catch(() => null);
      if (current !== null && current !== file.content && !force) throw new Error(`${file.path} exists with other content; move it, or pass --force`);
    }
    for (const file of bundle.files) { await mkdir(dirname(join(cwd, file.path)), { recursive: true }); await writeFile(join(cwd, file.path), file.content); }
    written = bundle.files.map(file => file.path);
    // Committed tests are public now: which criteria each proves is what living contracts are built from.
    tests = bundle.tests.map(test => ({ id: test.id, file: bundle.files[test.file].path, ids: test.ids }));
    if (protect) await protectPaths(cwd, written);
  } else if (decision === 'discard') {
    await rm(paths.suite, { force: true }); await rm(paths.base, { force: true }); await rm(paths.results, { recursive: true, force: true }); await rm(paths.transcripts, { recursive: true, force: true });
  } else throw new Error('use unseal <task> --commit [--protect], or unseal <task> --discard');
  const at = new Date().toISOString();
  const entry = await appendSealLedger(cwd, task, sealed.sealId, 'unseal', { decision, by, files: written.length, protect: Boolean(protect) });
  await writeSealed(taskDir, { ...sealed, status: decision === 'commit' ? 'committed' : 'discarded', decision: { decision, by, at, files: written, protect: Boolean(protect), ...(tests.length && { tests }) }, ledgerHead: entry.hash });
  await recordInLoop(taskDir, { decision, by, files: written.length, protect: Boolean(protect), sealId: sealed.sealId });
  await recordInReview(taskDir, task, { decision, by, at, files: written, protect });
  return { decision, files: written, protect: Boolean(protect) };
}

/** Adds paths to loop.protectedPaths in the project configuration: from now on, a loop that edits them is rolled back. */
async function protectPaths(cwd, paths) {
  const path = join(cwd, '.maverick', 'config.json');
  const current = await exists(path) ? JSON.parse(await readFile(path, 'utf8')) : { version: 1 };
  const loop = { ...current.loop }, { LOOP_DEFAULTS } = await import('../loop/model.js');
  loop.protectedPaths = [...new Set([...(loop.protectedPaths || LOOP_DEFAULTS.protectedPaths), ...paths])];
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, pretty({ ...current, loop }));
}

/** The decision also lands in the newest loop's ledger, when one exists and is not running. */
async function recordInLoop(taskDir, data) {
  const { newestTaskLoop, loopPaths } = await import('../loop/model.js'), id = await newestTaskLoop(taskDir);
  if (!id || await runningLoop(taskDir)) return;
  const ledger = await openLedger(loopPaths(taskDir, id).ledger, id);
  await ledger.append('unseal', data);
  const statePath = loopPaths(taskDir, id).state, state = JSON.parse(await readFile(statePath, 'utf8').catch(() => 'null'));
  if (state) { state.ledgerHead = ledger.head; await writeFile(statePath, pretty(state)); }
}

const SECTION = '## Sealed Acceptance Tests';

/** REVIEW.md records what the reviewer decided about the sealed tests, ticking the matching box. */
async function recordInReview(taskDir, task, { decision, by, at, files, protect }) {
  const path = join(taskDir, 'REVIEW.md');
  if (!await exists(path)) return;
  let text = await readFile(path, 'utf8');
  if (!/^## (?:Sealed Acceptance Tests|Testes de Aceite Selados|Pruebas de Aceptación Selladas)\s*$/m.test(text)) text = `${text.trimEnd()}\n\n${reviewSection(task)}`;
  text = text.replace(decision === 'commit' ? /- \[ \] commit the sealed tests/ : /- \[ \] discard the sealed tests/, match => match.replace('[ ]', '[x]'));
  await writeFile(path, `${text.trimEnd()}\n  > ${decision === 'commit' ? `Committed ${files.length} file(s)${protect ? ' as protected regression tests' : ''}` : 'Discarded'} by ${by} on ${at.slice(0, 10)} (maverick unseal).\n`);
}

/** The REVIEW.md section for a task with a seal: the reviewer decides what happens to the hidden tests. */
export const reviewSection = task => `${SECTION}
Hidden from the builder until now: read them with \`maverick seal status ${task} --reveal\`, then decide.
- [ ] commit the sealed tests as protected regression tests (\`maverick unseal ${task} --commit --protect\`)
- [ ] discard the sealed tests (\`maverick unseal ${task} --discard\`)
`;
