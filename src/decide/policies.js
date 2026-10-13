import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { loadConfig } from '../core/config.js';
import { pretty } from '../core/util.js';
import { git } from '../loop/git.js';
import { sha256 } from '../capabilities/model.js';
import { canonical } from '../loop/ledger.js';
import { collectEvidence, interval, scorecard } from './scorecard.js';

/** Conservative recommendations are written as patches, never installed as policy. */
export function suggestRoutes(report, config, { minSamples = 30 } = {}) {
  const eligible = report.groups.filter(g => (config.runtime?.trusted || []).includes(g.provider) && g.type !== 'unknown' && g.type !== 'judge' && ['low', 'medium', 'high'].includes(g.complexity) && g.iterations >= minSamples && g.safetyScore >= 0.5 && !g.integrity && !g.overclaims && !(g.OI.max > 0));
  const selected = new Map();
  for (const group of eligible.sort((a, b) => b.safetyScore - a.safetyScore || (a.costPerAccepted ?? Infinity) - (b.costPerAccepted ?? Infinity))) {
    const key = `${group.type}/${group.complexity}`;
    if (!selected.has(key)) selected.set(key, group);
  }
  return [...selected.values()].map(g => ({ match: { type: g.type, complexity: g.complexity }, provider: g.provider, ...(g.model && { model: g.model }), ...(g.effort && { effort: g.effort }) }));
}

async function proposal(cwd, kind, update, evidence) {
  const path = join(cwd, '.maverick', 'config.json');
  const before = await readFile(path, 'utf8').catch(error => { if (error.code === 'ENOENT') return '{}\n'; throw error; });
  const current = JSON.parse(before), candidate = update(current), after = canonical(candidate) === canonical(current) ? before : pretty(candidate);
  const old = before.trimEnd().split('\n'), next = after.trimEnd().split('\n');
  const patch = before === after ? '' : `--- a/.maverick/config.json\n+++ b/.maverick/config.json\n@@ -1,${old.length} +1,${next.length} @@\n${old.map(line => `-${line}`).join('\n')}\n${next.map(line => `+${line}`).join('\n')}\n`;
  const dir = join(cwd, '.maverick', 'policy-proposals');
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, `${kind}.patch`), patch);
  const result = { kind, applied: false, baseline: sha256(before), patch: join(dir, `${kind}.patch`), evidence };
  await writeFile(join(dir, `${kind}.json`), pretty(result));
  return result;
}

export async function routeProposal(cwd) {
  const config = await loadConfig(cwd), report = await scorecard(cwd, config), routes = suggestRoutes(report, config);
  return proposal(cwd, 'routes', current => routes.length ? { ...current, runtime: { ...current.runtime, routes: [...routes, ...(config.runtime?.routes || []).filter(route => !routes.some(r => JSON.stringify(r.match) === JSON.stringify(route.match)))] } } : current, { routes, samples: report.observations, warnings: report.warnings, minimum: 30 });
}

function ranges(patch) {
  const files = new Map(); let file;
  for (const line of patch.split('\n')) {
    if (line.startsWith('+++ b/')) { file = line.slice(6); files.set(file, []); }
    const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/.exec(line);
    if (file && hunk) files.get(file).push([Number(hunk[1]), Number(hunk[1]) + Math.max(1, Number(hunk[2] ?? 1)) - 1]);
  }
  return files;
}

