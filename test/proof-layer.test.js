import test from 'node:test';
import assert from 'node:assert/strict';
import { applyOverrides, parseOverrides, recordedSettings, replayLoop, replaySentence } from '../src/loop/replay.js';
import { parseOptions } from '../src/core/util.js';
import { providersFor } from '../src/runtime/providers.js';

const score = failing => ({ gates: { checks: failing.length ? 'fail' : 'pass' }, passed: failing.length ? 0 : 1, blocking: 1, failing: failing.length ? { checks: failing } : {}, failingCount: failing.length, key: failing.join('|') || 'ok', checklist: { done: 0, total: 0 }, subtasksDone: 0, subtasksTotal: 0 });

/** Five stuck iterations: the same two failures, accepted (nothing got worse), no progress; the ladder retried at #5 and the budget ran out. */
function stuckLoop() {
  const base = score(['npm test :: a', 'npm test :: b']);
  const iterations = [1, 2, 3, 4, 5].map(n => ({
    n, scope: 'goal', provider: 'claude-code', effort: 'medium', decision: 'accepted', progress: false, failureKey: base.key, overclaim: false,
    agent: { status: 'partial', disputes: [] }, diff: { empty: false, files: 1, added: 5, deleted: 5 }, checklistDelta: 0, findings: [], score: base,
    costUsd: 0.1, durationMs: 60000, tokens: { totalTokens: 1000 }, signals: n === 5 ? ['no-progress'] : [], escalation: n === 5 ? { rung: 'retry-with-diagnosis', change: {} } : null
  }));
  return {
    loopId: '20261013-100000-abcd', task: 'demo', status: 'budget-exceeded', reason: '5/5 iterations used', initialProvider: 'claude-code', baseline: base,
    budgets: { maxIterations: 5, maxMinutes: 120, maxCostUsd: null, maxTokens: null, forecast: 'p90' },
    settings: { escalation: ['retry-with-diagnosis', 'raise-effort', 'switch-provider', 'human'], providers: [] }, spent: { iterations: 5, costUsd: 0.5 }, iterations
  };
}

const config = { loop: { stall: { window: 5 } } };
const replay = (state, set = []) => {
  const overrides = parseOverrides(set);
  return { overrides, result: replayLoop(state, { settings: applyOverrides(recordedSettings(state, config), overrides), overrides, providers: providersFor(config), config }) };
};

test('loop replay reproduces the recorded loop under its own policy', () => {
  const { result } = replay(stuckLoop());
  assert.equal(result.divergedAt, null);
  assert.ok(result.steps.every(step => step.same));
  assert.equal(result.outcome.kind, 'same');
  assert.equal(result.outcome.outcome, 'budget-exceeded');
  assert.match(replaySentence(result), /decides exactly as recorded/);
});

test('loop replay answers what a stricter stall policy would have saved', () => {
  const { result, overrides } = replay(stuckLoop(), ['stall.window=3', 'escalation=human']);
  assert.equal(result.outcome.kind, 'earlier');
  assert.equal(result.outcome.outcome, 'stalled-escalated');
  assert.equal(result.outcome.at, 3);
  assert.deepEqual(result.saved, { iterations: 2, costUsd: 0.2, tokens: 2000, minutes: 2, unknownCost: 0 });
  assert.match(replaySentence(result, overrides), /^With stall\.window=3, escalation=human, the loop would have stopped after iteration 3 .*saved 2 iteration\(s\), \$0\.20, 2000 tokens, 2 min/);
});

test('loop replay stops on a cost budget before the iteration that would cross it', () => {
  const { result } = replay(stuckLoop(), ['budgets.maxCostUsd=0.25', 'budgets.forecast=mean']);
  assert.equal(result.outcome.kind, 'earlier');
  assert.equal(result.outcome.outcome, 'budget-exceeded');
  assert.equal(result.outcome.at, 2);
  assert.equal(result.saved.iterations, 3);
});

test('loop replay stops at the first decision it cannot follow', () => {
  const state = stuckLoop();
  // Iteration 2 swaps a named failure for another: the same count passes `count`, `strict` rejects it.
  state.iterations[1].score = score(['npm test :: a', 'npm test :: c']);
  const same = replay(state);
  assert.equal(same.result.divergedAt, null);
  const strict = replay(state, ['ratchet.newFailures=strict']);
  assert.equal(strict.result.divergedAt, 2);
  assert.equal(strict.result.steps.at(-1).decision, 'rejected');
  assert.equal(strict.result.outcome.kind, 'diverged');
  assert.equal(strict.result.saved, null);
});

test('loop replay keeps an agent stop and a raised budget from the ledger', () => {
  const state = stuckLoop();
  state.iterations[2].agent = { status: 'partial', disputes: ['the test asserts the wrong total'] };
  state.status = 'disputed';
  const { result } = replay(state, ['stall.window=4', 'escalation=human']);
  assert.equal(result.stop.outcome, 'disputed');
  assert.equal(result.outcome.kind, 'earlier');
  const raised = stuckLoop();
  raised.budgets.maxIterations = 3;
  const ledger = [{ type: 'iteration-end', data: { n: 3 } }, { type: 'budget-change', data: { after: { maxIterations: 5 } } }];
  const overrides = {};
  const replayed = replayLoop(raised, { settings: recordedSettings(raised, config), overrides, ledger, providers: providersFor(config), config });
  assert.equal(replayed.outcome.kind, 'same', 'the human raised the budget at iteration 4, so the loop ran all five');
});

test('replay settings parse strictly and repeated flags accumulate', () => {
  assert.deepEqual(parseOverrides(['stall.window=3', 'yield.enabled=true', 'budgets.maxCostUsd=off', 'escalation=raise-effort,human']), { stall: { window: 3 }, yield: { enabled: true }, budgets: { maxCostUsd: null }, escalation: ['raise-effort', 'human'] });
  assert.throws(() => parseOverrides(['stall.windows=3']), /not a replayable setting/);
  assert.throws(() => parseOverrides(['stall.window=-1']), /positive number/);
  assert.throws(() => parseOverrides(['ratchet.newFailures=loose']), /one of count, strict/);
  assert.deepEqual(parseOptions(['replay', 'demo', '--set', 'a=1', '--set', 'b=2', '--json']).options, { set: ['a=1', 'b=2'], json: true });
  assert.deepEqual(applyOverrides({ escalation: ['human'] }, { escalation: ['raise-effort'] }).escalation, ['raise-effort', 'human']);
});
