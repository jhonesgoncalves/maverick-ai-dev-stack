/** Portable permission levels, ordered from least to most capable. */
export const PERMISSIONS = ['read-only', 'edit', 'full'];
const rank = level => PERMISSIONS.indexOf(level);

function matches(route, subtask) {
  const match = route.match || {};
  return Object.entries(match).every(([key, value]) => subtask?.[key] === value);
}

/**
 * Resolves which provider, model and permission a run uses. Precedence: command-line
 * flags, then the first matching `runtime.routes` entry (by subtask type/complexity),
 * then `runtime.default`. Configuration is the ceiling: flags can lower permission but
 * never raise it above `runtime.maxPermission`, and only trusted providers can run.
 */
export function resolveRun(config, { provider, model, permission, subtask } = {}, providers = []) {
  const runtime = config.runtime || {};
  const route = (runtime.routes || []).find(item => matches(item, subtask));
  const chosen = provider || route?.provider || runtime.default?.provider;
  if (!chosen) throw new Error('no agent provider selected; pass --provider or set runtime.default.provider in .maverick/config.json');
  const definition = providers.find(item => item.id === chosen);
  if (!definition) throw new Error(`unknown provider ${chosen}; available: ${providers.map(item => item.id).join(', ')}`);
  const trusted = runtime.trusted || [];
  if (!trusted.includes(chosen)) throw new Error(`provider ${chosen} is not trusted in this repository; review it, then run maverick agent trust ${chosen}`);
  const ceiling = runtime.maxPermission || 'edit';
  const requested = permission || route?.permission || runtime.defaultPermission || (rank(ceiling) < rank('edit') ? ceiling : 'edit');
  if (!PERMISSIONS.includes(requested)) throw new Error(`permission must be one of ${PERMISSIONS.join(', ')}`);
  if (rank(requested) > rank(ceiling)) throw new Error(`permission ${requested} exceeds runtime.maxPermission (${ceiling}); raise it in .maverick/config.json only after review`);
  const support = definition.permissions?.[requested];
  if (support === false || typeof support === 'string') throw new Error(`${definition.name} cannot run with ${requested} permission${typeof support === 'string' ? `: ${support}` : ''}`);
  return {
    provider: definition, permission: requested,
    // A route's or default's model only applies when that entry also chose this provider.
    model: model || (route?.provider === chosen ? route.model : undefined) || (runtime.default?.provider === chosen ? runtime.default.model : undefined),
    route: provider ? 'flag' : route ? `route ${JSON.stringify(route.match || {})}` : 'default'
  };
}
