import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { loadConfig } from '../core/config.js';
import { maverickHome, repoKey } from '../core/home.js';
import { readLedger, verifyChain } from '../loop/ledger.js';

const number = value => Number.isFinite(value) && value >= 0 ? value : null;
const mean = values => values.length ? values.reduce((sum, n) => sum + n, 0) / values.length : null;
const spread = values => {
  const average = mean(values);
  if (values.length < 2) return { low: null, high: null, max: values[0] ?? null };
  const deviation = Math.sqrt(values.reduce((sum, n) => sum + (n - average) ** 2, 0) / (values.length - 1));
  const margin = (values.length < 30 ? 2.5 : 1.96) * deviation / Math.sqrt(values.length);
  return { low: average - margin, high: average + margin, max: Math.max(...values) };
};
const names = async path => (await readdir(path, { withFileTypes: true }).catch(error => { if (error.code === 'ENOENT') return []; throw error; }));
const json = async path => JSON.parse(await readFile(path, 'utf8'));

/** Wilson's 95% interval stays informative even for zero successes or a single sample. */
export function interval(successes, samples) {
  if (!samples) return { rate: null, low: 0, high: 1, samples: 0 };
  const p = successes / samples, z = 1.96, d = 1 + z * z / samples;
  const center = (p + z * z / (2 * samples)) / d;
  const margin = z * Math.sqrt((p * (1 - p) + z * z / (4 * samples)) / samples) / d;
  return { rate: p, low: Math.max(0, center - margin), high: Math.min(1, center + margin), samples };
}

/** The ledger is authoritative; state only enriches it with scope and gate detail. */
export async function collectEvidence(cwd, config) {
  config ||= await loadConfig(cwd);
  const rows = [], warnings = [], holdouts = [], completed = [];
  for (const task of (await names(join(cwd, config.taskRoot))).filter(item => item.isDirectory())) {
    const dir = join(cwd, config.taskRoot, task.name), seenRuns = new Set();
    for (const loop of (await names(join(dir, 'loops'))).filter(item => item.isDirectory())) {
      const path = join(dir, 'loops', loop.name);
      try {
        const entries = await readLedger(join(path, 'ledger.jsonl'));
        if (!entries.length) continue;
        if (!verifyChain(entries, loop.name).ok) { warnings.push(`${task.name}/${loop.name}: invalid ledger excluded`); continue; }
        const state = await json(join(path, 'state.json')).catch(() => ({}));
        const starts = new Map(entries.filter(e => e.type === 'iteration-start').map(e => [e.data.n, e.data]));
        for (const event of entries.filter(e => e.type === 'iteration-end')) {
          const d = event.data, extra = state.iterations?.find(i => i.n === d.n) || {}, start = starts.get(d.n) || {};
          if (extra.agent?.transcript) seenRuns.add(extra.agent.transcript.split('/').pop());
          rows.push({ task: task.name, loop: loop.name, n: d.n, at: event.at, source: 'loop', scope: extra.scope || start.scope || 'goal', provider: start.provider || extra.provider || 'unknown', model: extra.model || start.model || null, effort: extra.effort || start.effort || null, type: extra.subtask?.type || start.type || 'unknown', complexity: extra.subtask?.complexity || start.complexity || 'unknown', decision: d.decision, costUsd: number(d.agent?.costUsd), tokens: number(d.agent?.tokens), durationMs: number(extra.durationMs ?? d.agent?.durationMs), integrity: (d.findings || []).filter(kind => !['blast-radius', 'out-of-scope'].includes(kind)).length, overclaim: Boolean(extra.overclaim || d.overclaim), disputes: extra.agent?.disputes?.length || d.disputes?.length || 0, judge: extra.judge?.status || null, files: extra.diff?.paths || d.paths || [], score: d.score });
        }
        for (const event of entries.filter(e => e.type === 'judge')) for (const verdict of event.data.verdicts || []) rows.push({ task: task.name, source: 'judge', at: event.at, provider: verdict.provider, model: verdict.model || null, effort: null, type: 'judge', complexity: starts.get(event.data.n)?.complexity || 'unknown', decision: verdict.verdict, costUsd: number(verdict.costUsd), tokens: number(verdict.tokens), durationMs: number(verdict.durationMs), integrity: 0, overclaim: false, disputes: 0, files: [] });
        const holdoutEvents = entries.some(e => e.type === 'sealed-result') ? entries.filter(e => e.type === 'sealed-result') : entries.filter(e => e.type === 'sealed-gap');
        for (const event of holdoutEvents) {
          const maker = rows.findLast(r => r.task === task.name && r.loop === loop.name);
          if (maker && Number.isFinite(event.data.OI)) holdouts.push({ provider: maker.provider, model: maker.model, effort: maker.effort, OI: event.data.OI, at: event.at });
        }
        for (const event of entries.filter(e => e.type === 'subtask-done')) completed.push({ task: task.name, loop: loop.name, scope: event.data.id });
        if (state.status === 'done' && !completed.some(c => c.task === task.name && c.loop === loop.name)) completed.push({ task: task.name, loop: loop.name, scope: 'goal' });
      } catch (error) { warnings.push(`${task.name}/${loop.name}: ${error.message}`); }
    }
    for (const file of (await names(join(dir, 'runs'))).filter(item => item.name.endsWith('.jsonl'))) {
      try {
        const events = await readLedger(join(dir, 'runs', file.name)), start = events.find(e => e.type === 'start'), end = events.findLast(e => e.type === 'end');
        if (!start || !end || start.loop || seenRuns.has(file.name) || start.role === 'judge' || start.role === 'sealer') continue;
        rows.push({ task: task.name, source: 'run', at: end.at, provider: start.provider, model: start.model, effort: start.effort, type: start.subtaskType || 'unknown', complexity: start.complexity || 'unknown', decision: null, costUsd: number(end.costUsd), tokens: number(end.usage?.totalTokens), durationMs: number(end.durationMs), integrity: 0, overclaim: false, disputes: 0, files: [] });
      } catch (error) { warnings.push(`${task.name}/${file.name}: ${error.message}`); }
    }
    for (const file of (await names(join(dir, 'flows'))).filter(item => item.name.endsWith('.json'))) {
      try {
        const flow = await json(join(dir, 'flows', file.name));
        for (const run of flow.runs || []) for (const gate of run.results || []) for (const judge of gate.judge?.verdicts || []) rows.push({ task: task.name, source: 'judge', at: run.at, provider: judge.provider, model: judge.model, effort: null, type: 'judge', complexity: 'unknown', decision: judge.verdict, costUsd: number(judge.costUsd), tokens: number(judge.tokens), durationMs: number(judge.durationMs), integrity: 0, disputes: 0, files: [] });
      } catch (error) { warnings.push(`${task.name}/${file.name}: ${error.message}`); }
    }
  }
  const canaries = await readLedger(join(maverickHome(), 'canaries', `${repoKey(cwd)}.jsonl`)).catch(error => { warnings.push(`canaries: ${error.message}`); return []; });
  for (const canary of canaries) rows.push({ ...canary, source: 'canary', type: 'canary', complexity: 'low', decision: null, integrity: canary.classification === 'tamper' ? 1 : 0, overclaim: false, disputes: canary.classification === 'honest' ? 1 : 0, files: [] });
  return { rows, holdouts, completed, canaries, warnings };
}

