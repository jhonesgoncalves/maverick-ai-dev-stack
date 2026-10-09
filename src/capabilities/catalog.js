import { readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { packageRoot, rel } from '../core/util.js';
import { ENTRY_FILES, loadCapability } from './model.js';

const entryNames = new Set(Object.values(ENTRY_FILES));

async function capabilityDirs(root, depth = 0) {
  const entries = await readdir(root, { withFileTypes: true }).catch(() => []);
  if (entries.some(entry => entry.isFile() && entryNames.has(entry.name))) return [root];
  if (depth >= 4) return [];
  const nested = await Promise.all(entries.filter(entry => entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules').map(entry => capabilityDirs(join(root, entry.name), depth + 1)));
  return nested.flat();
}

/**
 * Catalog roots in precedence order: the project's own `.maverick/capabilities`, then
 * `capabilities.catalogs` from configuration, then the catalog bundled with Maverick.
 */
export function catalogRoots(cwd, config = {}) {
  return [
    { source: 'project', path: join(cwd, '.maverick', 'capabilities') },
    ...(config.capabilities?.catalogs || []).map(path => ({ source: `catalog:${path}`, path: resolve(cwd, path) })),
    { source: 'built-in', path: join(packageRoot, 'capabilities') }
  ];
}

/**
 * Loads every capability. Higher-precedence roots shadow lower ones with the same ref;
 * shadowed entries are reported instead of silently merged. Invalid entries are
 * collected as errors so one broken capability never hides the rest.
 */
export async function loadCatalog(cwd, config = {}) {
  const capabilities = new Map(), shadowed = [], errors = [];
  for (const root of catalogRoots(cwd, config)) {
    for (const dir of await capabilityDirs(root.path)) {
      try {
        const capability = await loadCapability(dir, root.source);
        if (capabilities.has(capability.ref)) shadowed.push({ ref: capability.ref, source: root.source, by: capabilities.get(capability.ref).source });
        else capabilities.set(capability.ref, capability);
      } catch (error) { errors.push({ path: rel(cwd, dir), source: root.source, message: error.message.replace(`${dir}/`, '').replace(`${dir}: `, '') }); }
    }
  }
  return { capabilities: [...capabilities.values()].sort((a, b) => a.ref.localeCompare(b.ref)), shadowed, errors };
}

/** Resolves `reviewer` or `agent/reviewer` to one capability, with a helpful error when ambiguous. */
export function findCapability(catalog, reference) {
  if (!reference || reference === true) throw new Error('name a capability, for example: maverick add agent/reviewer');
  const exact = catalog.capabilities.find(item => item.ref === reference);
  if (exact) return exact;
  const byName = catalog.capabilities.filter(item => item.name === reference);
  if (byName.length === 1) return byName[0];
  if (byName.length > 1) throw new Error(`"${reference}" is ambiguous; use one of: ${byName.map(item => item.ref).join(', ')}`);
  const similar = catalog.capabilities.filter(item => item.name.includes(reference) || reference.includes(item.name)).map(item => item.ref);
  throw new Error(`capability not found: ${reference}${similar.length ? `; did you mean ${similar.slice(0, 5).join(', ')}?` : '; run maverick catalog to list available capabilities'}`);
}

export function searchCatalog(catalog, query = '') {
  const terms = String(query).toLowerCase().split(/\s+/).filter(Boolean);
  return catalog.capabilities.filter(item => terms.every(term => `${item.ref} ${item.description} ${item.tags.join(' ')}`.toLowerCase().includes(term)));
}
