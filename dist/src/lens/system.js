import { ADAPTERS, detectAdapters } from '../capabilities/adapters.js';
import { captureOutput } from '../core/util.js';
import { exclusive } from './api.js';

// Capabilities and settings are managed with the same commands as in the terminal (`catalog`,
// `add`, `remove`, `sync`, `doctor`, `language`, `adapter`), always with --json, so Lens shows
// exactly what the CLI would do and writes the same files.

const fail = (message, status = 400) => Object.assign(new Error(message), { status });
const REF = /^[a-z]+\/[a-z0-9][a-z0-9._-]*$/;
const LANG = /^[a-z]{2}(?:-[A-Z]{2})?$/;

function parse(output) {
  const start = output.search(/[[{]/);
  if (start < 0) return null;
  try { return JSON.parse(output.slice(start)); } catch { return null; }
}

/** Runs one Maverick command with --json and returns its parsed payload; failures keep their message. */
export async function json(main, cwd, argv) {
  return exclusive(async () => {
    try { const { output } = await captureOutput(() => main([...argv, '--json'], cwd)); return { ok: true, data: parse(output), output }; }
    catch (error) { return { ok: false, data: parse(error.output || ''), output: error.output || '', error: error.message }; }
  });
}

export async function capabilities(main, cwd) {
  const [catalog, installed, detected] = await Promise.all([json(main, cwd, ['catalog']), json(main, cwd, ['installed']), detectAdapters(cwd).catch(() => [])]);
  const found = new Set((detected || []).map(adapter => adapter.id || adapter));
  return {
    catalog: catalog.data || [], installed: Array.isArray(installed.data) ? installed.data : [],
    adapters: ADAPTERS.map(adapter => ({ id: adapter.id, name: adapter.name, home: adapter.home, detected: found.has(adapter.id) })),
    errors: [catalog, installed].filter(result => !result.ok).map(result => result.error)
  };
}

export async function capability(main, cwd, ref) {
  if (!REF.test(String(ref || ''))) throw fail('A capability reference like skill/maverick-build is required.');
  const result = await json(main, cwd, ['catalog', 'show', ref]);
  if (!result.ok) throw fail(result.error, 404);
  return result.data;
}

/** add | remove | sync. Without `apply` it is a dry run that returns the planned file changes. */
export async function changeCapabilities(main, cwd, body) {
  const action = String(body.action || ''), refs = Array.isArray(body.refs) ? body.refs.map(String) : [];
  if (!['add', 'remove', 'sync'].includes(action)) throw fail('action must be add, remove or sync');
  if (action !== 'sync' && (!refs.length || refs.some(ref => !REF.test(ref)))) throw fail('Name at least one capability, like skill/maverick-build.');
  const to = Array.isArray(body.to) ? body.to.map(String) : [];
  if (to.some(id => !ADAPTERS.some(adapter => adapter.id === id))) throw fail(`Unknown tool; use ${ADAPTERS.map(adapter => adapter.id).join(', ')}`);
  const argv = [action, ...(action === 'sync' ? [] : refs), ...(action === 'add' && to.length ? ['--to', to.join(',')] : []), ...(body.allowExec && action === 'add' ? ['--allow-exec'] : []), ...(body.force ? ['--force'] : []), body.apply ? '--yes' : '--dry-run'];
  const result = await json(main, cwd, argv);
  return { ...result, command: `maverick ${argv.join(' ')}` };
}

export async function settings(main, cwd) {
  const [config, doctor, language, stack] = await Promise.all([json(main, cwd, ['config', 'show']), json(main, cwd, ['doctor']), json(main, cwd, ['language']), json(main, cwd, ['stack'])]);
  return { config: config.data, configError: config.ok ? null : config.error, doctor: doctor.data, language: language.data, stack: stack.data };
}

export async function changeSettings(main, cwd, body) {
  if (body.action === 'language') {
    const docs = String(body.docs || ''), code = String(body.code || '');
    if (!LANG.test(docs) || !LANG.test(code)) throw fail('Languages are codes like en, pt-BR or es.');
    const result = await json(main, cwd, ['language', docs, code]);
    return { ...result, command: `maverick language ${docs} ${code}` };
  }
  if (body.action === 'adapter') {
    const id = String(body.id || '');
    if (!/^[a-z][a-z0-9-]*$/.test(id)) throw fail('An adapter id is required.');
    const result = await json(main, cwd, ['adapter', 'install', id]);
    return { ...result, command: `maverick adapter install ${id}` };
  }
  throw fail('action must be language or adapter');
}
