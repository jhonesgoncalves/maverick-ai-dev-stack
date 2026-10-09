import { PERMISSIONS } from '../core/enums.js';
import { recommendedFor } from './stages.js';

export { PERMISSIONS };
const rank = level => PERMISSIONS.indexOf(level);

function matches(route, subtask) {
  const match = route.match || {};
  return Object.entries(match).every(([key, value]) => subtask?.[key] === value);
}

/**
 * Resolves which provider, model, reasoning effort and permission a run uses. Precedence:
 * command-line flags, then the first matching `runtime.routes` entry (by subtask
 * type/complexity), then `runtime.stages[stage]` (the workflow step's default), then
 * `runtime.default`. A model or effort from an entry only applies when that entry also
 * chose the provider; when none applies, Maverick's recommendation for the provider at
 * this stage fills in. Configuration is the ceiling: flags can lower permission but never
 * raise it above `runtime.maxPermission`, and only trusted providers can run.
 */
export function resolveRun(config, { provider, model, effort, permission, subtask, stage } = {}, providers = [], { checks = true } = {}) {
  const runtime = config.runtime || {};
  const route = (runtime.routes || []).find(item => matches(item, subtask));
  const step = stage ? runtime.stages?.[stage] : undefined;
  const chosen = provider || route?.provider || step?.provider || runtime.default?.provider;
  if (!chosen) throw new Error('no agent provider selected; pass --provider or set runtime.default.provider in .maverick/config.json');
  const definition = providers.find(item => item.id === chosen);
  if (!definition) throw new Error(`unknown provider ${chosen}; available: ${providers.map(item => item.id).join(', ')}`);
  const trusted = runtime.trusted || [];
  if (checks && !trusted.includes(chosen)) throw new Error(`provider ${chosen} is not trusted in this repository; review it, then run maverick agent trust ${chosen}`);
  const ceiling = runtime.maxPermission || 'edit';
  const requested = permission || route?.permission || step?.permission || runtime.defaultPermission || (rank(ceiling) < rank('edit') ? ceiling : 'edit');
  if (!PERMISSIONS.includes(requested)) throw new Error(`permission must be one of ${PERMISSIONS.join(', ')}`);
  if (checks && rank(requested) > rank(ceiling)) throw new Error(`permission ${requested} exceeds runtime.maxPermission (${ceiling}); raise it in .maverick/config.json only after review`);
  const support = definition.permissions?.[requested];
  if (checks && (support === false || typeof support === 'string')) throw new Error(`${definition.name} cannot run with ${requested} permission${typeof support === 'string' ? `: ${support}` : ''}`);
  // Entries that chose this provider, most specific first; the flag counts as one.
  const owners = [provider && { model, effort }, route?.provider === chosen && route, step && (step.provider || runtime.default?.provider) === chosen && step, runtime.default?.provider === chosen && runtime.default].filter(Boolean);
  const recommended = stage ? recommendedFor(definition, stage) : {};
  const pick = key => (key === 'model' ? model : effort) || owners.map(entry => entry[key]).find(Boolean);
  const chosenModel = pick('model') || recommended.model;
  let chosenEffort = pick('effort') || (chosenModel === recommended.model || !pick('model') ? recommended.effort : undefined);
  if (chosenEffort && !definition.efforts?.includes(chosenEffort)) {
    if (effort) throw new Error(`${definition.name} ${definition.efforts?.length ? `accepts reasoning ${definition.efforts.join(', ')}` : 'has no reasoning setting'}; got ${chosenEffort}`);
    chosenEffort = undefined;
  }
  return {
    provider: definition, permission: requested, model: chosenModel, effort: chosenEffort, stage,
    route: provider ? 'flag' : route ? `route ${JSON.stringify(route.match || {})}` : step?.provider ? `stage ${stage}` : 'default'
  };
}

/**
 * What a run of each workflow step uses when nothing is passed on the command line, for
 * showing and editing the defaults. Trust and permission are not checked here.
 */
export function stageDefaults(config, providers, stages) {
  return Object.fromEntries(stages.map(stage => {
    try {
      const plan = resolveRun(config, { stage }, providers, { checks: false }), step = config.runtime?.stages?.[stage] || {};
      return [stage, { provider: plan.provider.id, model: plan.model || null, effort: plan.effort || null, configured: Boolean(step.provider || step.model || step.effort) }];
    } catch { return [stage, { provider: null, model: null, effort: null, configured: false }]; }
  }));
}
