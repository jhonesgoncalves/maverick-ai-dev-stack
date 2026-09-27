import { createInterface } from 'node:readline/promises';
import { ADAPTERS, resolveTargets } from '../capabilities/adapters.js';
import { findCapability, loadCatalog, searchCatalog } from '../capabilities/catalog.js';
import { applyChanges, checkDrift, LOCK_PATH, lockEntry, planInstall, planRemove, readLock, writeLock } from '../capabilities/engine.js';
import { loadConfig } from '../core/config.js';
import { brand, output } from '../core/util.js';

const MARK = { create: '+', update: '~', delete: '-', unchanged: '=' };
const describe = change => (change.type === 'json-key' ? `${change.path} → ${change.pointer.join('.')}` : change.path);

function renderPlans(title, plans) {
  const lines = [`${brand()} / ${title}`];
  for (const plan of plans) {
    lines.push('', plan.capability ? `${plan.capability.ref} ${plan.capability.version} (${plan.capability.source})` : plan.ref);
    for (const change of plan.changes) lines.push(`  ${MARK[change.op]} ${change.target.padEnd(12)} ${describe(change)}`);
    for (const skip of plan.skipped) lines.push(`  · ${skip.target.padEnd(12)} skipped: ${skip.reason}`);
    for (const conflict of plan.conflicts) lines.push(`  ! ${conflict.target.padEnd(12)} ${conflict.path}: ${conflict.reason}`);
    for (const forced of plan.forced) lines.push(`  ! ${forced.target.padEnd(12)} ${forced.path}: ${forced.reason} (overwriting: --force)`);
  }
  return lines.join('\n');
}

const pending = plans => plans.flatMap(plan => plan.changes).filter(change => change.op !== 'unchanged');

/** Shows the plan and decides whether to apply it: nothing is written without consent. */
async function confirm(title, plans, options) {
  const summary = plans.map(plan => ({ ref: plan.capability?.ref || plan.ref, changes: plan.changes.map(({ target, op, type, path, pointer }) => ({ target, op, type, path, ...(pointer && { pointer }) })), skipped: plan.skipped, conflicts: plan.conflicts }));
  if (!options.json) output(renderPlans(title, plans));
  const conflicts = plans.flatMap(plan => plan.conflicts);
  if (conflicts.length) {
    if (options.json) output(JSON.stringify({ applied: false, plans: summary }, null, 2));
    throw new Error(`${conflicts.length} conflict(s): ${conflicts.map(conflict => `${conflict.path} (${conflict.reason})`).join('; ')}; review them, or rerun with --force to overwrite`);
  }
  const count = pending(plans).length;
  const finish = applied => { if (options.json) output(JSON.stringify({ applied, dryRun: Boolean(options.dryRun), plans: summary }, null, 2)); return applied; };
  if (!count) { if (!options.json) output('\nAlready up to date.'); return finish(false); }
  if (options.dryRun) { if (!options.json) output(`\n${count} change(s) planned. Dry run: nothing was written.`); return finish(false); }
  if (!options.yes) {
    if (!process.stdin.isTTY || !process.stdout.isTTY || options.json) throw new Error(`${count} change(s) planned; rerun with --yes to apply or --dry-run to preview`);
    const prompt = createInterface({ input: process.stdin, output: process.stdout });
    const answer = await prompt.question(`\nApply ${count} change(s)? [y/N] `); prompt.close();
    if (!/^y(es)?$/i.test(answer.trim())) { output('Nothing was written.'); return false; }
  }
  return finish(true);
}

function requireExecTrust(capability, options) {
  if (capability.kind === 'mcp' && capability.server.command && !options.allowExec) {
    throw new Error(`${capability.ref} starts a local process (${[capability.server.command, ...capability.server.args].join(' ')}); review it, then rerun with --allow-exec`);
  }
}

