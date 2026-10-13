import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { loadConfig } from '../core/config.js';
import { scorecard } from '../decide/scorecard.js';
import { calibration, loadRubric, RUBRICS } from '../decide/decisions.js';
import { sealReport } from '../sealed/seal.js';
import { readLedger } from '../loop/ledger.js';
import { sealPaths } from '../sealed/model.js';
import { postMergeIncidents } from '../decide/policies.js';
import { interval } from '../decide/scorecard.js';

export async function decisionDashboard(cwd) {
  const config = await loadConfig(cwd);
  const rubrics = await Promise.all(Object.keys(RUBRICS).map(async id => ({ id, ...await calibration(cwd, await loadRubric(cwd, id)) })));
  return { scorecard: await scorecard(cwd, config), rubrics };
}

/** Metadata only: the panel never returns test bodies, names or private review transcripts. */
export async function holdoutDashboard(cwd) {
  const config = await loadConfig(cwd), tasks = [], warnings = [];
  const dirs = await readdir(join(cwd, config.taskRoot), { withFileTypes: true }).catch(() => []);
  for (const dir of dirs.filter(d => d.isDirectory())) {
    try {
      const report = await sealReport({ cwd, task: dir.name, taskDir: join(cwd, config.taskRoot, dir.name), config });
      if (!report.sealed) continue;
      const sealed = report.sealed, entries = await readLedger(sealPaths(cwd, dir.name, sealed.sealId).ledger);
      const last = entries.findLast(e => e.type === 'seal-run');
      const loopDirs = await readdir(join(cwd, config.taskRoot, dir.name, 'loops'), { withFileTypes: true }).catch(() => []);
      const loops = await Promise.all(loopDirs.filter(d => d.isDirectory()).map(d => readFile(join(cwd, config.taskRoot, dir.name, 'loops', d.name, 'state.json'), 'utf8').then(JSON.parse).catch(() => null)));
      const spent = loops.filter(Boolean).reduce((sum, loop) => ({ cost: sum.cost + (loop.spent?.costUsd || 0), time: sum.time + (loop.spent?.activeMs || 0), unknown: sum.unknown + (loop.spent?.costUnknown || 0) }), { cost: 0, time: 0, unknown: 0 });
      const durationMs = entries.filter(e => e.type === 'seal-run').reduce((sum, e) => sum + (e.data.durationMs || 0), 0);
      const extraCost = sealed.authoring?.costUsd != null && (sealed.review?.costUsd != null || !sealed.review) ? sealed.authoring.costUsd + (sealed.review?.costUsd || 0) : null;
      tasks.push({ task: dir.name, state: report.state, sealId: sealed.sealId, surface: sealed.surface, tests: sealed.tests, discriminating: sealed.discriminating, baseFailureRate: sealed.tests ? sealed.discriminating / sealed.tests : null, queries: report.queries, suspended: sealed.suspended?.length || 0, amended: Boolean(sealed.amendedFrom), review: sealed.review || null, approval: sealed.approval || null, ledgerValid: report.ledger.ok, S: last?.data.S ?? null, OI: last?.data.OI ?? null, durationMs, overhead: { cost: spent.cost && !spent.unknown && extraCost !== null ? extraCost / spent.cost : null, time: spent.time && sealed.authoring ? (durationMs + sealed.authoring.durationMs) / spent.time : null } });
    } catch (error) { warnings.push(`${dir.name}: ${error.message}`); }
  }
  const history = await postMergeIncidents(cwd, config.autonomy?.windowDays || 30), merged = [...new Set(history.commits.map(c => c.task).filter(Boolean))];
  const cohorts = [true, false].map(sealed => {
    const group = merged.filter(task => tasks.some(t => t.task === task) === sealed);
    return { sealed, tasks: group.length, defects: interval(group.filter(task => history.incidents.some(i => i.task === task)).length, group.length), observational: true };
  });
  return { tasks, warnings, cohorts, amendmentRate: tasks.length ? tasks.filter(t => t.amended).length / tasks.length : null, targets: { baseFailureRate: 0.9, amendmentRate: 0.2, overhead: 0.15 } };
}