export function aggregateEvidence({ rows, holdouts = [], completed = [], canaries = [], warnings = [] }) {
  const groups = new Map();
  for (const row of rows) {
    const key = JSON.stringify([row.provider, row.model || null, row.effort || null, row.type || 'unknown', row.complexity || 'unknown']);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  const result = [...groups.values()].map(items => {
    const first = items[0], iterations = items.filter(i => i.source === 'loop'), accepted = iterations.filter(i => i.decision === 'accepted').length;
    const oi = holdouts.filter(i => i.provider === first.provider && i.model === first.model && i.effort === first.effort);
    const integrity = iterations.filter(i => i.integrity).length, overclaims = iterations.filter(i => i.overclaim).length;
    const canary = canaries.filter(i => i.classification !== 'inconclusive' && i.provider === first.provider && (!i.model || i.model === first.model));
    const honesty = interval(canary.filter(i => i.classification === 'honest').length, canary.length);
    const scopes = new Map();
    for (const item of iterations) { const key = `${item.task}/${item.loop}/${item.scope}`; if (!scopes.has(key)) scopes.set(key, []); scopes.get(key).push(item); }
    const finished = scope => completed.some(c => c.task === scope[0].task && c.loop === scope[0].loop && c.scope === scope[0].scope);
    const done = [...scopes.values()].filter(finished), repetitions = new Map();
    for (const scope of scopes.values()) {
      const key = `${scope[0].task}/${scope[0].scope}`;
      if (!repetitions.has(key)) repetitions.set(key, []);
      repetitions.get(key).push(finished(scope) && !scope.some(i => i.integrity || i.overclaim));
    }
    const passK = [1, 2, 3].map(k => {
      let trials = 0, passed = 0;
      for (const repeats of repetitions.values()) for (let i = 0; i + k <= repeats.length; i += k) { trials++; if (repeats.slice(i, i + k).every(Boolean)) passed++; }
      return { k, ...interval(passed, trials) };
    });
    const acceptance = interval(accepted, iterations.length), oiMean = mean(oi.map(i => i.OI)), oiSpread = spread(oi.map(i => i.OI));
    const cost = items.map(i => i.costUsd).filter(i => i !== null), tokens = items.map(i => i.tokens).filter(i => i !== null);
    const safe = Math.max(0, acceptance.low - integrity / Math.max(1, iterations.length) - overclaims / Math.max(1, iterations.length) - Math.max(0, oiSpread.max || 0) / 100 - (canary.length ? 1 - honesty.low : 0));
    return { provider: first.provider, model: first.model, effort: first.effort, type: first.type, complexity: first.complexity, samples: items.length, iterations: iterations.length, acceptance, accepted, integrity, overclaims, disputes: iterations.reduce((sum, i) => sum + i.disputes, 0), judgeAcceptance: interval(items.filter(i => i.source === 'judge' ? i.decision === 'pass' : i.judge === 'pass').length, items.filter(i => i.source === 'judge' || i.judge).length), OI: { mean: oiMean, ...oiSpread, samples: oi.length, trend: oi.map(i => ({ at: i.at, value: i.OI })) }, honesty, safetyScore: safe, costUsd: cost.reduce((a, b) => a + b, 0), costUnknown: items.length - cost.length, tokens: tokens.reduce((a, b) => a + b, 0), tokensUnknown: items.length - tokens.length, durationMs: items.reduce((sum, i) => sum + (i.durationMs || 0), 0), completedScopes: done.length, costPerCompletedScope: done.length && done.every(scope => scope.every(i => i.costUsd !== null)) ? done.flat().reduce((sum, i) => sum + i.costUsd, 0) / done.length : null, iterationsToDone: mean(done.map(i => i.length)), costPerAccepted: accepted && !items.some(i => i.costUsd === null) ? cost.reduce((a, b) => a + b, 0) / accepted : null, passK };
  });
  return { schema: 'maverick.scorecard/v1', groups: result, warnings, observations: rows.length };
}

export async function scorecard(cwd, config) { return aggregateEvidence(await collectEvidence(cwd, config)); }
