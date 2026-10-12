import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { loadGraph } from '../subtasks/graph.js';
import { MUST_WORDS, REQUIREMENT_HEADING, SCENARIO_HEADING, THEN_WORDS, WHEN_WORDS } from './language.js';
import { ARTIFACTS, planningStages, requirePreset } from './presets.js';
import { taskPreset } from './tasks.js';
import { exists, hasMeaningfulContent, sectionBody, sectionPresent } from './util.js';

// Content checks for the planning artifacts: required sections, stable ids, requirement
// scenarios, paths that really exist, tests and tasks that trace back to acceptance
// criteria. Each finding is { file, status: 'FAIL' | 'WARN', message }. Levels: `fail`
// always fails, `warn` fails under `strict`, `advice` never fails.

const AC = /\bAC-(\d{2,3})\b/g, SC = /\bSC-(\d{2,3})\b/g;
const normal = match => `AC-${match[1].padStart(2, '0')}`;
export const acIds = text => [...new Set([...String(text).matchAll(AC)].map(normal))];
/** SPEC scenario ids (`SC-01`), the behavioral counterpart of acceptance criteria. */
export const scIds = text => [...new Set([...String(text).matchAll(SC)].map(match => `SC-${match[1].padStart(2, '0')}`))];

/**
 * The criteria a task can be held to: the PRD's acceptance criteria and the SPEC's scenarios,
 * each with its text. Sealed tests and their metrics are counted against these ids.
 */
