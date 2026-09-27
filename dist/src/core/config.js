import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { isAbsolute, join } from 'node:path';
import { z } from 'zod';
import { PRESET_IDS } from './presets.js';
import { CHECK_KINDS } from './stack.js';
import { HOOK_EVENTS, PERMISSIONS } from './enums.js';
import { exists, rel } from './util.js';

export const defaultConfig = {
  version: 1,
  project: { name: '', language: '', framework: '' },
  workflow: { requirePlan: true, requireReview: true, requireTests: true, defaultPreset: 'standard' },
  adapter: 'generic',
  taskRoot: '.maverick/tasks',
  requiredTaskSections: ['Problem', 'Goal', 'Acceptance Criteria', 'In Scope', 'Out of Scope', 'Verification'],
  requiredContextSections: ['Architecture Summary', 'Relevant Paths', 'Constraints', 'Do Not Touch', 'Commands']
};

const projectPath = z.string().min(1).refine(value => !isAbsolute(value) && !value.split(/[\\/]/).includes('..'), 'must be a project-relative path without ".."');
const verificationCommand = z.union([
  z.string().min(1),
  z.object({ name: z.string().min(1), command: z.string().min(1), cwd: projectPath.optional() })
]);

// Unknown keys are kept so newer configs keep working with older CLIs.
export const configSchema = z.looseObject({
  version: z.number().int().positive(),
  project: z.looseObject({ name: z.string(), language: z.string(), framework: z.string() }),
  workflow: z.looseObject({
    requirePlan: z.boolean(), requireReview: z.boolean(), requireTests: z.boolean(),
    defaultPreset: z.enum(PRESET_IDS), riskDocumentation: z.boolean().optional()
  }),
  adapter: z.string().min(1),
  taskRoot: projectPath,
  requiredTaskSections: z.array(z.string()),
  requiredContextSections: z.array(z.string()),
  defaultVerification: z.array(z.string()).optional(),
  maxChangedFilesGuideline: z.number().int().positive().optional(),
  verification: z.object({
    commands: z.array(verificationCommand).optional(),
    kinds: z.array(z.enum(CHECK_KINDS)).optional(),
    subprojects: z.enum(['auto', 'always', 'never']).optional()
  }).optional(),
  capabilities: z.object({
    targets: z.array(z.string().min(1)).optional(),
    catalogs: z.array(z.string().min(1)).optional()
  }).optional(),
  // Agent runtime. This file is the trust boundary: flags can lower permissions, never raise them.
  runtime: z.object({
    trusted: z.array(z.string().min(1)).optional(),
    maxPermission: z.enum(PERMISSIONS).optional(),
    defaultPermission: z.enum(PERMISSIONS).optional(),
    default: z.object({ provider: z.string().min(1), model: z.string().optional() }).optional(),
    routes: z.array(z.object({
      match: z.object({ type: z.string().optional(), complexity: z.enum(['low', 'medium', 'high']).optional() }),
      provider: z.string().min(1), model: z.string().optional(), permission: z.enum(PERMISSIONS).optional()
    })).optional(),
    timeoutMinutes: z.number().positive().max(24 * 60).optional(),
    bins: z.record(z.string(), z.string().min(1)).optional(),
    custom: z.array(z.object({
      id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/), name: z.string().optional(),
      command: z.string().min(1), permissions: z.array(z.enum(PERMISSIONS)).optional()
    })).optional()
  }).optional(),
  hooks: z.array(z.object({ event: z.enum(HOOK_EVENTS), run: z.string().min(1), cwd: projectPath.optional(), timeoutMs: z.number().int().positive().optional(), description: z.string().optional() })).optional()
});

const isPlainObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);

/** Deep-merges plain objects; arrays and scalars from later layers replace earlier ones. */
export function mergeConfig(...layers) {
  return layers.reduce((merged, layer) => {
    const next = { ...merged };
    for (const [key, value] of Object.entries(layer || {})) next[key] = isPlainObject(value) && isPlainObject(merged[key]) ? mergeConfig(merged[key], value) : value;
    return next;
  }, {});
}

export function globalConfigPath() { return join(process.env.MAVERICK_HOME || join(homedir(), '.maverick'), 'config.json'); }

async function readLayer(path) {
  try { return JSON.parse(await readFile(path, 'utf8')); } catch (error) { throw new Error(`invalid JSON in ${path}: ${error.message}`); }
}

function formatIssues(error) { return error.issues.map(issue => `${issue.path.join('.') || '(root)'}: ${issue.message}`).join('; '); }

/**
 * Resolves configuration in layers: built-in defaults < global (~/.maverick/config.json,
 * or $MAVERICK_HOME) < project (.maverick/config.json, falling back to legacy maverick.config.json).
 */
export async function resolveConfig(cwd) {
  const layers = [{ scope: 'defaults', path: null, values: defaultConfig }];
  const global = globalConfigPath();
  if (await exists(global)) layers.push({ scope: 'global', path: global, values: await readLayer(global) });
  const canonical = join(cwd, '.maverick', 'config.json'), legacy = join(cwd, 'maverick.config.json');
  const project = await exists(canonical) ? canonical : await exists(legacy) ? legacy : null;
  if (project) layers.push({ scope: 'project', path: project, values: await readLayer(project) });
  const merged = mergeConfig(...layers.map(layer => layer.values));
  const parsed = configSchema.safeParse(merged);
  const sources = layers.map(({ scope, path }) => ({ scope, path: path && (scope === 'project' ? rel(cwd, path) : path) }));
  if (!parsed.success) {
    const where = sources.filter(source => source.path).map(source => source.path).join(', ') || 'defaults';
    const error = new Error(`invalid configuration (${where}): ${formatIssues(parsed.error)}`);
    error.issues = parsed.error.issues; error.sources = sources;
    throw error;
  }
  return { config: parsed.data, sources };
}

export async function loadConfig(cwd) { return (await resolveConfig(cwd)).config; }