async function add(cwd, references, options = {}) {
  if (!references.length) throw new Error('name at least one capability, for example: maverick add agent/reviewer --to claude-code');
  const [config, lock] = await Promise.all([loadConfig(cwd), readLock(cwd)]);
  const catalog = await loadCatalog(cwd, config);
  const adapters = await resolveTargets(cwd, config, options.to);
  const plans = [];
  for (const reference of references) {
    const capability = findCapability(catalog, reference);
    requireExecTrust(capability, options);
    const plan = await planInstall(cwd, capability, adapters, lock, { force: options.force });
    if (!plan.changes.length) throw new Error(`${capability.ref} is not supported by ${adapters.map(adapter => adapter.id).join(', ')}: ${plan.skipped.map(skip => skip.reason).join('; ')}`);
    plans.push(plan);
  }
  if (!await confirm('ADD', plans, options)) return;
  await applyChanges(cwd, plans.flatMap(plan => plan.changes));
  for (const plan of plans) lock.capabilities[plan.capability.ref] = lockEntry(plan, { allowExec: Boolean(options.allowExec) });
  await writeLock(cwd, lock);
  if (!options.json) output(`\n✓ installed ${plans.length} capability(ies); recorded in ${LOCK_PATH}`);
}

async function remove(cwd, references, options = {}) {
  if (!references.length) throw new Error('name at least one installed capability, for example: maverick remove agent/reviewer');
  const lock = await readLock(cwd), plans = [];
  for (const reference of references) {
    const refs = Object.keys(lock.capabilities).filter(ref => ref === reference || ref.split('/')[1] === reference);
    if (refs.length > 1) throw new Error(`"${reference}" is ambiguous; use one of: ${refs.join(', ')}`);
    plans.push(await planRemove(cwd, refs[0] || reference, lock, { force: options.force }));
  }
  const applied = await confirm('REMOVE', plans, options);
  if (!applied && pending(plans).length) return;
  await applyChanges(cwd, plans.flatMap(plan => plan.changes));
  for (const plan of plans) delete lock.capabilities[plan.ref];
  await writeLock(cwd, lock);
  if (!options.json) output(`\n✓ removed ${plans.length} capability(ies)`);
}

async function catalogCommand(cwd, action, value, options = {}) {
  const config = await loadConfig(cwd), catalog = await loadCatalog(cwd, config);
  if (action === 'show') {
    const capability = findCapability(catalog, value);
    const { body } = capability;
    if (options.json) return output(JSON.stringify({ ...capability, contents: undefined, dir: undefined }, null, 2));
    return output(`${brand()} / CAPABILITY\n\n${capability.ref} ${capability.version} (${capability.source})\n${capability.description}\n\nFiles: ${capability.files.join(', ')}\nSupported by: ${ADAPTERS.filter(adapter => adapter.supports(capability.kind) === true).map(adapter => adapter.id).join(', ')}${capability.kind === 'mcp' ? `\nServer: ${capability.server.command ? [capability.server.command, ...capability.server.args].join(' ') : capability.server.url}` : ''}\n\n${body.trim()}`);
  }
  if (action === 'validate') {
    const ok = !catalog.errors.length;
    if (options.json) output(JSON.stringify({ valid: ok, capabilities: catalog.capabilities.length, errors: catalog.errors, shadowed: catalog.shadowed }, null, 2));
    else {
      output(`${brand()} / CATALOG VALIDATE\n${catalog.capabilities.length} valid capability(ies)`);
      for (const error of catalog.errors) output(`FAIL ${error.path} [${error.source}]: ${error.message}`);
      for (const item of catalog.shadowed) output(`NOTE ${item.ref} from ${item.source} is shadowed by ${item.by}`);
    }
    if (!ok) throw new Error(`${catalog.errors.length} invalid capability(ies)`);
    return;
  }
  if (action && action !== 'search') throw new Error('use catalog, catalog search <text>, catalog show <capability>, or catalog validate');
  const results = searchCatalog(catalog, action === 'search' ? value : '');
  if (options.json) return output(JSON.stringify(results.map(({ ref, kind, name, version, description, source, tags }) => ({ ref, kind, name, version, description, source, tags })), null, 2));
  const width = Math.max(10, ...results.map(item => item.ref.length)) + 2;
  output(`${brand()} / CATALOG\n\n${results.map(item => `${item.ref.padEnd(width)}${item.version.padEnd(8)}${item.description.split('. ')[0].replace(/\.$/, '')}`).join('\n') || 'No capabilities match.'}${catalog.errors.length ? `\n\n${catalog.errors.length} invalid capability(ies) hidden; run maverick catalog validate` : ''}\n\nInstall with: maverick add <capability> --to <${ADAPTERS.map(adapter => adapter.id).join('|')}>`);
}