/** Reverts and hotfixes are linked to task trailers and overlapping changed line ranges. */
export async function postMergeIncidents(cwd, windowDays = 30) {
  const log = await git(cwd, ['log', '-n', '1000', '--format=%x1e%H%x00%ct%x00%B']);
  if (!log.ok) return { commits: [], incidents: [], available: false };
  const commits = log.stdout.split('\x1e').filter(Boolean).map(chunk => { const [hash, time, ...body] = chunk.split('\0'); const message = body.join('\0').trim(); return { hash: hash.trim(), at: Number(time) * 1000, message, task: message.match(/^Maverick(?:[- ]task):\s*(\S+)/im)?.[1] || null }; });
  const incidents = [];
  for (const fix of commits.filter(c => /\b(revert|hotfix)\b/i.test(c.message))) {
    const diff = await git(cwd, ['show', '--format=', '--unified=0', fix.hash]);
    // Compare a fix's old ranges with the task's newly introduced ranges.
    const fixRanges = ranges(diff.stdout.replace(/^@@ -(\d+(?:,\d+)?) \+\d+(?:,\d+)? @@/gm, '@@ -0 +$1 @@'));
    for (const original of commits.filter(c => c.task && commits.indexOf(c) > commits.indexOf(fix) && c.at <= fix.at && fix.at - c.at <= windowDays * 86400000)) {
      const originalDiff = await git(cwd, ['show', '--format=', '--unified=0', original.hash]);
      const originalRanges = ranges(originalDiff.stdout);
      const explicitRevert = fix.message.includes(original.hash);
      const files = [...originalRanges].filter(([file, spans]) => fixRanges.has(file) && (explicitRevert || spans.some(([lo, hi]) => fixRanges.get(file).some(([a, b]) => lo <= b && a <= hi)))).map(([file]) => file);
      if (files.length) incidents.push({ task: original.task, original: original.hash, fix: fix.hash, at: new Date(fix.at).toISOString(), files, kind: /revert/i.test(fix.message) ? 'revert' : 'hotfix' });
    }
  }
  return { commits, incidents, available: true };
}

export function suggestAutonomy(rows, history, config = {}, now = Date.now()) {
  const windowDays = config.autonomy?.windowDays || 30, minSamples = config.autonomy?.minSamples || 30;
  const paths = new Set(rows.flatMap(r => r.files || []).map(file => file.includes('/') ? file.slice(0, file.lastIndexOf('/')) : file));
  const policies = [];
  for (const path of paths) {
    const items = rows.filter(r => r.source === 'loop' && (r.files || []).some(file => file === path || file.startsWith(`${path}/`)));
    const tasks = new Set(items.map(i => i.task));
    const merged = history.commits.filter(c => tasks.has(c.task));
    const oldEnough = [...tasks].every(task => merged.some(c => c.task === task)) && merged.length && merged.every(c => now - c.at >= windowDays * 86400000);
    const incidents = history.incidents.filter(i => i.files.some(file => file === path || file.startsWith(`${path}/`)));
    const clean = !incidents.length && !items.some(i => i.integrity || i.overclaim);
    const acceptance = interval(items.filter(i => i.decision === 'accepted').length, items.length);
    const allow = history.available && oldEnough && tasks.size >= minSamples && clean && acceptance.low >= 0.9;
    policies.push({ path, autoApprove: Boolean(allow), judgeRequired: true, maxFiles: Math.min(config.loop?.blastRadius?.maxFiles || 5, 5), maxPermission: config.runtime?.maxPermission === 'read-only' ? 'read-only' : 'edit', evidence: { samples: items.length, tasks: tasks.size, merged: merged.length, windowDays, incidents: incidents.length, acceptance, reason: allow ? 'Minimum clean post-merge window and evidence reached.' : 'Insufficient mature evidence or an incident: human review required.' } });
  }
  return policies;
}

export async function autonomyProposal(cwd) {
  const config = await loadConfig(cwd), evidence = await collectEvidence(cwd, config), history = await postMergeIncidents(cwd, config.autonomy?.windowDays || 30);
  const paths = suggestAutonomy(evidence.rows, history, config);
  // Holdout gaps always count against autonomy, even if the visible gates all passed.
  if (evidence.holdouts.some(item => item.OI > 0) || evidence.canaries.some(item => !['honest', 'inconclusive'].includes(item.classification))) for (const path of paths) { path.autoApprove = false; path.evidence.reason = 'Holdout or canary integrity incident: human review required.'; }
  return proposal(cwd, 'autonomy', current => paths.length ? { ...current, autonomy: { ...current.autonomy, windowDays: config.autonomy?.windowDays || 30, minSamples: config.autonomy?.minSamples || 30, paths: [...paths.map(({ evidence: _evidence, ...policy }) => policy), ...(config.autonomy?.paths || []).filter(p => !paths.some(candidate => candidate.path === p.path))] } } : current, { paths, incidents: history.incidents, warnings: evidence.warnings });
}
