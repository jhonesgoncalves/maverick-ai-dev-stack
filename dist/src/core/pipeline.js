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
  pr: (slug, meta) => (meta.pullRequest?.opened
    ? `merge the pull request (${meta.pullRequest.url}), then finish the task: maverick done ${slug}`
    : `open the pull request: maverick flow run pr ${slug} drafts it, waits for its approval and opens it; then maverick done ${slug}`),
  done: slug => `nothing: the task is finished (maverick reopen ${slug} to work on it again)`
};

const DECISION = /- \[[xX]\] (?:approve|approve with follow-up|request changes)/;

/** TASK.json, read here rather than through tasks.js, which imports this module. */
const readMeta = async dir => { try { return JSON.parse(await readFile(join(dir, 'TASK.json'), 'utf8')); } catch { return {}; } };

/** The current stage of a task, what to do next, and the state of each planning artifact. */
export async function taskStage(dir, preset, slug = '') {
  const artifacts = {}, meta = await readMeta(dir);
  for (const item of ARTIFACTS) artifacts[item.id] = await exists(join(dir, item.file));
  const graph = await loadGraph(dir);
  const tasks = { total: graph.items.length, done: graph.items.filter(item => item.status === 'done').length };
  const has = file => exists(join(dir, file));
  const review = await has('REVIEW.md') ? await readFile(join(dir, 'REVIEW.md'), 'utf8') : '';
  let stage;
  // The first planning artifact of this workflow that is missing is the stage to write.
  const planning = planningStages(preset).find(id => id === 'tasks' ? !tasks.total : !artifacts[artifactForStage(id).id]);
  // A finished task stays finished, whatever its files say, until someone reopens it.
  if (meta.done) stage = 'done';
  else if (planning) stage = planning;
  else if (tasks.done < tasks.total) stage = 'build';
  else if (!await has('EVIDENCE.md')) stage = 'verify';
  else if (preset.strict && !await has('SECURITY-REPORT.md')) stage = 'security';
  else if (!DECISION.test(review)) stage = 'review';
  else stage = 'pr';
  return { stage, next: NEXT[stage](slug, meta), artifacts, tasks };
}
