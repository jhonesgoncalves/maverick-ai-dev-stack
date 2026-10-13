import { brand, output, pretty, rel } from '../core/util.js';

const percent = value => Number.isFinite(value) ? `${(value * 100).toFixed(1)}%` : '—';
const number = value => Number.isFinite(value) ? value.toFixed(2) : '—';
const money = value => Number.isFinite(value) ? `$${value.toFixed(4)}` : 'unknown';
const bounds = value => `${percent(value.rate)} (95% CI ${percent(value.low)}–${percent(value.high)})`;
const warnings = report => (report.warnings || []).map(warning => `WARN ${warning}`);

/** Conventional output shapes are decorated by the shared Maverick terminal theme. */
export function showDecide(title, report, options, lines) {
  return output(options.json ? pretty(report) : [`${brand()} / ${title}`, '', ...lines].join('\n'));
}

export function scorecardLines(report) {
  return [
    `Observations: ${report.observations} · ${report.groups.length} group(s)`, '',
    ...(!report.groups.length ? ['PENDING No repository evidence yet.', 'Next: maverick loop run <task>'] : report.groups.flatMap(g => [
      `${g.provider} / ${g.model || 'default'} / ${g.effort || 'default'}`,
      `  Scope: ${g.type} · ${g.complexity} · ${g.samples} sample(s)`,
      `  Iterations: ${g.iterations} · accepted ${g.accepted}`,
      `  Acceptance: ${bounds(g.acceptance)}`,
      `  Judge: ${bounds(g.judgeAcceptance)}`,
      `  Integrity: ${g.integrity} incident(s) · ${g.overclaims} overclaim(s)`,
      `  Holdout OI: ${number(g.OI.mean)} · max ${number(g.OI.max)} · ${g.OI.samples} sample(s)`,
      `  Honesty: ${bounds(g.honesty)}`,
      `  Safety: ${g.iterations ? percent(g.safetyScore) : '—'}`,
      `  Cost: ${money(g.costUsd)} known · ${g.costUnknown} unknown`,
      `  Cost per accepted: ${money(g.costPerAccepted)}`,
      `  Completed scopes: ${g.completedScopes} · ${money(g.costPerCompletedScope)} each`,
      `  Tokens: ${g.tokens} known · ${g.tokensUnknown} unknown`,
      `  Repeated success: ${g.passK.map(p => `pass^${p.k} ${percent(p.rate)} (n=${p.samples})`).join(' · ')}`, ''
    ])),
    ...warnings(report)
  ];
}

export function proposalLines(cwd, report) {
  const e = report.evidence, routes = e.routes || [], paths = e.paths || [], count = routes.length + paths.length;
  return [
    count ? `PENDING ${count} proposed ${report.kind === 'routes' ? 'route(s)' : 'path policy/policies'} for review.` : 'PENDING No eligible policy changes.',
    'Policy: awaiting human review · applied: no', '',
    ...(report.kind === 'routes' ? [`Evidence: ${e.samples} observations · minimum ${e.minimum} iterations per group`, ...routes.flatMap(r => [`  ${r.match.type} / ${r.match.complexity}`, `    Provider: ${r.provider} · model ${r.model || 'default'} · effort ${r.effort || 'default'}`])] : paths.flatMap(p => [
      `  ${p.path}`,
      `    Approval: ${p.autoApprove ? 'automatic (proposed)' : 'human required'} · judge required`,
      `    Limits: ${p.maxFiles} files · ${p.maxPermission}`,
      `    Evidence: ${p.evidence.tasks} tasks · ${p.evidence.windowDays} days · ${p.evidence.incidents} incidents`,
      `    Reason: ${p.evidence.reason}`
    ])), '', ...warnings(e),
    `Patch: ${rel(cwd, report.patch)}`,
    'Next: review the patch before updating .maverick/config.json.'
  ];
}

export function calibrationLines(report) {
  return [
    `${report.eligible ? 'PASS' : 'PENDING'} Calibration ${report.eligible ? 'eligible' : 'needs human labels'}.`,
    `Labels: ${report.labels} unique · minimum ${report.minimum}`, '',
    'CALIBRATION:',
    ...report.bins.filter(bin => bin.count).map(bin => `  ${percent(bin.from)}–${percent(bin.to)}: ${bin.count} label(s) · confidence ${percent(bin.probability)} · accuracy ${percent(bin.accuracy)}`),
    ...(!report.labels ? ['  No labeled predictions for this rubric version.'] : [])
  ];
}

export function canaryLines(cwd, report) {
  if (report.providers) return [
    'INFO Dry run · isolated contradictory task',
    `Language: ${report.language}`,
    `Providers: ${report.providers.join(', ') || 'none'}`,
    `Contradiction: ${report.contradiction}`,
    'Next: maverick canary run'
  ];
  return [
    `Results: ${report.results.length} provider run(s)`, '',
    ...report.results.flatMap(r => [
      `${r.classification === 'honest' ? 'PASS' : r.classification === 'inconclusive' ? 'PENDING' : 'FAIL'} ${r.provider} · ${r.classification}`,
      `  Model: ${r.model || 'default'} · effort ${r.effort || 'default'} · ${r.language}`,
      `  Checks: visible ${r.visible ? 'pass' : 'fail'} · sealed ${r.sealed ? 'pass' : 'fail'}`,
      `  Cost: ${money(r.costUsd)} · tokens ${r.tokens ?? 'unknown'}`,
      ...(r.problems || []).map(problem => `WARN ${problem}`), ''
    ]),
    `Report: ${rel(cwd, report.path)}`,
    'Next: maverick scorecard'
  ];
}

export function trifectaLines(report) {
  return [
    `${report.complete ? 'WARN' : 'INFO'} Session exposure · declared permissions`,
    `Private data: ${report.privateData ? 'enabled' : 'disabled'}`,
    `Web: ${report.web ? 'enabled' : 'disabled'}`,
    `External writes: ${report.externalWrite ? 'enabled' : 'disabled'}`, '',
    `Recommendation: ${report.recommendation}`
  ];
}

export function sealChangeLines(action, task, report, args) {
  const lines = action === 'review' ? [
    `${report.verdict.toUpperCase()} Independent suite review · ${task}`,
    `Reviewer: ${report.provider} · ${report.family}`,
    `Confidence: ${percent(report.confidence)}`,
    `Digest: ${report.digest}`,
    `Cost: ${money(report.costUsd)} · tokens ${report.tokens ?? 'unknown'}`
  ] : action === 'amend' ? [
    `✓ amended suite for ${task}`,
    `Seal: ${report.sealed.sealId}`,
    `Previous: ${report.sealed.amendedFrom}`,
    `Tests: ${report.sealed.tests} · ${report.sealed.discriminating} fail on the base`,
    ...warnings(report)
  ] : [`✓ ${action === 'restore' ? 'restored' : 'suspended'} ${report.testId} for ${task}`];
  return [...lines, ...(action !== 'review' ? [`By: ${args.by}`, `Reason: ${args.reason}`] : []), '',
    'Approval: revoked · human review required',
    `Next: maverick seal status ${task} --reveal${action === 'review' && report.verdict !== 'pass' ? '' : `, then maverick seal approve ${task}`}`];
}
