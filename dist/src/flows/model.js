import { readdir, readFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { z } from 'zod';
import { PLANNING_STAGES } from '../core/presets.js';
import { CHECK_KINDS } from '../core/stack.js';
import { EFFORTS } from '../core/enums.js';
import { packageRoot } from '../core/util.js';
import { sha256 } from '../capabilities/model.js';

/**
 * Maverick gates a flow can call. Each maps to a CLI command run in-process with --json: `pr` keeps
 * or writes PR-DRAFT.md, and `pr-open` (`pr open`) pushes the branch and opens the pull request.
 */
export const MAVERICK_GATES = ['validate', 'verify', 'guard', 'integrity', 'security', 'deps', 'policy', 'review', 'readiness', 'pr', 'pr-open'];

/** Outcomes of one flow run. Only `revise` asks the agent to iterate; the others hand control to a human. */
export const OUTCOMES = ['done', 'revise', 'awaiting-approval', 'stalled', 'exhausted'];
/** A gate result's status. `skipped` is a judge that did not run because a blocking gate before it failed. */
export const GATE_STATUSES = ['pass', 'fail', 'pending', 'skipped'];
export const TERMINAL = ['stalled', 'exhausted'];

const id = z.string().regex(/^[a-z0-9][a-z0-9-]{0,40}$/, 'use a lowercase kebab-case id');
const base = { id, description: z.string().optional(), severity: z.enum(['block', 'warn']).default('block') };

// Gates are typed objects, never free text, so every criterion is checkable.
const judge = z.object({
  ...base, type: z.literal('judge'),
  // What the judge decides: inline criteria, a file in the task, or (by default) the acceptance criteria.
  rubric: z.union([z.array(z.union([z.string().min(3), z.object({ id: z.string().regex(/^[A-Z][A-Z0-9-]{1,20}$/), text: z.string().min(3), required: z.boolean().default(true) })])).min(1), z.object({ file: z.string().min(1) })]).optional(),
  scope: z.enum(['auto', 'task', 'rubric']).default('auto'),
  provider: z.string().optional(), model: z.string().optional(), effort: z.enum(EFFORTS).optional(),
  threshold: z.number().min(0).max(1).default(0.7),
  tiebreak: z.boolean().default(true),
  quorum: z.union([z.literal(1), z.literal(2)]).default(1),
  independence: z.enum(['cross-family', 'cross-provider']).default('cross-family'),
  when: z.enum(['gates-pass', 'always']).default('gates-pass'),
  maxDiffBytes: z.number().int().min(4096).max(200000).default(60000),
  timeoutMinutes: z.number().positive().max(120).optional()
});

/** A judge gate with every default filled in, for loops that add one when `--judge` is on. */
export const judgeGate = (overrides = {}) => judge.parse({ id: 'judge', type: 'judge', description: 'An independent model from another family judges the change against its criteria.', ...overrides });

const gate = z.discriminatedUnion('type', [
  z.object({ ...base, type: z.literal('check'), kinds: z.array(z.enum(CHECK_KINDS)).optional() }),
  // `stage` limits `validate` to the planning stages up to it, e.g. a spec gate before the technical spec exists.
  z.object({ ...base, type: z.literal('maverick'), run: z.enum(MAVERICK_GATES), stage: z.enum(PLANNING_STAGES).optional() }),
  z.object({ ...base, type: z.literal('command'), run: z.string().min(1), cwd: z.string().optional() }),
  z.object({ ...base, type: z.literal('artifact'), file: z.string().min(1), sections: z.array(z.string()).default([]), pattern: z.string().optional(), noPlaceholders: z.boolean().default(false) }),
  // An approval is recorded with `maverick flow approve`, or found in a task file (e.g. a checked box in REVIEW.md).
  z.object({ ...base, type: z.literal('approval'), prompt: z.string().min(1), file: z.string().optional(), pattern: z.string().optional() }),
  // An independent agent from another model family decides the criteria; see src/flows/judge.js.
  judge
]);

export const flowSchema = z.object({
  apiVersion: z.literal('maverick.flow/v1'),
  name: id,
  description: z.string().min(10),
  contract: z.object({
    goal: z.string().min(1),
    iterationCap: z.number().int().min(1).max(20).default(3),
    noProgressWindow: z.number().int().min(2).max(10).default(2)
  }),
  gates: z.array(gate).min(1)
}).superRefine((flow, ctx) => {
  const seen = new Set();
  flow.gates.forEach((item, index) => {
    if (seen.has(item.id)) ctx.addIssue({ code: 'custom', path: ['gates', index, 'id'], message: `duplicate gate id "${item.id}"` });
    seen.add(item.id);
  });
});

function formatIssues(error) { return error.issues.map(issue => `${issue.path.join('.') || '(root)'}: ${issue.message}`).join('; '); }

export async function loadFlowFile(path, source) {
  const text = await readFile(path, 'utf8');
  let data;
  try { data = parseYaml(text); } catch (error) { throw new Error(`${path}: invalid YAML (${error.message})`); }
  const parsed = flowSchema.safeParse(data);
  if (!parsed.success) throw new Error(`${path}: ${formatIssues(parsed.error)}`);
  if (parsed.data.name !== basename(path).replace(/\.ya?ml$/, '')) throw new Error(`${path}: name "${parsed.data.name}" must match the file name`);
  return { ...parsed.data, source, path, integrity: sha256(text) };
}

/** Project flows in `.maverick/flows/` shadow built-in flows with the same name. */
export async function loadFlows(cwd) {
  const flows = new Map(), errors = [];
  for (const [source, dir] of [['project', join(cwd, '.maverick', 'flows')], ['built-in', join(packageRoot, 'flows')]]) {
    for (const file of (await readdir(dir).catch(() => [])).filter(name => /\.ya?ml$/.test(name)).sort()) {
      try {
        const flow = await loadFlowFile(join(dir, file), source);
        if (!flows.has(flow.name)) flows.set(flow.name, flow);
      } catch (error) { errors.push({ source, file, message: error.message.replace(`${join(dir, file)}: `, '') }); }
    }
  }
  return { flows: [...flows.values()], errors };
}

export async function findFlow(cwd, name) {
  const { flows, errors } = await loadFlows(cwd);
  const flow = flows.find(item => item.name === name);
  if (flow) return flow;
  const broken = errors.find(error => error.file.replace(/\.ya?ml$/, '') === name);
  if (broken) throw new Error(`flow ${name} is invalid: ${broken.message}`);
  throw new Error(`flow not found: ${name || '(none)'}; available: ${flows.map(item => item.name).join(', ') || 'none'}`);
}

export function interpolate(text, vars) { return text.replace(/\{\{\s*(\w+)\s*\}\}/g, (match, key) => vars[key] ?? match); }
