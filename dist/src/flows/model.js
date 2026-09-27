import { readdir, readFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { z } from 'zod';
import { CHECK_KINDS } from '../core/stack.js';
import { packageRoot } from '../core/util.js';
import { sha256 } from '../capabilities/model.js';

/** Maverick gates a flow can call. Each maps to a CLI command run in-process with --json. */
export const MAVERICK_GATES = ['validate', 'verify', 'guard', 'security', 'deps', 'policy', 'review', 'readiness'];

/** Outcomes of one flow run. Only `revise` asks the agent to iterate; the others hand control to a human. */
export const OUTCOMES = ['done', 'revise', 'awaiting-approval', 'stalled', 'exhausted'];
export const TERMINAL = ['stalled', 'exhausted'];

const id = z.string().regex(/^[a-z0-9][a-z0-9-]{0,40}$/, 'use a lowercase kebab-case id');
const base = { id, description: z.string().optional(), severity: z.enum(['block', 'warn']).default('block') };

// Gates are typed objects, never free text, so every criterion is checkable.
const gate = z.discriminatedUnion('type', [
  z.object({ ...base, type: z.literal('check'), kinds: z.array(z.enum(CHECK_KINDS)).optional() }),
  z.object({ ...base, type: z.literal('maverick'), run: z.enum(MAVERICK_GATES) }),
  z.object({ ...base, type: z.literal('command'), run: z.string().min(1), cwd: z.string().optional() }),
  z.object({ ...base, type: z.literal('artifact'), file: z.string().min(1), sections: z.array(z.string()).default([]), pattern: z.string().optional(), noPlaceholders: z.boolean().default(false) }),
  // An approval is recorded with `maverick flow approve`, or found in a task file (e.g. a checked box in REVIEW.md).
  z.object({ ...base, type: z.literal('approval'), prompt: z.string().min(1), file: z.string().optional(), pattern: z.string().optional() })
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