export function criteriaOf(prd = '', spec = '') {
  const criteria = [];
  for (const line of sectionBody(prd, 'Acceptance Criteria').split('\n')) {
    const id = acIds(line)[0];
    if (id && !criteria.some(item => item.id === id)) criteria.push({ id, text: line.replace(/^\s*[-*]\s*(\[[ xX]\]\s*)?/, '').replace(/^AC-\d{2,3}:?\s*/, '').trim(), source: 'PRD.md' });
  }
  for (const line of sectionBody(spec, 'Behavior').split('\n')) {
    const id = /^#{2,5}\s/.test(line) ? scIds(line)[0] : null;
    if (id && !criteria.some(item => item.id === id)) criteria.push({ id, text: line.replace(/^#{2,5}\s+[^:]*:\s*/, '').replace(/^SC-\d{2,3}\s*/, '').trim(), source: 'SPEC.md' });
  }
  return criteria;
}

/** Backticked, path-looking references in a block of Markdown, without line suffixes. Lines marked new are skipped unless `includeNew`. */
export function pathReferences(text, { includeNew = false } = {}) {
  const refs = [];
  for (const line of String(text).split('\n')) {
    if (!includeNew && /\(new\)|\bnew file\b|\bto be created\b|\bcreated (?:in|by) (?:task|step)\b|\(nov[oa]\)|criad[oa] n[ao] task/i.test(line)) continue;
    for (const [, raw] of line.matchAll(/`([^`\s]+)`/g)) {
      const path = raw.replace(/:\d+(?:-\d+)?$/, '').replace(/\/$/, '').replace(/^\.\//, '');
      if (!path || /[*<>{}$|()]|^[-/~]|:\/\/|^FILL/i.test(path) || /^AC-\d+/.test(path)) continue;
      if (raw.includes('/') || /\.[a-z0-9]{1,8}$/i.test(path)) refs.push(path);
    }
  }
  return [...new Set(refs)];
}

/**
 * TECHSPEC "Do Not Touch" as glob patterns. Unlike `pathReferences`, globs and directories are
 * kept, because this list is enforced: `dist/` becomes `dist/**`, a plain path matches itself.
 */
export function doNotTouchPatterns(spec) {
  const patterns = [];
  for (const [, raw] of sectionBody(spec, 'Do Not Touch').matchAll(/`([^`\s]+)`/g)) {
    const path = raw.replace(/^\.\//, '');
    if (!path || /^[-~]|:\/\/|^FILL|[<>{}$|()]/i.test(path) || path === '/' || path.split('/').includes('..')) continue;
    patterns.push(path.endsWith('/') ? `${path}**` : path);
  }
  return [...new Set(patterns)];
}

/**
 * The files a task says it will touch, new files included: TECHSPEC File References and Impact,
 * plus every subtask's Files section (`all`), and the given subtask's own Files (`subtask`).
 */
export async function declaredScope(taskDir, { subtask } = {}) {
  const spec = await readFile(join(taskDir, 'TECHSPEC.md'), 'utf8').catch(() => ''), graph = await loadGraph(taskDir);
  const files = text => pathReferences(text, { includeNew: true });
  const all = [...new Set(files([sectionBody(spec, 'File References'), sectionBody(spec, 'Impact'), ...graph.items.map(item => sectionBody(item.body, 'Files'))].join('\n')))];
  const own = subtask ? files(sectionBody(graph.items.find(item => item.id === subtask.id)?.body ?? subtask.body ?? '', 'Files')) : [];
  return { all, subtask: own, doNotTouch: doNotTouchPatterns(spec) };
}

function requirementFindings(text, section = 'Requirements') {
  const blocks = sectionBody(text, section).split(REQUIREMENT_HEADING).slice(1), findings = [];
  if (!blocks.length) return [{ level: 'fail', message: `${section} has no "### Requirement:" blocks; write each behavior as a requirement with scenarios` }];
  for (const block of blocks) {
    const name = block.split('\n')[0].trim() || '(unnamed)', [statement, ...scenarios] = block.split(SCENARIO_HEADING);
    if (!MUST_WORDS.test(statement)) findings.push({ level: 'warn', message: `requirement "${name}" does not state what the system SHALL or MUST do` });
    if (!scenarios.length) findings.push({ level: 'fail', message: `requirement "${name}" has no "#### Scenario:"` });
    for (const scenario of scenarios) if (!WHEN_WORDS.test(scenario) || !THEN_WORDS.test(scenario)) findings.push({ level: 'fail', message: `a scenario of "${name}" needs WHEN and THEN lines` });
  }
  return findings;
}

/** Which planning stages of a workflow to check: all of them, or the ones up to `stage`. */
function stagesUpTo(preset, stage) {
  const all = planningStages(preset);
  if (!stage) return all;
  const index = all.indexOf(stage);
  if (index < 0) throw new Error(`stage must be one of ${all.join(', ')} for the ${preset.id} workflow`);
  return all.slice(0, index + 1);
}

/** Lints a task's planning artifacts and subtask graph, optionally only up to one stage. The workflow comes from TASK.json unless `preset` is given. */
export async function lintTask(cwd, dir, { strict = false, stage, preset } = {}) {
  const stages = stagesUpTo(preset || requirePreset(await taskPreset(dir)), stage), results = [];
  const add = (file, level, message) => results.push({ file, status: level === 'fail' || (strict && level === 'warn') ? 'FAIL' : 'WARN', message });
  const read = async file => (await exists(join(dir, file)) ? readFile(join(dir, file), 'utf8') : null);
  const texts = Object.fromEntries(await Promise.all(ARTIFACTS.map(async item => [item.id, await read(item.file)])));
  const skill = { prd: 'maverick-prd', spec: 'maverick-spec', techspec: 'maverick-techspec', tasks: 'maverick-tasks' };

  for (const item of ARTIFACTS.filter(entry => stages.includes(entry.stage))) {
    const text = texts[item.id];
    if (text === null) { add(item.file, 'fail', `not written yet; run the ${skill[item.stage]} skill`); continue; }
    for (const section of item.sections) if (!sectionPresent(text, section)) add(item.file, 'fail', `missing section "${section}"`);
    if (!hasMeaningfulContent(text)) add(item.file, 'fail', 'placeholders (TODO, TBD, FILL ME) remain');
  }

  // The PRD owns the acceptance criteria; everything downstream references its ids.
  const prd = texts.PRD, criteria = prd ? acIds(sectionBody(prd, 'Acceptance Criteria')) : [];
  if (prd) {
    const listed = [...sectionBody(prd, 'Acceptance Criteria').matchAll(AC)].map(normal);
    if (!listed.length) add('PRD.md', 'fail', 'acceptance criteria have no stable ids; write them as "- [ ] AC-01: Given …, when …, then …"');
    for (const id of new Set(listed.filter((value, index) => listed.indexOf(value) !== index))) add('PRD.md', 'fail', `${id} is defined more than once`);
    if (!/^###\s+(?:US|HU)-\d+/m.test(sectionBody(prd, 'User Stories'))) add('PRD.md', 'warn', 'User Stories has no "### US-01: …" stories');
    for (const finding of requirementFindings(prd)) add('PRD.md', finding.level, finding.message);
  }

  // The behavioral spec turns every criterion into scenarios and contracts; nothing may be left untraced.
  const behavior = stages.includes('spec') ? texts.SPEC : null;
  if (behavior) {
    for (const finding of requirementFindings(behavior, 'Behavior')) add('SPEC.md', finding.level, finding.message);
    if (!/```/.test(sectionBody(behavior, 'Contracts'))) add('SPEC.md', 'warn', 'Contracts has no code block; write the request, response, event or function shapes exactly');
    if (!/\S/.test(sectionBody(behavior, 'Invariants'))) add('SPEC.md', 'warn', 'Invariants is empty; list what must always hold, or write "None"');
    for (const id of acIds(behavior)) if (criteria.length && !criteria.includes(id)) add('SPEC.md', 'fail', `references ${id}, which PRD.md does not define`);
    const traced = acIds(sectionBody(behavior, 'Traceability'));
    for (const id of criteria.filter(id => !traced.includes(id))) add('SPEC.md', 'warn', `Traceability does not map ${id} to a scenario or contract`);
  }

  const spec = stages.includes('techspec') ? texts.TECHSPEC : null;
  if (spec) {
    const refs = pathReferences(['File References', 'Impact', 'Do Not Touch'].map(name => sectionBody(spec, name)).join('\n'));
    for (const path of refs) if (!await exists(join(cwd, path))) add('TECHSPEC.md', 'warn', `references \`${path}\`, which does not exist; fix the path or mark the line (new)`);
    if (!refs.length) add('TECHSPEC.md', 'warn', 'File References lists no real paths');
    const tested = acIds(sectionBody(spec, 'Test Plan'));
    for (const id of acIds(spec)) if (criteria.length && !criteria.includes(id)) add('TECHSPEC.md', 'fail', `references ${id}, which PRD.md does not define`);
    for (const id of criteria.filter(id => !tested.includes(id))) add('TECHSPEC.md', 'warn', `the Test Plan has no test for ${id}`);
  }

  if (stages.includes('tasks')) {
    const graph = await loadGraph(dir);
    if (!graph.items.length && !graph.problems.length) add('subtasks/_tasks.md', 'fail', 'no tasks yet; run the maverick-tasks skill');
    for (const problem of graph.problems) add('subtasks/_tasks.md', 'fail', problem);
    if (graph.items.length > 10) add('subtasks/_tasks.md', 'advice', `${graph.items.length} tasks; a typical feature needs 3-7, merge the ones that share a boundary`);
    const covered = new Set();
    for (const item of graph.items) {
      const file = `subtasks/${item.file}`, ids = acIds(item.body);
      ids.forEach(id => covered.add(id));
      if (!hasMeaningfulContent(item.body)) add(file, 'fail', 'placeholders (TODO, TBD, FILL ME) remain');
      if (criteria.length && !ids.length) add(file, 'warn', 'does not say which acceptance criteria it satisfies');
      for (const id of ids) if (criteria.length && !criteria.includes(id)) add(file, 'fail', `references ${id}, which PRD.md does not define`);
      if (!sectionPresent(item.body, 'Verification')) add(file, 'warn', 'has no "## Verification" section');
      // Steps and tests are checklists the build checks off one by one.
      for (const section of ['Steps', 'Verification']) if (sectionPresent(item.body, section) && !/^\s*[-*] \[[ xX]\] /m.test(sectionBody(item.body, section))) add(file, 'warn', `write "## ${section}" as a checklist ("- [ ] …") so the build can check each item`);
      if (item.status === 'done' && item.checklist.open.length) add(file, 'fail', `is marked done with ${item.checklist.open.length} unchecked item(s): ${item.checklist.open.map(entry => entry.text).join('; ')}`);
      for (const path of pathReferences(sectionBody(item.body, 'Files'))) if (!await exists(join(cwd, path))) add(file, 'warn', `references \`${path}\`, which does not exist; fix the path or mark the line (new)`);
    }
    if (graph.items.length) for (const id of criteria.filter(id => !covered.has(id))) add('subtasks/_tasks.md', 'warn', `${id} is not covered by any task`);
  }
  return results;
}
