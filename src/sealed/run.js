import { withExport } from '../proof/export.js';
import { planRuns, runTestFile } from '../proof/runner.js';

// Running a sealed suite: always in an export of a tree, outside the repository, with the
// bundle's files laid on top and temporary caches inside the export, so nothing of the suite
// reaches the work tree, git, or a cache the builder reads. Results stay in memory; the
// caller decides what is recorded (encrypted, in the vault) and what anyone sees.

/**
 * The status of one sealed test from its file's run. A test of the whole file takes the file's
 * result. A test of one case takes the runner's case with its name; when the runner reports
 * cases and none has that name, the test is not measured: another case's failure must never
 * stand in for it. Without per-case results, the file's result is all there is.
 */
export function testStatus(test, result) {
  if (!result?.started) return 'unmeasured';
  const fileStatus = result.timedOut ? 'fail' : result.ok ? 'pass' : 'fail';
  const cases = (result.cases || []).filter(item => item.name);
  if (test.match === 'file' || !cases.length) return fileStatus;
  const match = cases.find(item => item.name === test.name) || cases.find(item => item.name.length >= 3 && test.name.length >= 3 && (item.name.endsWith(test.name) || test.name.endsWith(item.name)));
  if (!match) return 'unmeasured';
  return match.status === 'skip' ? 'unmeasured' : match.status;
}

/**
 * Runs `bundle` against `tree`. A file with a failing test runs a second time; a test whose
 * result changes between the two runs is `flaky` and leaves the holdout. Returns per-test
 * statuses (`pass`, `fail`, `flaky`, `unmeasured`) and per-file facts, never the output.
 */
export async function runSuite({ cwd, tree, bundle, runners, timeoutMs, signal }) {
  const files = bundle.files.filter(file => file.role === 'test').map(file => file.path);
  const { plan, unmatched } = planRuns(runners, files);
  const overlay = bundle.files.map(({ path, content }) => ({ path, content }));
  const runEach = items => async (dir, { env }) => { const results = new Map(); for (const { path, runner } of items) results.set(path, await runTestFile({ dir, path, runner, timeoutMs, env, signal })); return results; };
  const options = { prefix: 'maverick-sealed-', overlay, link: true, isolate: true };
  const first = await withExport(cwd, tree, runEach(plan), options);
  const retry = plan.filter(item => first.get(item.path)?.started && !first.get(item.path).ok);
  const second = retry.length ? await withExport(cwd, tree, runEach(retry), options) : new Map();
  const tests = bundle.tests.map(test => {
    const path = bundle.files[test.file]?.path, status = testStatus(test, first.get(path));
    const again = second.has(path) ? testStatus(test, second.get(path)) : null;
    return { id: test.id, status: again && again !== status && status !== 'unmeasured' && again !== 'unmeasured' ? 'flaky' : status };
  });
  return {
    tests,
    files: plan.map(({ path, runner }) => { const result = first.get(path); return { path, runner: runner.name, ok: Boolean(result?.ok), started: Boolean(result?.started), timedOut: Boolean(result?.timedOut), cases: result?.cases.length || 0 }; }),
    unmatched
  };
}

/**
 * The holdout metrics of one run (pure; see docs). T is the active set: measured, not flaky,
 * not suspended, and failing on the base unless it is a regression guard.
 *   S   = |pass ∩ T| / |T|
 *   Sac = criteria whose every active test passes / criteria with an active test
 *   Vac = criteria the visible evidence claims met / the same criteria
 *   OI  = Vac − Sac, in percentage points: positive means promised and not delivered
 */
export function holdoutMetrics({ bundle, tests, discriminating = new Set(), suspended = [], visible = null }) {
  const status = new Map(tests.map(item => [item.id, item.status]));
  const active = bundle.tests.filter(test => !suspended.includes(test.id) && ['pass', 'fail'].includes(status.get(test.id)) && (test.kind === 'regression' || discriminating.has(test.id)));
  const passed = active.filter(test => status.get(test.id) === 'pass').length;
  const criteria = [...new Set(active.flatMap(test => test.ids))].sort();
  const sealedMet = id => active.filter(test => test.ids.includes(id)).every(test => status.get(test.id) === 'pass');
  const ratio = (count, total) => (total ? count / total : null);
  const Sac = ratio(criteria.filter(sealedMet).length, criteria.length), Vac = visible ? ratio(criteria.filter(id => visible(id)).length, criteria.length) : null;
  return {
    S: ratio(passed, active.length), passed, total: active.length, Sac, Vac, OI: Sac !== null && Vac !== null ? Math.round((Vac - Sac) * 100) : null,
    criteria: criteria.length, missed: criteria.filter(id => !sealedMet(id)), escape: visible ? criteria.filter(id => visible(id) && !sealedMet(id)) : [],
    excluded: { flaky: tests.filter(item => item.status === 'flaky').length, unmeasured: tests.filter(item => item.status === 'unmeasured').length, vacuous: bundle.tests.filter(test => test.kind !== 'regression' && !discriminating.has(test.id)).length, suspended: suspended.length }
  };
}

/** "7/10 · OI +33 pp": what a human (or, with feedback `count`, the builder) reads. */
export const holdoutLine = metrics => (metrics.total ? `${metrics.passed}/${metrics.total} sealed pass${metrics.OI !== null ? ` · overfitting index ${metrics.OI >= 0 ? '+' : ''}${metrics.OI} pp` : ''}` : 'no active sealed test');
