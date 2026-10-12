import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathReferences } from '../core/quality.js';
import { sectionBody } from '../core/util.js';
import { git } from '../loop/git.js';
import { applySeverity } from '../loop/integrity.js';
import { LANGUAGE_RULES, languageOf, TEST, TEST_DATA } from '../loop/integrity-rules.js';
import { loadGraph } from '../subtasks/graph.js';
import { withExport } from './export.js';
import { planRuns, runTestFile, testRunners } from './runner.js';

// Ablation: a test that cannot fail is not evidence. The integrity guard asks whether a change
// made the checks weaker; ablation asks whether the new checks have any strength at all. Each
// new or changed test file runs twice, in exports outside the repository: with the change (it
// must pass) and on the code before the change with only the new tests laid on top (it must
// fail). A test that passes both ways does not test what the change does: `vacuous-test`.
// A compile or import error before the change counts as failing, which is what it is.

/** Test files the TECHSPEC Test Plan marks as regression guards: they are meant to pass before the change too. */
export function regressionGuards(techspec = '') {
  return new Set(sectionBody(techspec, 'Test Plan').split('\n').filter(line => /regress/i.test(line)).flatMap(line => pathReferences(line, { includeNew: true })));
}

/** True when the file declares at least one test, so helpers and fixtures in test folders are not measured as tests. */
export function declaresTests(path, text) {
  const rules = LANGUAGE_RULES[languageOf(path)];
  return Boolean(rules?.test) && String(text).split('\n').some(line => !(rules.comment && rules.comment.test(line)) && rules.test.test(line));
}

const key = item => `${item.classname || ''}::${item.name}`;

/**
 * The verdict for one file (pure). `head` and `base` are runTestFile results; `added` is true
 * for a file the change created, whose every test case should discriminate.
 */
export function classifyFile({ path, head, base, added, guard, refactor }) {
  if (!head?.started) return { path, verdict: 'unmeasured', note: head?.output?.trim().split('\n').at(-1) || 'the runner did not start' };
  if (!head.ok) return { path, verdict: 'broken', note: head.timedOut ? 'timed out with the change' : 'fails with the change too, so its strength cannot be measured' };
  if (!base?.started) return { path, verdict: 'unmeasured', note: 'the runner did not start on the code before the change' };
  if (!base.ok) {
    // Per test case where the runner reports them: in a new file every case should fail before the change.
    const before = new Map(base.cases.map(item => [key(item), item.status]));
    const idle = added && head.cases.length ? head.cases.filter(item => item.status === 'pass' && before.get(key(item)) === 'pass').map(item => item.name) : [];
    return { path, verdict: 'discriminating', ...(idle.length && !guard && !refactor && { vacuousCases: idle }), note: base.timedOut ? 'timed out before the change' : undefined };
  }
  return { path, verdict: guard ? 'guard' : refactor ? 'expected' : 'vacuous', note: guard ? 'a regression guard in the Test Plan' : refactor ? 'a refactor keeps behavior, so its tests pass before it too' : 'passes without the change' };
}

/**
 * Runs the ablation of the change from `base` to `head` (both trees). Returns per-file
 * verdicts, findings with severities for `settings.integrity`, and counts.
 */
