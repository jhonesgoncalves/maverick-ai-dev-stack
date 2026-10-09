import { commandAvailable } from '../core/util.js';
import { runProcess } from './process.js';
import { resolveBin } from './providers.js';
import { RECOMMENDED } from './stages.js';

const cache = new Map();
const TTL = 10 * 60 * 1000;

/**
 * The models a provider offers. Providers that can list them (Codex, Antigravity, Kiro) are
 * asked on this machine, so the list matches the user's account; the result is cached for
 * ten minutes. Otherwise, or when listing fails, the provider's suggested names and the
 * models Maverick recommends for it are returned. A model is always free text: any id the
 * CLI accepts works, listed or not.
 */
export async function listModels(provider, config, cwd) {
  const recommended = [...new Set(Object.values(RECOMMENDED[provider.id] || {}).map(entry => entry.model).filter(Boolean))];
  const fallback = { source: 'suggested', models: [...new Set([...recommended, ...(provider.models?.suggested || [])])].map(id => ({ id })) };
  const bin = resolveBin(provider, config, cwd);
  if (!provider.models?.list || !commandAvailable(bin, cwd)) return fallback;
  const key = `${provider.id}:${bin}:${cwd}`, hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return hit.value;
  let text = '';
  const result = await runProcess({ bin, args: provider.models.list, cwd, timeoutMs: 20000, onLine: line => { text += `${line}\n`; } });
  let value = fallback;
  try { if (result.code === 0) { const models = provider.models.parse(text); if (models.length) value = { source: 'cli', models }; } } catch { /* keep the fallback */ }
  cache.set(key, { at: Date.now(), value });
  return value;
}
