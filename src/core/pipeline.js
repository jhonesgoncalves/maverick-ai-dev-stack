import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { loadGraph } from '../subtasks/graph.js';
import { ARTIFACTS, artifactForStage, planningStages } from './presets.js';
import { exists } from './util.js';

// Where a task stands is derived from its files, never stored, so it cannot drift:
// the first planning artifact that is missing is the current stage; after planning,
// task progress, evidence and the human review decision move it forward.

export const STAGE_SKILLS = { prd: 'maverick-prd', spec: 'maverick-spec', techspec: 'maverick-techspec', tasks: 'maverick-tasks' };

const NEXT = {
  prd: slug => `write the PRD: run the maverick-prd skill for ${slug}`,
  spec: slug => `write the behavioral spec: run the maverick-spec skill for ${slug}, then get it approved`,
  techspec: slug => `write the technical spec: run the maverick-techspec skill for ${slug}`,
  tasks: slug => `break it into tasks: run the maverick-tasks skill for ${slug}`,
  build: slug => `implement the next task with the maverick-build skill (maverick subtask next ${slug})`,
  verify: slug => `verify and review with the maverick-review skill (maverick verify ${slug})`,
  security: slug => `run the security gate with the maverick-review skill (maverick security ${slug})`,
  review: () => `review with the maverick-review skill, then record the human decision in REVIEW.md`,
  pr: slug => `ship with the maverick-ship skill (maverick readiness ${slug}, maverick pr ${slug})`
};

const DECISION = /- \[[xX]\] (?:approve|approve with follow-up|request changes)/;

/** The current stage of a task, what to do next, and the state of each planning artifact. */
export async function taskStage(dir, preset, slug = '') {
  const artifacts = {};
  for (const item of ARTIFACTS) artifacts[item.id] = await exists(join(dir, item.file));
  const graph = await loadGraph(dir);
  const tasks = { total: graph.items.length, done: graph.items.filter(item => item.status === 'done').length };
  const has = file => exists(join(dir, file));
  const review = await has('REVIEW.md') ? await readFile(join(dir, 'REVIEW.md'), 'utf8') : '';
  let stage;
  // The first planning artifact of this workflow that is missing is the stage to write.
  const planning = planningStages(preset).find(id => id === 'tasks' ? !tasks.total : !artifacts[artifactForStage(id).id]);
  if (planning) stage = planning;
  else if (tasks.done < tasks.total) stage = 'build';
  else if (!await has('EVIDENCE.md')) stage = 'verify';
  else if (preset.strict && !await has('SECURITY-REPORT.md')) stage = 'security';
  else if (!DECISION.test(review)) stage = 'review';
  else stage = 'pr';
  return { stage, next: NEXT[stage](slug), artifacts, tasks };
}
