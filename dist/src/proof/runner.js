import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join, posix } from 'node:path';
import { executeCommand } from '../core/project-tools.js';
import { parseJson } from '../core/util.js';
import { globToRegex } from '../intel/architecture.js';
import { parseJunit } from './junit.js';

// How to run a chosen set of test files, not the whole suite. The ablation gate runs each new
// test against the code before the change, and the sealed suite runs its own files; both need
// "run exactly these tests" for whatever stack the project uses. `verification.runners` says
// it explicitly; otherwise the runner is inferred from the stack, and a file no runner matches
// is reported as not measured, never as passing.
//
// A runner is { match: glob | [globs], run: "command {files}", cwd?, name? }. Tokens:
//   {files} {file}  the test file(s), relative to the runner's cwd, each one argument
//   {dir}           ./<the file's directory> (Go packages)
//   {name}          the file name without its extension (Cargo integration tests)
//   {report}        a JUnit XML path; when present, results are read per test case

const JS = ['**/*.js', '**/*.jsx', '**/*.mjs', '**/*.cjs', '**/*.ts', '**/*.tsx', '**/*.mts', '**/*.cts'];
const quote = value => `"${String(value).replace(/["\\]/g, char => `\\${char}`)}"`;
const nodeJunit = () => { const [major, minor] = process.versions.node.split('.').map(Number); return major > 21 || (major === 21 && minor >= 3) || (major === 20 && minor >= 13); };

/** Runners inferred for one directory of the project (the root, or a first-level subproject). */
async function inferred(cwd, detected, sub = '') {
  const runners = [], at = globs => (sub ? globs.map(glob => `${sub}/${glob}`) : globs), add = (name, match, run) => runners.push({ name, match: at(match), run, cwd: sub, source: 'detected' });
  const test = detected.commands.find(item => item.kind === 'test')?.command || '';
  for (const ecosystem of detected.ecosystems) {
    if (ecosystem.id === 'node') {
      const pkg = parseJson(await readFile(join(cwd, sub, 'package.json'), 'utf8').catch(() => '')) || {}, deps = { ...pkg.dependencies, ...pkg.devDependencies }, script = String(pkg.scripts?.test || '');
      if (/\bvitest\b/.test(script) || deps.vitest) add('vitest', JS, 'npx vitest run {files} --reporter=default --reporter=junit --outputFile.junit={report}');
      else if (/\bjest\b/.test(script) || deps.jest) add('jest', JS, 'npx jest --runTestsByPath {files}');
      else if (/\bmocha\b/.test(script) || deps.mocha) add('mocha', JS, 'npx mocha {files}');
      else if (/\bava\b/.test(script) || deps.ava) add('ava', JS, 'npx ava {files}');
      else add('node:test', ['**/*.js', '**/*.mjs', '**/*.cjs'], `${quote(process.execPath)} --test${nodeJunit() ? ' --test-reporter=spec --test-reporter-destination=stdout --test-reporter=junit --test-reporter-destination={report}' : ''} {files}`);
    }
    if (ecosystem.id === 'python') {
      const pytest = /pytest/.test(test);
      add(pytest ? 'pytest' : 'unittest', ['**/test_*.py', '**/*_test.py', '**/tests/**/*.py'], pytest ? `${test} {files} --junitxml={report}` : `${process.platform === 'win32' ? 'python' : 'python3'} -m unittest {files}`);
    }
    if (ecosystem.id === 'go') add('go test', ['**/*_test.go'], 'go test -count=1 {dir}');
    if (ecosystem.id === 'rust') add('cargo test', ['tests/*.rs'], 'cargo test --test {name}');
    if (ecosystem.id === 'ruby') { if (/rspec/.test(test)) add('rspec', ['**/*_spec.rb'], 'bundle exec rspec {files}'); else add('minitest', ['**/*_test.rb'], 'bundle exec ruby -Itest {file}'); }
    if (ecosystem.id === 'php') add('phpunit', ['**/*Test.php'], 'vendor/bin/phpunit --log-junit {report} {file}');
    if (ecosystem.id === 'elixir') add('mix test', ['**/*_test.exs'], 'mix test {files}');
    if (ecosystem.id === 'dart') add(test.startsWith('flutter') ? 'flutter test' : 'dart test', ['**/*_test.dart'], `${test.startsWith('flutter') ? 'flutter' : 'dart'} test {files}`);
  }
  return runners;
}

/** The runners for a project: `verification.runners` first, then the ones inferred from its stack. */
export async function testRunners(cwd, config = {}, stack) {
  const configured = (config.verification?.runners || []).map(item => ({ name: item.name || item.run.split(/\s+/).slice(0, 2).join(' '), match: [item.match].flat(), run: item.run, cwd: item.cwd || '', source: 'config' }));
  const detected = stack ? [...await inferred(cwd, stack), ...(await Promise.all((stack.subprojects || []).map(sub => inferred(cwd, sub, sub.path)))).flat()] : [];
  return [...configured, ...detected].map(runner => ({ ...runner, patterns: runner.match.map(globToRegex) }));
}

/** The first runner whose glob matches a project-relative path, or null. */
export function runnerFor(runners, path) {
  return runners.find(runner => (!runner.cwd || path.startsWith(`${runner.cwd}/`)) && runner.patterns.some(pattern => pattern.test(path))) || null;
}

/** The runner's command for one file, tokens filled in. */
export function runnerCommand(runner, path, report) {
  const local = runner.cwd ? path.slice(runner.cwd.length + 1) : path, dir = posix.dirname(local);
  return runner.run.replaceAll('{files}', quote(local)).replaceAll('{file}', quote(local)).replaceAll('{dir}', quote(dir === '.' ? '.' : `./${dir}`)).replaceAll('{name}', quote(basename(local).replace(/\.[^.]+$/, ''))).replaceAll('{report}', quote(report || ''));
}

/**
 * Runs one test file in `dir` (an export) with its runner. `ok` is the process exit status;
 * `cases` are the per-test results when the runner wrote a JUnit report. Without `timeoutMs`
 * and `signal`, the ones of the gate or loop that runs it apply.
 */
export async function runTestFile({ dir, path, runner, timeoutMs, env, signal }) {
  const scratch = await mkdtemp(join(tmpdir(), 'maverick-report-')), report = join(scratch, 'junit.xml');
  try {
    const command = runnerCommand(runner, path, report);
    // A runner starts as from a fresh terminal: a test runner's own context (node:test sets one for its children) would change how it reports.
    const result = await executeCommand(dir, command, runner.cwd || '', 20000, { timeoutMs, env: { ...env, NODE_TEST_CONTEXT: undefined }, signal });
    const xml = runner.run.includes('{report}') ? await readFile(report, 'utf8').catch(() => '') : '';
    return { path, runner: runner.name, ok: result.ok, code: result.code ?? null, timedOut: Boolean(result.timedOut), aborted: Boolean(result.aborted), started: result.code !== null || result.timedOut || result.aborted, output: result.output, cases: xml ? parseJunit(xml) : [] };
  } finally { await rm(scratch, { recursive: true, force: true }); }
}

/** Pairs each path with its runner; paths no runner matches are `unmatched`. */
export function planRuns(runners, paths) {
  const plan = [], unmatched = [];
  for (const path of paths) { const runner = runnerFor(runners, path); if (runner) plan.push({ path, runner }); else unmatched.push(path); }
  return { plan, unmatched };
}
