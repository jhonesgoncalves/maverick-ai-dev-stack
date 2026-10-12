import { readFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { sha256 } from '../capabilities/model.js';
import { parseDiff } from '../core/diff.js';
import { GENERATED } from '../core/grounding.js';
import { LOCKFILE_PATTERN } from '../core/project-tools.js';
import { declaredScope } from '../core/quality.js';
import { selectVerificationCommands } from '../core/stack.js';
import { splitCommand } from '../core/util.js';
import { globToRegex } from '../intel/architecture.js';
import { buildGraph, impactOf } from '../intel/graph.js';
import { git } from './git.js';
import { canonical } from './ledger.js';
import { BUILD_FILE, BUILD_FILE_LINES, CI, CONDITIONAL, LANGUAGE_RULES, languageOf, LITERAL_STOPLIST, ORACLE_CONFIG, ORACLE_SECTIONS, REVIEWER_DIRECTED, SEVERITY, TEST, TEST_DATA } from './integrity-rules.js';

// The integrity guard: evidence that the checks themselves were not weakened. Agents under
// pressure to make checks pass delete or skip tests, loosen assertions, silence the linter or
// edit the test configuration. The guard reads the real diff (not the agent's account of it),
// so it works the same for every agent, including ones with no hook system, and it catches
// edits made through the shell that a tool's own checkpoints miss.

const GENERATED_PATH = new RegExp(`(^|/)(${GENERATED.map(dir => dir.replace(/\./g, '\\.')).join('|')})/`);
export const isGenerated = path => GENERATED_PATH.test(path) || LOCKFILE_PATTERN.test(path) || TEST_DATA.test(path) && /\.(snap|golden)$/.test(path);
const MAX_FILES = 20000;

/** Files that verification commands, flow command gates and hooks run: changing them changes the check. */
export function commandFiles({ config = {}, stack, gates = [] } = {}) {
  const commands = [
    ...(stack ? selectVerificationCommands(stack, config).map(item => item.command) : (config.verification?.commands || []).map(item => (typeof item === 'string' ? item : item.command))),
    ...gates.filter(gate => gate.type === 'command').map(gate => gate.run),
    ...(config.hooks || []).map(hook => hook.run)
  ];
  const files = new Set();
  for (const command of commands) {
    let argv = [];
    try { argv = splitCommand(command); } catch { continue; }
    for (const arg of argv) {
      const path = arg.replace(/^\.\//, '');
      if (!path.startsWith('-') && !path.startsWith('/') && !path.includes('..') && /^[\w./-]+\.[a-z0-9]{1,6}$/i.test(path) && !/^\d/.test(path)) files.add(path);
    }
  }
  // A task runner that hosts the checks is part of them.
  const runners = new Set((stack?.commands || []).map(item => item.source));
  if (runners.has('make')) ['Makefile', 'GNUmakefile', 'makefile'].forEach(file => files.add(file));
  if (runners.has('just')) ['justfile', 'Justfile', '.justfile'].forEach(file => files.add(file));
  if (runners.has('task')) ['Taskfile.yml', 'Taskfile.yaml'].forEach(file => files.add(file));
  return [...files];
}

/** The compiled rules for one project: protected globs, Do Not Touch and the files checks run. */
export function oracleRules({ protectedPaths = [], doNotTouch = [], verificationFiles = [] } = {}) {
  return { protected: protectedPaths.map(glob => [glob, globToRegex(glob)]), doNotTouch: doNotTouch.map(glob => [glob, globToRegex(glob)]), verification: new Set(verificationFiles) };
}

/** A path's role in the oracle, most protected first, or null for ordinary code. */
export function classifyPath(path, rules) {
  if (!path) return null;
  const glob = rules.protected.find(([, pattern]) => pattern.test(path));
  if (glob) return { role: 'protected', rule: glob[0] };
  const dnt = rules.doNotTouch.find(([, pattern]) => pattern.test(path));
  if (dnt) return { role: 'do-not-touch', rule: dnt[0] };
  if (CI.test(path)) return { role: 'ci' };
  if (ORACLE_CONFIG.test(path) || rules.verification.has(path)) return { role: 'oracle-config' };
  if (TEST_DATA.test(path)) return { role: 'test-data' };
  // A test is code in a test location; anything else there (fixtures, a renamed `.bak`) is test data.
  if (TEST.test(path)) return { role: languageOf(path) ? 'test' : 'test-data' };
  return null;
}

async function listProjectFiles(cwd, ref) {
  const args = ref ? ['ls-tree', '-r', '--name-only', '-z', '--full-name', ref, '--', '.'] : ['ls-files', '-co', '--exclude-standard', '-z', '--', '.', ':(exclude).maverick'];
  const result = await git(cwd, args);
  return result.ok ? result.stdout.split('\0').filter(Boolean).filter(path => !path.split('/').includes('.maverick')) : [];
}

/**
 * The oracle set of a project: every file that decides whether the work passes (tests, test
 * data, check configuration, CI, protected paths), with a digest that changes when any of them
 * does. A loop records it at the start, so the ledger says exactly what was being protected.
 */
export async function detectOracleSet(cwd, { config = {}, stack, taskDir, settings = {}, gates = [], ref = null } = {}) {
  const scope = taskDir ? await declaredScope(taskDir) : { all: [], doNotTouch: [] };
  const verificationFiles = commandFiles({ config, stack, gates });
  const rules = oracleRules({ protectedPaths: settings.protectedPaths || [], doNotTouch: scope.doNotTouch, verificationFiles });
  const files = await listProjectFiles(cwd, ref), counts = {}, entries = [];
  let tests = 0;
  for (const path of files.slice(0, MAX_FILES)) {
    const kind = classifyPath(path, rules);
    if (!kind) continue;
    counts[kind.role] = (counts[kind.role] || 0) + 1;
    // Tests are counted, not hashed, so a project with thousands of tests stays cheap.
    if (kind.role === 'test') { tests += 1; continue; }
    const content = ref ? (await git(cwd, ['show', `${ref}:./${path}`], { encoding: null })).stdout : await readFile(join(cwd, path)).catch(() => Buffer.alloc(0));
    entries.push({ path, role: kind.role, ...(kind.rule && { rule: kind.rule }), hash: sha256(content) });
  }
  return { version: 1, digest: sha256(canonical({ entries, tests })), counts, entries, tests: { count: tests }, declared: scope.all, doNotTouch: scope.doNotTouch, verificationFiles, truncated: files.length > MAX_FILES };
}

const tally = (lines, pattern, comment) => lines.filter(item => !(comment && comment.test(item.text)) && pattern?.test(item.text)).length;
const LITERAL = /(['"`])((?:(?!\1).){4,80})\1|\b(\d{3,})\b/g;
const literalsIn = text => new Set([...String(text).matchAll(LITERAL)].map(match => (match[2] ?? match[3]).trim()).filter(value => value && !LITERAL_STOPLIST.has(value.toLowerCase())));

/**
 * Audits one diff (pure). `files` come from parseDiff; `context` carries the classification
 * rules and what the wrapper read from git: declared and editable tests, section changes,
 * literal sets, the blast radius, the agent's claim. Messages never contain line numbers, so a
 * finding keeps the same identity across iterations.
 */
export function auditDiff(files, context) {
  const { rules, numstat = [], declared = new Set(), editable = new Set(), sectionChanges = [], testLiterals = new Set(), baseLiterals = new Map(), taskLiterals = new Set(), claim = {}, blastRadius = {}, truncated = false } = context;
  const raw = [], push = (kind, file, message, extra = {}) => raw.push({ kind, file, message, ...extra });
  const totals = {};
  for (const file of files) {
    const path = file.newPath || file.oldPath, before = classifyPath(file.oldPath, rules), after = classifyPath(file.newPath, rules);
    const role = after || before, added = file.hunks.flatMap(hunk => hunk.added), removed = file.hunks.flatMap(hunk => hunk.removed);
    const isDeclared = declared.has(file.newPath) || declared.has(file.oldPath);
    if (['protected', 'do-not-touch'].includes(before?.role) || ['protected', 'do-not-touch'].includes(after?.role)) {
      const which = [before, after].find(item => ['protected', 'do-not-touch'].includes(item?.role));
      push('protected-path-modified', path, which.role === 'protected' ? `matches the protected path ${which.rule}` : `is listed under Do Not Touch (${which.rule})`);
      continue;
    }
    if (before?.role === 'test' && (file.status === 'deleted' || (file.status === 'renamed' && after?.role !== 'test'))) push('test-deleted', file.oldPath, file.status === 'deleted' ? 'a test file was deleted' : `a test file was moved out of the tests (to ${file.newPath})`);
    if (role?.role === 'ci') push('oracle-config-modified', path, 'CI configuration changed', { declared: isDeclared });
    else if (role?.role === 'oracle-config') push('oracle-config-modified', path, rules.verification.has(path) ? 'a file the checks run changed' : 'lint, type, test or coverage configuration changed', { declared: isDeclared });
    if (['test', 'test-data'].includes(before?.role) && ['modified', 'renamed'].includes(file.status) && file.hunks.length && !editable.has(file.oldPath) && !editable.has(file.newPath)) push('undeclared-test-modified', path, `an existing ${before.role === 'test' ? 'test' : 'test data file'} outside the task's declared scope changed`);
    if (BUILD_FILE.test(path)) { const hit = added.find(item => BUILD_FILE_LINES.test(item.text)); if (hit) push('oracle-config-modified', path, 'the build now skips or tolerates failing checks', { excerpt: hit.text.trim().slice(0, 200), declared: isDeclared }); }
    const language = languageOf(path), lang = LANGUAGE_RULES[language];
    if (!lang || isGenerated(path)) continue;
    const suppressed = tally(added, lang.suppression) - tally(removed, lang.suppression);
    if (suppressed > 0) push('lint-or-type-suppression-added', path, 'a lint or type check was silenced', { excerpt: added.find(item => lang.suppression.test(item.text))?.text.trim().slice(0, 200) });
    const directed = added.find(item => REVIEWER_DIRECTED.test(item.text));
    if (directed) push('reviewer-directed-text', path, 'added text addresses whoever reviews or judges the change', { excerpt: directed.text.trim().slice(0, 200) });
    if (role?.role === 'test') {
      const t = (totals[language] ||= { tests: 0, assertions: 0, files: {} });
      const testDelta = tally(added, lang.test, lang.comment) - tally(removed, lang.test, lang.comment), assertionDelta = tally(added, lang.assertion, lang.comment) - tally(removed, lang.assertion, lang.comment);
      t.tests += testDelta; t.assertions += assertionDelta; t.files[path] = { tests: testDelta, assertions: assertionDelta };
      if (tally(added, lang.skip, lang.comment) > tally(removed, lang.skip, lang.comment)) push('skip-or-only-added', path, 'a test was skipped, focused or marked to do', { excerpt: added.find(item => lang.skip.test(item.text))?.text.trim().slice(0, 200) });
      const tautology = lang.tautology && added.find(item => lang.tautology.test(item.text));
      if (tautology) push('assertion-weakened', path, 'an assertion that cannot fail was added', { excerpt: tautology.text.trim().slice(0, 200) });
      else if (lang.strict && lang.loose && tally(removed, lang.strict, lang.comment) > tally(added, lang.strict, lang.comment) && tally(added, lang.loose, lang.comment) > tally(removed, lang.loose, lang.comment)) push('assertion-weakened', path, 'exact assertions were replaced with looser ones');
    } else if (!role) {
      // A literal from the tests, new in a condition of the code under test: special-casing the tests.
      const base = baseLiterals.get(path) || new Set();
      const hit = added.find(item => CONDITIONAL.test(item.text) && [...literalsIn(item.text)].some(value => testLiterals.has(value) && !base.has(value) && !taskLiterals.has(value)));
      if (hit) push('test-literal-special-casing', path, 'a value the tests use appears in a new condition of the code; check it is not special-casing the tests', { excerpt: hit.text.trim().slice(0, 200) });
    }
  }
  for (const [language, t] of Object.entries(totals)) {
    const lost = file => Object.entries(t.files).filter(([, delta]) => delta[file] < 0).map(([path, delta]) => `${path} (${delta[file]})`).join(', ');
    if (t.tests < 0) push('test-count-decreased', Object.keys(t.files)[0], `${-t.tests} fewer ${language} test(s) overall`, { excerpt: lost('tests') });
    if (t.assertions < 0) push('assertion-count-decreased', Object.keys(t.files)[0], `${-t.assertions} fewer ${language} assertion(s) overall`, { excerpt: lost('assertions') });
  }
  for (const change of sectionChanges) push('oracle-config-modified', change.path, `the ${change.sections.join(', ')} section${change.sections.length > 1 ? 's' : ''} changed`, { declared: declared.has(change.path), excerpt: change.excerpt });
  // Blast radius: generated files, lockfiles and snapshots do not count toward the size.
  const counted = numstat.filter(item => !isGenerated(item.path)), lines = counted.reduce((sum, item) => sum + item.added + item.deleted, 0);
  if (truncated) push('blast-radius-exceeded', null, 'the change is too large to audit');
  else {
    if (blastRadius.maxFiles && counted.length > blastRadius.maxFiles) push('blast-radius-exceeded', null, `${counted.length} files changed; the limit per iteration is ${blastRadius.maxFiles}`);
    if (blastRadius.maxLines && lines > blastRadius.maxLines) push('blast-radius-exceeded', null, `${lines} lines changed; the limit per iteration is ${blastRadius.maxLines}`);
  }
  const changed = new Set(files.flatMap(file => [file.oldPath, file.newPath]).filter(Boolean));
  const norm = path => String(path).replace(/^\.\//, '').replace(/\/$/, '');
  for (const dispute of claim.disputes || []) {
    const target = norm(dispute.target);
    if (changed.has(target)) push('disputed-check-modified', target, 'the agent disputed this check and changed it anyway');
  }
  const claimed = (claim.filesChanged || []).map(norm).filter(path => path && !path.startsWith('.maverick/'));
  if (claimed.length) {
    const missing = claimed.filter(path => !changed.has(path)), unclaimed = [...changed].filter(path => !claimed.includes(path));
    if (missing.length || unclaimed.length) push('claim-mismatch', null, `the agent's account of its changes differs from the diff${missing.length ? `; claimed but unchanged: ${missing.slice(0, 5).join(', ')}` : ''}${unclaimed.length ? `; changed but not claimed: ${unclaimed.slice(0, 5).join(', ')}` : ''}`);
  }
  return finalize(raw, context, { files: counted.length, lines, tests: Object.fromEntries(Object.entries(totals).map(([language, t]) => [language, { tests: t.tests, assertions: t.assertions }])) });
}

/** Severity per kind and level, then configured overrides, then the allow list. */
function finalize(raw, { level = 'standard', severity = {}, allow = [] }, stats) {
  if (level === 'off') return { ok: true, level, findings: [], stats: { ...stats, allowed: 0 } };
  const allowed = allow.map(item => ({ ...item, pattern: globToRegex(item.path) }));
  let skipped = 0;
  const findings = [];
  for (const item of raw) {
    let value = severity[item.kind] || SEVERITY[item.kind]?.[level] || 'warn';
    if (!severity[item.kind] && item.kind === 'oracle-config-modified' && item.declared) value = 'warn';
    if (value === 'off') continue;
    if (allowed.some(rule => rule.kind === item.kind && item.file && rule.pattern.test(item.file))) { skipped += 1; continue; }
    const { declared: _declared, ...finding } = item;
    findings.push({ severity: value, ...finding, key: `${item.kind}:${item.file || '*'}` });
  }
  return { ok: !findings.some(item => item.severity === 'block'), level, findings, stats: { ...stats, allowed: skipped } };
}

/** Sections of a TOML or INI file by header, for comparing only the oracle's tables. */
function sectionsOf(text) {
  const sections = new Map();
  let current = '';
  for (const line of String(text || '').split('\n')) {
    const header = line.match(/^\s*\[\[?([^\]]+)\]\]?\s*$/);
    if (header) { current = header[1].trim(); continue; }
    sections.set(current, `${sections.get(current) || ''}${line}\n`);
  }
  return sections;
}

/** Oracle sections that changed between two versions of a manifest. */
export function sectionChange(path, before, after) {
  const name = basename(path);
  if (ORACLE_SECTIONS.json[name]) {
    let a = {}, b = {};
    try { a = JSON.parse(before || '{}'); b = JSON.parse(after || '{}'); } catch { return null; }
    const sections = ORACLE_SECTIONS.json[name].filter(key => JSON.stringify(a[key] ?? null) !== JSON.stringify(b[key] ?? null));
    const scripts = sections.includes('scripts') ? Object.keys({ ...a.scripts, ...b.scripts }).filter(key => a.scripts?.[key] !== b.scripts?.[key]).map(key => `${key}: ${JSON.stringify(a.scripts?.[key] ?? null)} → ${JSON.stringify(b.scripts?.[key] ?? null)}`) : [];
    return sections.length ? { path, sections, excerpt: scripts.join('; ').slice(0, 200) || undefined } : null;
  }
  const pattern = ORACLE_SECTIONS.ini[name];
  if (!pattern) return null;
  const a = sectionsOf(before), b = sectionsOf(after);
  const sections = [...new Set([...a.keys(), ...b.keys()])].filter(key => pattern.test(key) && a.get(key) !== b.get(key));
  return sections.length ? { path, sections: sections.map(key => `[${key}]`) } : null;
}

const show = async (cwd, rev, path) => { const result = await git(cwd, ['show', `${rev}:./${path}`]); return result.ok ? result.stdout : null; };

/**
 * Audits the change between two trees of the project (`base` and `head`, as the loop's
 * snapshots or a ref and the working tree). Reads what the pure audit needs from git and disk.
 */
export async function auditIntegrity(cwd, { workCwd = cwd, base, head, diff, taskDir, subtask, settings = {}, config = {}, stack, gates = [], claim = {} }) {
  const level = settings.integrity?.level || 'standard';
  if (level === 'off') return { ok: true, level, findings: [], stats: {} };
  const scope = taskDir ? await declaredScope(taskDir, { subtask }) : { all: [], subtask: [], doNotTouch: [] };
  const rules = oracleRules({ protectedPaths: settings.protectedPaths || [], doNotTouch: scope.doNotTouch, verificationFiles: commandFiles({ config, stack, gates }) });
  const files = diff.truncated ? [] : parseDiff(diff.patch);
  const declared = new Set([...scope.all, ...scope.subtask]);
  // Existing tests may change when the task reaches them: declared, or importing declared code.
  const editable = new Set([...declared].filter(path => TEST.test(path)));
  const touched = files.filter(file => ['test', 'test-data'].includes(classifyPath(file.oldPath, rules)?.role) && ['modified', 'renamed'].includes(file.status) && !editable.has(file.oldPath));
  if (touched.length && declared.size) {
    const graph = await buildGraph(workCwd).catch(() => null);
    if (graph) for (const source of declared) impactOf(graph, source, 2).tests.forEach(test => editable.add(test));
  }
  const sectionChanges = [];
  for (const file of files.filter(item => ORACLE_SECTIONS.json[basename(item.newPath || '')] || ORACLE_SECTIONS.ini[basename(item.newPath || '')])) {
    const change = sectionChange(file.newPath, file.oldPath ? await show(workCwd, base, file.oldPath) : null, await show(workCwd, head, file.newPath));
    if (change) sectionChanges.push(change);
  }
  // Literals for the special-casing heuristic: from the tests, the code before, and the task's own docs.
  const testLiterals = new Set(), baseLiterals = new Map();
  for (const file of files.filter(item => classifyPath(item.newPath, rules)?.role === 'test')) file.hunks.forEach(hunk => [...hunk.added, ...hunk.context].forEach(item => literalsIn(item.text).forEach(value => testLiterals.add(value))));
  const sources = files.filter(item => item.newPath && !classifyPath(item.newPath, rules) && languageOf(item.newPath) && !isGenerated(item.newPath));
  for (const file of sources.slice(0, 30)) baseLiterals.set(file.newPath, literalsIn(file.oldPath ? await show(workCwd, base, file.oldPath) || '' : ''));
  const taskLiterals = new Set();
  if (taskDir) for (const name of ['PRD.md', 'SPEC.md', 'TECHSPEC.md']) literalsIn(await readFile(join(taskDir, name), 'utf8').catch(() => '')).forEach(value => taskLiterals.add(value));
  return auditDiff(files, { rules, level, severity: settings.integrity?.severity, allow: settings.integrity?.allow, numstat: diff.numstat, declared, editable, sectionChanges, testLiterals, baseLiterals, taskLiterals, claim, blastRadius: settings.blastRadius, truncated: diff.truncated });
}

/** INTEGRITY.md: what the guard found, and what it protects. */
export function renderIntegrityReport(task, report, { against, oracle } = {}) {
  const icon = { block: '✗', warn: '⚠' };
  const rows = report.findings.map(item => `- ${icon[item.severity]} **${item.kind}**${item.file ? ` \`${item.file}\`` : ''}: ${item.message}${item.excerpt ? `\n  \`${item.excerpt.replace(/`/g, "'")}\`` : ''}`).join('\n');
  return `# Integrity — ${task}\n\nGenerated: ${new Date().toISOString()}\nCompared with: ${against || 'the last checkpoint'} · level ${report.level}\nResult: ${report.ok ? 'no blocking finding' : `${report.findings.filter(item => item.severity === 'block').length} blocking finding(s)`}\n\n## Findings\n${rows || '- None: no test, check or configuration was weakened.'}\n${oracle ? `\n## What is protected\n${Object.entries(oracle.counts).map(([role, count]) => `- ${role}: ${count}`).join('\n') || '- nothing detected'}\n` : ''}\nA finding is evidence, not a verdict: a planned change to a check belongs in TECHSPEC.md (File References), and a human can allow it with \`loop.integrity.allow\`.\n`;
}
