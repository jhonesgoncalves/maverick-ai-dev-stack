import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { isAbsolute, join } from 'node:path';
import { z } from 'zod';
import { PRESET_IDS } from './presets.js';
import { CHECK_KINDS } from './stack.js';
import { AGENT_STAGE_IDS, EFFORTS, FINDING_KINDS, GIT_PROVIDERS, HOOK_EVENTS, INTEGRITY_LEVELS, LOOP_ISOLATION, LOOP_LADDER_STEPS, PERMISSIONS } from './enums.js';
import { exists, rel } from './util.js';

export const defaultConfig = {
  version: 1,
  project: { name: '', language: '', framework: '' },
  workflow: { default: 'standard' },
  language: { docs: 'en', code: 'en' },
  adapter: 'generic',
  taskRoot: '.maverick/tasks'
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
  // `default` is the workflow for new tasks; `maverick new` picks strict for high-risk ideas anyway.
  workflow: z.looseObject({ default: z.enum(PRESET_IDS) }),
  adapter: z.string().min(1),
  taskRoot: projectPath,
  defaultVerification: z.array(z.string()).optional(),
  maxChangedFilesGuideline: z.number().int().positive().optional(),
  verification: z.object({
    commands: z.array(verificationCommand).optional(),
    kinds: z.array(z.enum(CHECK_KINDS)).optional(),
    subprojects: z.enum(['auto', 'always', 'never']).optional(),
    // How to run chosen test files (ablation, sealed tests): the first runner whose glob matches a file runs it.
    runners: z.array(z.object({
      name: z.string().min(1).optional(),
      match: z.union([z.string().min(1), z.array(z.string().min(1)).min(1)]),
      run: z.string().min(1).refine(value => /\{(files?|dir|name)\}/.test(value), 'must name the test with {files}, {file}, {dir} or {name}'),
      cwd: projectPath.optional()
    })).optional()
  }).optional(),
  capabilities: z.object({
    targets: z.array(z.string().min(1)).optional(),
    catalogs: z.array(z.string().min(1)).optional(),
    // linked: one copy in .agents/, symlinked into each tool; copy: each tool gets its own files.
    layout: z.enum(['linked', 'copy']).optional()
  }).optional(),
  // Agent runtime. This file is the trust boundary: flags can lower permissions, never raise them.
  runtime: z.object({
    trusted: z.array(z.string().min(1)).optional(),
    maxPermission: z.enum(PERMISSIONS).optional(),
    defaultPermission: z.enum(PERMISSIONS).optional(),
    default: z.object({ provider: z.string().min(1), model: z.string().optional(), effort: z.enum(EFFORTS).optional() }).optional(),
    routes: z.array(z.object({
      match: z.object({ type: z.string().optional(), complexity: z.enum(['low', 'medium', 'high']).optional() }),
      provider: z.string().min(1), model: z.string().optional(), effort: z.enum(EFFORTS).optional(), permission: z.enum(PERMISSIONS).optional()
    })).optional(),
    // Per workflow step: which agent, model and reasoning effort a run of that step uses by default.
    stages: z.partialRecord(z.enum(AGENT_STAGE_IDS), z.object({ provider: z.string().min(1).optional(), model: z.string().min(1).optional(), effort: z.enum(EFFORTS).optional(), permission: z.enum(PERMISSIONS).optional() })).optional(),
    timeoutMinutes: z.number().positive().max(24 * 60).optional(),
    bins: z.record(z.string(), z.string().min(1)).optional(),
    // The model family of a provider whose CLI can run several vendors' models (judges and loops need it).
    families: z.record(z.string(), z.string().regex(/^[a-z0-9-]+$/)).optional(),
    // USD per million tokens, by model or provider id: the cost of runs whose provider reports tokens but no cost.
    prices: z.record(z.string(), z.object({ input: z.number().min(0), output: z.number().min(0), cachedInput: z.number().min(0).optional() })).optional(),
    custom: z.array(z.object({
      id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/), name: z.string().optional(),
      command: z.string().min(1), permissions: z.array(z.enum(PERMISSIONS)).optional()
    })).optional()
  }).optional(),
  // Flows that approve their own pending approval gates once every blocking check passes.
  flows: z.object({ autoApprove: z.array(z.string().min(1)).optional() }).optional(),
  // Pull requests the `pr` flow opens: the provider when the remote's host does not say, the remote
  // and base branch when they cannot be inferred, draft pull requests, and whether to commit the change.
  pr: z.object({
    provider: z.enum(GIT_PROVIDERS).optional(),
    remote: z.string().min(1).optional(),
    base: z.string().min(1).optional(),
    draft: z.boolean().optional(),
    commit: z.boolean().optional()
  }).optional(),
  // Loops: budgets, escalation and guardrails for `maverick loop run`. Defaults live in src/loop/model.js.
  loop: z.object({
    flow: z.string().min(1).optional(),
    providers: z.array(z.string().min(1)).optional(),
    isolation: z.enum(LOOP_ISOLATION).optional(),
    worktreeDir: z.string().min(1).optional(),
    setup: z.array(z.string().min(1)).optional(),
    setupTimeoutMinutes: z.number().positive().max(240).optional(),
    budgets: z.object({
      maxIterations: z.number().int().min(1).max(500).optional(),
      maxMinutes: z.number().positive().max(7 * 24 * 60).optional(),
      maxCostUsd: z.number().positive().optional(),
      maxTokens: z.number().int().positive().optional(),
      forecast: z.enum(['p90', 'mean', 'off']).optional()
    }).optional(),
    stall: z.object({
      window: z.number().int().min(2).max(10).optional(),
      churnLines: z.number().int().positive().optional(),
      rollbackStreak: z.number().int().min(2).max(10).optional(),
      overclaims: z.number().int().min(1).max(10).optional()
    }).optional(),
    escalation: z.array(z.enum(LOOP_LADDER_STEPS)).min(1).optional(),
    maxEffort: z.enum(EFFORTS).optional(),
    protectedPaths: z.array(z.string().min(1)).optional(),
    blastRadius: z.object({ maxFiles: z.number().int().positive().optional(), maxLines: z.number().int().positive().optional() }).optional(),
    integrity: z.union([z.enum(INTEGRITY_LEVELS), z.object({
      level: z.enum(INTEGRITY_LEVELS).optional(),
      severity: z.partialRecord(z.enum(FINDING_KINDS), z.enum(['block', 'warn', 'off'])).optional(),
      allow: z.array(z.object({ kind: z.enum(FINDING_KINDS), path: z.string().min(1), reason: z.string().min(1) })).optional()
    })]).optional(),
    ratchet: z.object({ newFailures: z.enum(['count', 'strict']).optional(), recheck: z.number().int().min(0).max(3).optional() }).optional(),
    gateTimeoutMinutes: z.number().positive().max(24 * 60).optional(),
    stopPollMs: z.number().int().min(50).max(10000).optional(),
    judge: z.object({
      enabled: z.boolean().optional(),
      prefer: z.array(z.string().min(1)).optional(),
      // Judges always work in an export; `live` is accepted for older configurations and warned about.
      isolation: z.enum(['export', 'live']).optional()
    }).optional(),
    // What the next agent learns from a rejection or a verdict (also for flow run --agent fixes).
    feedback: z.enum(['detailed', 'criteria', 'generic']).optional(),
    // Whether a task's sealed tests decide its loop: when ready (auto), always (required), or never (off).
    sealed: z.enum(['auto', 'required', 'off']).optional()
  }).optional(),
  // Sealed tests: acceptance tests the builder never sees (maverick seal). Defaults live in src/sealed/model.js.
  sealed: z.object({
    surface: z.enum(['spec', 'techspec', 'boundary']).optional(),
    feedback: z.enum(['none', 'count', 'ac']).optional(),
    threshold: z.number().min(0).max(1).optional(),
    when: z.enum(['milestones', 'done']).optional(),
    maxQueries: z.number().int().min(1).max(50).optional(),
    timeoutMinutes: z.number().positive().max(240).optional(),
    requireApproval: z.boolean().optional(),
    encryption: z.object({ key: z.enum(['file', 'env', 'command']).optional(), command: z.string().min(1).optional() }).optional(),
    sealer: z.object({ provider: z.string().min(1).optional(), model: z.string().min(1).optional(), effort: z.enum(EFFORTS).optional(), prefer: z.array(z.string().min(1)).optional() }).optional()
  }).optional(),
  // Languages: `docs` for what the flow writes and says, `code` for what lands in the codebase.
  language: z.object({ docs: z.string().regex(/^[a-z]{2,3}(-[A-Z]{2,4})?$/, 'use a language code such as en or pt-BR').optional(), code: z.string().regex(/^[a-z]{2,3}(-[A-Z]{2,4})?$/, 'use a language code such as en or pt-BR').optional() }).optional(),
  // Authoring: project context and per-artifact rules given to every agent that writes task artifacts.
  authoring: z.object({
    context: z.string().max(50000).optional(),
    rules: z.partialRecord(z.enum(['PRD', 'TECHSPEC', 'TASKS']), z.array(z.string().min(1))).optional()
  }).optional(),
  // Architecture intelligence: component boundaries and rules checked on every import.
  architecture: z.object({
    components: z.array(z.string().min(1)).optional(),
    depth: z.number().int().positive().max(12).optional(),
    maxComponents: z.number().int().min(2).max(200).optional(),
    rules: z.array(z.object({ from: z.string().min(1), disallow: z.array(z.string().min(1)).min(1), allow: z.array(z.string().min(1)).optional(), reason: z.string().optional() })).optional(),
    // The architecture gate fails a change that lowers health by more than this many points.
    maxHealthDrop: z.number().min(0).max(100).optional()
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