export async function runAblation({ cwd, taskDir, config = {}, stack, base, head, diff, settings = {}, timeoutMs, signal }) {
  const changed = diff.files.filter(file => ['A', 'M'].includes(file.status));
  const content = async path => (await git(cwd, ['show', `${head}:./${path}`], { encoding: null })).stdout;
  const tests = [], overlay = [];
  for (const file of changed) {
    const isTest = TEST.test(file.path) && languageOf(file.path), isData = TEST_DATA.test(file.path);
    if (!isTest && !isData) continue;
    const text = await content(file.path);
    overlay.push({ path: file.path, content: text });
    if (isTest && !isData && declaresTests(file.path, text)) tests.push({ path: file.path, added: file.status === 'A' });
  }
  const level = settings.integrity?.level || 'standard';
  const empty = { ok: true, level, files: [], findings: [], stats: { tests: 0, discriminating: 0, vacuous: 0, broken: 0, unmeasured: 0 } };
  if (!tests.length || level === 'off') return { ...empty, note: tests.length ? 'integrity level off' : 'the change adds or changes no test' };
  const techspec = await readFile(join(taskDir, 'TECHSPEC.md'), 'utf8').catch(() => ''), guards = regressionGuards(techspec);
  const graph = await loadGraph(taskDir).catch(() => ({ items: [] }));
  const refactor = graph.items.length > 0 && graph.items.every(item => item.type === 'refactor');
  const runners = await testRunners(cwd, config, stack);
  const { plan, unmatched } = planRuns(runners, tests.map(test => test.path));
  const runEach = items => async (dir, { env }) => { const results = new Map(); for (const { path, runner } of items) results.set(path, await runTestFile({ dir, path, runner, timeoutMs, env, signal })); return results; };
  const withHead = await withExport(cwd, head, runEach(plan), { prefix: 'maverick-ablation-', link: true, isolate: true });
  const passing = plan.filter(item => withHead.get(item.path)?.ok);
  const withBase = passing.length ? await withExport(cwd, base, runEach(passing), { prefix: 'maverick-ablation-', overlay, link: true, isolate: true }) : new Map();
  const files = [
    ...plan.map(({ path }) => classifyFile({ path, head: withHead.get(path), base: withBase.get(path), added: tests.find(test => test.path === path).added, guard: guards.has(path), refactor })),
    ...unmatched.map(path => ({ path, verdict: 'unmeasured', note: 'no runner matches it; declare verification.runners' }))
  ];
  const raw = [
    ...files.filter(file => file.verdict === 'vacuous').map(file => ({ kind: 'vacuous-test', file: file.path, message: 'it passes without the change, so it does not test what the change does' })),
    ...files.filter(file => file.vacuousCases?.length).map(file => ({ kind: 'vacuous-test', file: file.path, message: `${file.vacuousCases.length} new test case(s) pass without the change`, excerpt: file.vacuousCases.slice(0, 5).join('; ') }))
  ];
  const report = applySeverity(raw, { level, severity: settings.integrity?.severity, allow: settings.integrity?.allow });
  const count = verdict => files.filter(file => file.verdict === verdict).length;
  return { ok: report.ok, level, files, findings: report.findings, stats: { tests: files.length, discriminating: count('discriminating'), vacuous: count('vacuous'), guards: count('guard'), expected: count('expected'), broken: count('broken'), unmeasured: count('unmeasured') } };
}

/** ABLATION.md: which new tests can fail, and which cannot. */
export function renderAblationReport(task, report, { against } = {}) {
  const icon = { discriminating: '✓', vacuous: '✗', guard: '·', expected: '·', broken: '!', unmeasured: '?' };
  const rows = report.files.map(file => `| ${icon[file.verdict]} ${file.verdict} | \`${file.path}\` | ${(file.note || (file.vacuousCases ? `${file.vacuousCases.length} case(s) pass without the change: ${file.vacuousCases.slice(0, 3).join('; ')}` : '')).replace(/\|/g, '/')} |`).join('\n');
  const s = report.stats;
  return `# Ablation — ${task}

Generated: ${new Date().toISOString()}
Compared with: ${against || 'the base'} · level ${report.level}
Result: ${report.ok ? 'no blocking finding' : `${report.findings.filter(item => item.severity === 'block').length} blocking finding(s)`}
Tests measured: ${s.tests} · discriminating ${s.discriminating} · vacuous ${s.vacuous} · broken ${s.broken} · not measured ${s.unmeasured}

Each new or changed test file ran with the change (it must pass) and on the code before the change with only the new tests on top (it must fail). A test that passes both ways does not test what the change does.

${rows ? `| Verdict | File | Note |\n|---|---|---|\n${rows}` : report.note ? `- ${report.note}` : '- No test file to measure.'}

A regression guard (a test meant to pass before the change too) belongs in the TECHSPEC Test Plan on a line that says "regression"; a human can allow a finding with \`loop.integrity.allow\` (kind \`vacuous-test\`).
`;
}
