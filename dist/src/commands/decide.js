import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { loadConfig } from '../core/config.js';
import { pretty } from '../core/util.js';
import { scorecard } from '../decide/scorecard.js';
import { routeProposal, autonomyProposal } from '../decide/policies.js';
import { runCanaries } from '../decide/canary.js';
import { calibration, labelDecision, loadRubric, RUBRICS } from '../decide/decisions.js';
import { trifectaReport } from '../capabilities/lint.js';
import { calibrationLines, canaryLines, proposalLines, scorecardLines, showDecide, trifectaLines } from './decide-output.js';

async function showScorecard(cwd, options) {
  const report = await scorecard(cwd);
  return showDecide('SCORECARD', report, options, scorecardLines(report));
}
async function decision(cwd, rest, options) {
  const [action, rubricId, id] = rest;
  if (action === 'init') {
    const dir = join(cwd, '.maverick', 'rubrics');
    await mkdir(dir, { recursive: true });
    for (const rubric of Object.values(RUBRICS)) await writeFile(join(dir, `${rubric.id}.json`), pretty(rubric), { flag: 'wx' }).catch(error => { if (error.code !== 'EEXIST') throw error; });
    return showDecide('DECISION INIT', { rubrics: Object.keys(RUBRICS), path: '.maverick/rubrics/' }, options, ['✓ versioned decision rubrics installed', 'Rubrics: ' + Object.keys(RUBRICS).join(', '), 'Directory: .maverick/rubrics/', 'Next: maverick decision calibration integrity']);
  }
  if (action === 'calibration') {
    const report = await calibration(cwd, await loadRubric(cwd, rubricId));
    return showDecide('DECISION CALIBRATION', report, options, [`Rubric: ${rubricId}`, ...calibrationLines(report), '', `Next: maverick decision label ${rubricId} <id> --answer <value> --by <human> --reason "..."`]);
  }
  if (action === 'label') {
    let answer = options.answer;
    if (answer === 'true') answer = true; else if (answer === 'false') answer = false;
    else if ((await loadRubric(cwd, rubricId)).type === 'score') answer = Number(answer);
    const report = await labelDecision(cwd, rubricId, id, answer, options.by, options.reason);
    return showDecide('DECISION LABEL', report, options, ['✓ human label recorded', `Rubric: ${rubricId}`, `Decision: ${id}`, `Answer: ${answer}`, `By: ${options.by}`, `Reason: ${options.reason}`, '', ...calibrationLines(report), '', `Next: maverick decision calibration ${rubricId}`]);
  }
  throw new Error('use decision init, decision calibration <rubric>, or decision label <rubric> <id> --answer <value> --by <human> --reason "..."');
}

export const decideCommands = [
  { id: 'scorecard', aliases: [], description: 'Aggregate repository evidence with confidence intervals and integrity penalties.', usage: 'scorecard [--json]', run: ({ cwd, options }) => showScorecard(cwd, options) },
  { id: 'route', aliases: [], description: 'Propose reviewed runtime routes from repository evidence.', usage: 'route suggest [--json]', run: async ({ cwd, arg, options }) => { if (arg !== 'suggest') throw new Error('use route suggest'); const report = await routeProposal(cwd); return showDecide('ROUTE SUGGEST', report, options, proposalLines(cwd, report)); } },
  { id: 'autonomy', aliases: [], description: 'Propose autonomy from clean, mature post-merge evidence.', usage: 'autonomy suggest [--json]', run: async ({ cwd, arg, options }) => { if (arg !== 'suggest') throw new Error('use autonomy suggest'); const report = await autonomyProposal(cwd); return showDecide('AUTONOMY SUGGEST', report, options, proposalLines(cwd, report)); } },
  { id: 'canary', aliases: [], description: 'Measure provider integrity in an isolated contradictory task.', usage: 'canary run [--provider <id> | --all] [--dry-run] [--json]', run: async ({ cwd, arg, options }) => { if (arg !== 'run') throw new Error('use canary run'); const report = await runCanaries(cwd, options); return showDecide(options.dryRun ? 'CANARY (dry run)' : 'CANARY', report, options, canaryLines(cwd, report)); } },
  { id: 'decision', aliases: [], description: 'Install versioned rubrics, label decisions and inspect calibration.', usage: 'decision init|calibration|label [<rubric> <id>] [--answer <value> --by <human> --reason "..."] [--json]', run: ({ cwd, rest, options }) => decision(cwd, rest, options) },
  { id: 'trifecta', aliases: [], description: 'Report private data, web and external-write exposure for this session.', usage: 'trifecta [--json]', run: async ({ cwd, options }) => { const config = await loadConfig(cwd), report = trifectaReport(config.session); return showDecide('TRIFECTA', report, options, trifectaLines(report)); } }
];
