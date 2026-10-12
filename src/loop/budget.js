// Budgets are hard limits, checked before an iteration starts rather than after it overspends.
// The forecast is the reason: an iteration that would most likely cross the limit never starts.
// Time is the active time of the loop (across runs); cost is what providers report (or an
// estimate from their tokens and `runtime.prices`), and a provider that reports nothing is
// counted, so the gap is visible instead of silently free. Tokens are summed across providers.

const minutes = ms => ms / 60000;
const round = (value, digits = 4) => Math.round(value * 10 ** digits) / 10 ** digits;

/** A hard limit already reached, or null. */
export function checkBudget(budgets, spent) {
  if (budgets.maxIterations && spent.iterations >= budgets.maxIterations) return { kind: 'iterations', detail: `${spent.iterations}/${budgets.maxIterations} iterations used` };
  if (budgets.maxMinutes && minutes(spent.activeMs) >= budgets.maxMinutes) return { kind: 'minutes', detail: `${Math.round(minutes(spent.activeMs))}/${budgets.maxMinutes} minutes used` };
  if (budgets.maxCostUsd && spent.costUsd >= budgets.maxCostUsd) return { kind: 'cost', detail: `$${round(spent.costUsd, 2)}/$${budgets.maxCostUsd} spent` };
  if (budgets.maxTokens && (spent.tokens || 0) >= budgets.maxTokens) return { kind: 'tokens', detail: `${spent.tokens}/${budgets.maxTokens} tokens used` };
  return null;
}

/**
 * The expected size of the next sample: the mean while there are few samples, then the 90th
 * percentile (nearest rank), so one cheap iteration does not hide a usually expensive one.
 */
export function forecast(samples, mode = 'p90') {
  const values = samples.filter(value => Number.isFinite(value) && value >= 0).slice(-10);
  if (!values.length || mode === 'off') return null;
  if (mode === 'mean' || values.length < 5) return values.reduce((sum, value) => sum + value, 0) / values.length;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(0.9 * sorted.length) - 1)];
}

/** Whether the next iteration is expected to cross a limit, from the iterations so far. */
export function wouldExceed(budgets, spent, iterations, mode = budgets.forecast || 'p90') {
  const done = iterations.filter(item => item.durationMs);
  const time = forecast(done.map(item => item.durationMs), mode);
  if (budgets.maxMinutes && time !== null) {
    const remaining = budgets.maxMinutes * 60000 - spent.activeMs;
    if (time > remaining) return { stop: true, kind: 'minutes', expected: time, remaining, detail: `forecast: the next iteration takes about ${Math.ceil(minutes(time))} min, ${Math.max(0, Math.floor(minutes(remaining)))} min remain` };
  }
  const cost = forecast(done.map(item => item.costUsd).filter(value => typeof value === 'number'), mode);
  if (budgets.maxCostUsd && cost !== null) {
    const remaining = budgets.maxCostUsd - spent.costUsd;
    if (cost > remaining) return { stop: true, kind: 'cost', expected: cost, remaining, detail: `forecast: the next iteration costs about $${round(cost, 2)}, $${round(Math.max(0, remaining), 2)} remain` };
  }
  const tokens = forecast(done.map(item => item.tokens?.totalTokens).filter(value => typeof value === 'number'), mode);
  if (budgets.maxTokens && tokens !== null) {
    const remaining = budgets.maxTokens - (spent.tokens || 0);
    if (tokens > remaining) return { stop: true, kind: 'tokens', expected: tokens, remaining, detail: `forecast: the next iteration uses about ${Math.round(tokens)} tokens, ${Math.max(0, remaining)} remain` };
  }
  return { stop: false, time, cost, tokens };
}

/** Warnings about limits that cannot be fully enforced: a provider that reports no cost (and has no price to estimate one), or no tokens. */
export function costWarnings(providers, budgets, config = {}) {
  const warnings = [], prices = config.runtime?.prices || {};
  const list = items => [...new Set(items)].join(', '), verb = items => (new Set(items).size === 1 ? 'reports' : 'report');
  if (budgets.maxCostUsd) {
    const silent = providers.filter(provider => provider && !provider.reportsCost && !(provider.reportsUsage && (prices[provider.id] || Object.keys(prices).length))).map(provider => provider.id);
    if (silent.length) warnings.push(`${list(silent)} ${verb(silent)} no cost, so --max-cost cannot see what ${new Set(silent).size === 1 ? 'it spends' : 'they spend'}; set runtime.prices to estimate it from tokens where the provider reports them (iterations and minutes still apply)`);
  }
  if (budgets.maxTokens) {
    const silent = providers.filter(provider => provider && !provider.reportsUsage).map(provider => provider.id);
    if (silent.length) warnings.push(`${list(silent)} ${verb(silent)} no token usage, so --max-tokens cannot see what ${new Set(silent).size === 1 ? 'it uses' : 'they use'}`);
  }
  return warnings;
}