async function installed(cwd, options = {}) {
  const [config, lock] = await Promise.all([loadConfig(cwd), readLock(cwd)]);
  const catalog = await loadCatalog(cwd, config), report = await checkDrift(cwd, lock);
  for (const item of report) {
    const current = catalog.capabilities.find(capability => capability.ref === item.ref);
    item.status = item.issues.length ? 'drifted' : 'ok';
    item.update = !current ? 'source missing' : current.integrity !== lock.capabilities[item.ref].integrity ? `${current.version} available` : null;
  }
  if (options.json) return output(JSON.stringify(report, null, 2));
  if (!report.length) return output('No capabilities installed. Run maverick catalog to browse them.');
  const lines = [`${brand()} / INSTALLED`, ''];
  for (const item of report) {
    lines.push(`${item.status === 'ok' ? 'OK   ' : 'DRIFT'} ${item.ref} ${item.version} → ${item.targets.join(', ')}${item.update ? `  (${item.update})` : ''}`);
    for (const issue of item.issues) lines.push(`      ${issue.status} ${issue.path}`);
  }
  if (report.some(item => item.issues.length)) lines.push('', 'Restore managed files with: maverick sync');
  output(lines.join('\n'));
}

async function sync(cwd, options = {}) {
  const [config, lock] = await Promise.all([loadConfig(cwd), readLock(cwd)]);
  const catalog = await loadCatalog(cwd, config), plans = [], notes = [];
  for (const [ref, entry] of Object.entries(lock.capabilities)) {
    const capability = catalog.capabilities.find(item => item.ref === ref);
    if (!capability) { notes.push(`${ref}: source not found in any catalog; left as is`); continue; }
    if (capability.integrity !== entry.integrity) { notes.push(`${ref}: catalog changed (${entry.version} → ${capability.version}); run maverick add ${ref} to update`); continue; }
    const adapters = ADAPTERS.filter(adapter => Object.keys(entry.targets).includes(adapter.id));
    plans.push(await planInstall(cwd, capability, adapters, lock, { force: options.force }));
  }
  if (!options.json) notes.forEach(note => output(`NOTE ${note}`));
  if (!plans.length) return output(options.json ? JSON.stringify({ applied: false, notes }) : 'Nothing to sync.');
  if (!await confirm('SYNC', plans, options)) return;
  await applyChanges(cwd, plans.flatMap(plan => plan.changes));
  if (!options.json) output('\n✓ managed files match the lockfile');
}

export const capabilityCommands = [
  { id: 'catalog', description: 'Browse, search, show, or validate available capabilities.', aliases: [], usage: 'catalog [search <text>|show <name>|validate]', run: ({ cwd, arg, third, options }) => catalogCommand(cwd, arg, third, options) },
  { id: 'add', description: 'Install skills, agents, commands, or MCP servers into AI tools.', aliases: [], usage: 'add <capability...> [--to <tools>] [--dry-run]', run: ({ cwd, rest, options }) => add(cwd, rest, options) },
  { id: 'remove', description: 'Uninstall capabilities and their managed files.', aliases: [], usage: 'remove <capability...> [--dry-run]', run: ({ cwd, rest, options }) => remove(cwd, rest, options) },
  { id: 'installed', description: 'List installed capabilities, drift, and updates.', aliases: [], usage: 'installed [--json]', run: ({ cwd, options }) => installed(cwd, options) },
  { id: 'sync', description: 'Restore managed files from the capabilities lockfile.', aliases: [], usage: 'sync [--dry-run]', run: ({ cwd, options }) => sync(cwd, options) }
];
