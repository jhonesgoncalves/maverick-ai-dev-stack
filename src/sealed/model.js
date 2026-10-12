import { randomBytes } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import { sha256 } from '../capabilities/model.js';
import { criteriaOf } from '../core/quality.js';
import { pretty, sectionBody } from '../core/util.js';
import { canonical } from '../loop/ledger.js';
import { vaultRoot } from './vault.js';

// Sealed tests: acceptance tests the builder never sees. Another model family (or a human)
// writes them from the PRD's criteria and the SPEC's scenarios before the build; Maverick
// encrypts them out of the work tree and runs them only in exports, at milestones. The loop
// is done only when they pass too; when they do not, the overfitting index (what the visible
// checks promise beyond what the hidden tests confirm) goes to a human.
//
// The task keeps SEALED.json: digests, counts and the decision, never a path, a test name or
// a line of test code. Everything else lives in the vault.

export const SEALED_SCHEMA = 'maverick.sealed/v1';
export const BUNDLE_SCHEMA = 'maverick.sealed-bundle/v1';
export const SEAL_SCHEMA = 'maverick.seal/v1';
export const SEAL_ID = /^\d{8}-\d{6}-[0-9a-f]{4}$/;
export const SURFACES = ['spec', 'techspec', 'boundary'];
export const SEALED_FEEDBACK = ['none', 'count', 'ac'];

export const SEALED_DEFAULTS = {
  surface: 'spec',
  // What the builder learns from the holdout: nothing (the default), a count, or the criteria it missed.
  feedback: 'none',
  threshold: 1,
  // `milestones`: queried at the baseline, when a subtask is done (up to maxQueries) and at done; `done`: only at done.
  when: 'milestones',
  maxQueries: 6,
  timeoutMinutes: 20,
  requireApproval: true,
  encryption: { key: 'file' },
  sealer: {}
};

/** The `sealed` settings: defaults < `config.sealed`. */
export function sealedSettings(config = {}) {
  const sealed = config.sealed || {};
  return { ...SEALED_DEFAULTS, ...sealed, encryption: { ...SEALED_DEFAULTS.encryption, ...sealed.encryption }, sealer: { ...sealed.sealer } };
}

const relativePath = z.string().min(1).max(300).refine(value => !value.startsWith('/') && !value.split(/[\\/]/).includes('..') && !value.split(/[\\/]/).includes('.maverick') && !/^[a-zA-Z]:/.test(value), 'must be a project-relative path outside .maverick/');

export const bundleSchema = z.object({
  schema: z.literal(BUNDLE_SCHEMA).default(BUNDLE_SCHEMA),
  files: z.array(z.object({ path: relativePath, role: z.enum(['test', 'test-data']).default('test'), content: z.string().max(400000) })).min(1).max(50),
  tests: z.array(z.object({
    id: z.string().regex(/^ST-\d{2,3}$/, 'sealed test ids look like ST-01'),
    file: z.number().int().min(0),
    name: z.string().min(1).max(300),
    // `case`: the result of the runner's test case with this name; `file`: the result of the whole file (one test per file).
    match: z.enum(['case', 'file']).default('case'),
    ids: z.array(z.string().regex(/^(AC|SC)-\d{2,3}$/)).min(1).max(20),
    kind: z.enum(['behavior', 'error', 'regression']).default('behavior')
  })).min(1).max(200)
});

/** Validates a bundle against the task's criteria: every test names a file of the bundle and criteria that exist. */
export function checkBundle(raw, criteria) {
  const parsed = bundleSchema.safeParse(raw);
  if (!parsed.success) return { problems: parsed.error.issues.map(issue => `${issue.path.join('.') || 'bundle'}: ${issue.message}`) };
  const bundle = parsed.data, known = new Set(criteria.map(item => item.id)), problems = [];
  const paths = bundle.files.map(file => file.path);
  if (new Set(paths).size !== paths.length) problems.push('two files have the same path');
  if (new Set(bundle.tests.map(test => test.id)).size !== bundle.tests.length) problems.push('two tests have the same id');
  for (const test of bundle.tests) {
    if (!bundle.files[test.file] || bundle.files[test.file].role !== 'test') problems.push(`${test.id}: file ${test.file} is not a test file of the bundle`);
    for (const id of test.ids) if (!known.has(id)) problems.push(`${test.id}: ${id} is not a criterion of this task`);
  }
  return { bundle, problems };
}

/** `20261012-101500-9f2c`: sortable by time, unique within a second. */
export function newSealId(now = new Date()) { return `${now.toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15)}-${randomBytes(2).toString('hex')}`; }

/** Where a seal lives in the vault. */
export function sealPaths(cwd, task, sealId) {
  const root = vaultRoot(cwd, task), dir = join(root, sealId);
  return { root, dir, ledger: join(dir, 'ledger.jsonl'), suite: join(dir, 'suite.enc'), base: join(dir, 'base.enc'), results: join(dir, 'results'), transcripts: join(dir, 'transcripts') };
}

/** The associated data that binds an encrypted file to its seal and role. */
export const aad = (sealId, role) => `${SEAL_SCHEMA}\0${sealId}\0${role}`;

export const suiteDigest = bundle => sha256(canonical(bundle));

const unticked = text => String(text).replace(/\[[xX ]\]/g, '[ ]').replace(/[ \t]+$/gm, '');

/**
 * Hashes of what the tests were written from: the PRD's acceptance criteria (ids and text, not
 * whether their boxes are ticked) and the SPEC's behavior (not its approval box). A seal whose
 * sources changed is stale and must be redone.
 */
export async function sourceHashes(taskDir) {
  const [prd, spec] = await Promise.all(['PRD.md', 'SPEC.md'].map(name => readFile(join(taskDir, name), 'utf8').catch(() => '')));
  return { prd: sha256(canonical(criteriaOf(prd, '').map(item => [item.id, item.text]))), spec: spec ? sha256(unticked(['Behavior', 'Contracts', 'States and Data', 'Invariants', 'Errors'].map(name => sectionBody(spec, name)).join('\n\0\n'))) : null };
}

export async function taskCriteria(taskDir) {
  const [prd, spec] = await Promise.all(['PRD.md', 'SPEC.md'].map(name => readFile(join(taskDir, name), 'utf8').catch(() => '')));
  return criteriaOf(prd, spec);
}

export const sealedPath = taskDir => join(taskDir, 'SEALED.json');
export async function readSealed(taskDir) { try { return JSON.parse(await readFile(sealedPath(taskDir), 'utf8')); } catch { return null; } }
export async function writeSealed(taskDir, sealed) { await writeFile(sealedPath(taskDir), pretty(sealed)); }

/**
 * Whether a task's seal can decide a loop: `ready`, or why not (`stale` sources, `unapproved`,
 * `committed` or `discarded` by a human, `missing`).
 */
export async function sealReadiness(taskDir, settings) {
  const sealed = await readSealed(taskDir);
  if (!sealed) return { state: 'missing', sealed: null };
  if (sealed.status === 'committed' || sealed.status === 'discarded') return { state: sealed.status, sealed };
  const now = await sourceHashes(taskDir);
  if (now.prd !== sealed.sources?.prd || (sealed.sources?.spec || null) !== now.spec) return { state: 'stale', sealed, detail: 'PRD.md acceptance criteria or SPEC.md behavior changed since the seal; run maverick seal again' };
  if (settings.requireApproval && !sealed.approval) return { state: 'unapproved', sealed, detail: `a human approves the sealed suite first: maverick seal approve ${sealed.task}` };
  return { state: 'ready', sealed };
}
