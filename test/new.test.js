import test from 'node:test';
import assert from 'node:assert/strict';
import { chmod, mkdir, mkdtemp, readFile, readlink, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { main } from '../src/cli.js';
import { answersFrom, summarize, toggle, toggleAll, validate, wizardSteps } from '../src/ui/init-wizard.js';
import { captureOutput } from '../src/core/util.js';
import { descriptionTerms, groundChange } from '../src/core/grounding.js';
import { parseGeneration, slugFromIdea, workflowForIdea } from '../src/core/generation.js';
import { lintTask, pathReferences } from '../src/core/quality.js';
import { handleMessage } from '../src/mcp/server.js';
import { PRD, TASK_BODY, TECHSPEC, planTask } from './fixtures.js';

process.env.MAVERICK_HOME = await mkdtemp(join(tmpdir(), 'maverick-home-'));

async function shop() {
  const cwd = await mkdtemp(join(tmpdir(), 'maverick-new-'));
  await mkdir(join(cwd, 'src/orders'), { recursive: true }); await mkdir(join(cwd, 'test'));
  await writeFile(join(cwd, 'package.json'), JSON.stringify({ name: 'shop', scripts: { test: 'node --test' } }));
  await writeFile(join(cwd, 'src/orders/list.js'), 'export function listOrders(db, { limit = 20 } = {}) { return db.orders.slice(0, limit); }\n');
  await writeFile(join(cwd, 'src/app.js'), "import { listOrders } from './orders/list.js';\nexport const routes = { orders: listOrders };\n");
  await writeFile(join(cwd, 'src/billing.js'), 'export const invoice = 1;\n');
  await writeFile(join(cwd, 'test/orders.test.js'), "import { listOrders } from '../src/orders/list.js';\n");
  return cwd;
}
const quiet = (argv, cwd) => captureOutput(() => main(argv, cwd));
const IDEA = 'Adicionar paginação na listagem de orders';
const SLUG = 'adicionar-paginacao-listagem-orders';

test('ideas become readable slugs and risky ideas get the strict workflow', () => {
  assert.equal(slugFromIdea(IDEA), SLUG);
  assert.equal(slugFromIdea('!!!'), 'new-task');
  assert.equal(workflowForIdea('Migrar pagamentos para o novo gateway'), 'strict');
  assert.equal(workflowForIdea('Show todo items in a list'), 'standard');
  assert.deepEqual(descriptionTerms('Adicionar paginação por cursor na listagem de pedidos'), ['pagina', 'cursor', 'listag', 'pedido']);
});

test('grounding ranks the files an idea touches, with reasons', async () => {
  const cwd = await shop();
  const ground = await groundChange(cwd, 'Add cursor pagination to the orders list');
  assert.equal(ground.relevant[0].path, 'src/orders/list.js');
  assert.ok(ground.relevant[0].reasons.some(reason => /order/.test(reason)));
  assert.ok(!ground.relevant.some(item => item.path === 'src/billing.js'), 'unrelated files are left out');
  assert.deepEqual(ground.tests, ['test/orders.test.js']);
  assert.equal(ground.commands[0].command, 'npm run test');
});

test('new creates the task from the idea alone, with no templates, and reports the pipeline', async () => {
  const cwd = await shop();
  const { output } = await quiet(['new', IDEA, '--no-launch'], cwd);
  assert.match(output, new RegExp(`task created: ${SLUG}`));
  assert.match(output, /Pipeline: \[PRD\] → TECHSPEC → TASKS/);
  assert.match(output, /Grounded in: src\/orders\/list\.js/);
  const meta = JSON.parse(await readFile(join(cwd, '.maverick/tasks', SLUG, 'TASK.json'), 'utf8'));
  assert.deepEqual([meta.idea, meta.workflow], [IDEA, 'standard']);
  const again = JSON.parse((await quiet(['new', IDEA, '--no-launch', '--json'], cwd)).output);
  assert.equal(again.task, `${SLUG}-2`, 'the same idea twice gets a new slug');
  const risky = JSON.parse((await quiet(['new', 'Remove expired payment tokens', '--json'], cwd)).output);
  assert.equal(risky.workflow, 'strict');
});

test('validate checks each stage: ids, scenarios, real paths, test plan and task coverage', async () => {
  const cwd = await shop();
  await quiet(['new', IDEA, '--slug', 'pages', '--no-launch'], cwd);
  const dir = await planTask(cwd, 'pages');
  assert.deepEqual((await lintTask(cwd, dir, { strict: true })).filter(item => item.status === 'FAIL'), []);
  await quiet(['validate', 'pages', '--strict'], cwd);

  await writeFile(join(dir, 'PRD.md'), PRD.replace('- **THEN** 2 orders and a cursor are returned', ''));
  await writeFile(join(dir, 'TECHSPEC.md'), TECHSPEC.replace('UT-02 → AC-02', 'UT-02 → AC-09').replace('`src/orders/list.js:1` — the query', '`src/orders/missing.js` — the query'));
  await writeFile(join(dir, 'subtasks/task_01.md'), `---\ntitle: Keyset pagination\nstatus: pending\n---\n\n${TASK_BODY.replace('- [ ] AC-02\n', '')}`);
  const messages = (await lintTask(cwd, dir, { strict: true })).map(item => `${item.status} ${item.file}: ${item.message}`);
  assert.ok(messages.some(message => /FAIL PRD.md: a scenario of "Paginated listing" needs WHEN and THEN/.test(message)));
  assert.ok(messages.includes('FAIL TECHSPEC.md: references AC-09, which PRD.md does not define'));
  assert.ok(messages.some(message => /FAIL TECHSPEC.md: references `src\/orders\/missing.js`/.test(message)));
  assert.ok(messages.includes('FAIL TECHSPEC.md: the Test Plan has no test for AC-02'));
  assert.ok(messages.includes('FAIL subtasks/_tasks.md: AC-02 is not covered by any task'));
  assert.ok((await lintTask(cwd, dir)).some(item => item.status === 'WARN' && /AC-02 is not covered/.test(item.message)), 'coverage is only a warning without --strict');
  assert.deepEqual([...new Set((await lintTask(cwd, dir, { stage: 'prd' })).map(item => item.file))], ['PRD.md'], '--stage prd checks only the PRD');
  await assert.rejects(quiet(['validate', 'pages', '--strict'], cwd), /validation error/);
});

test('validate without --stage checks only the stages the task has reached', async () => {
  const cwd = await shop();
  await quiet(['new', IDEA, '--slug', 'early', '--no-launch'], cwd);
  const dir = join(cwd, '.maverick/tasks/early');
  await writeFile(join(dir, 'PRD.md'), PRD);
  const report = JSON.parse((await captureOutput(() => main(['validate', 'early', '--json'], cwd).catch(() => {}))).output);
  assert.equal(report.stage, 'techspec');
  assert.equal(report.checked, 'techspec');
  assert.deepEqual(report.results.filter(item => item.status === 'FAIL').map(item => item.file), ['TECHSPEC.md'], 'only the current stage is missing; later stages are not reported');
  const all = JSON.parse((await captureOutput(() => main(['validate', 'early', '--json', '--all'], cwd).catch(() => {}))).output);
  assert.equal(all.checked, 'all');
  assert.ok(all.results.some(item => item.file === 'subtasks/_tasks.md'), '--all checks every stage');
});

test('placeholders are upper case, so Portuguese "todo" is ordinary text', async () => {
  const cwd = await shop();
  await quiet(['new', IDEA, '--slug', 'pt', '--no-launch'], cwd);
  const dir = await planTask(cwd, 'pt');
  await writeFile(join(dir, 'PRD.md'), PRD.replace('Large accounts time out.', 'Large accounts time out for todo usuário.'));
  assert.ok(!(await lintTask(cwd, dir, { stage: 'prd' })).some(item => /placeholders/.test(item.message)));
  await writeFile(join(dir, 'PRD.md'), PRD.replace('Large accounts time out.', 'TODO'));
  assert.ok((await lintTask(cwd, dir, { stage: 'prd' })).some(item => /placeholders/.test(item.message)));
});

test('path references skip commands, globs and files marked new or created by an earlier task', () => {
  assert.deepEqual(pathReferences('1. `src/a.js:10-20` — x\n- `npm test`\n- `src/*.js`\n- `src/new.js` (new)\n- `src/b.js` (created in task 01)\n- `dist/`'), ['src/a.js', 'dist']);
  assert.deepEqual(pathReferences('- `src/new.js` (new)', { includeNew: true }), ['src/new.js']);
});

test('instructions tell a stage skill what to write, what to read and where to start', async () => {
  const cwd = await shop();
  await quiet(['new', 'Add cursor pagination to the orders list', '--slug', 'pages', '--no-launch'], cwd);
  const payload = JSON.parse((await quiet(['instructions', 'pages', '--json'], cwd)).output);
  assert.equal(payload.stage, 'prd');
  assert.deepEqual([payload.focus.id, payload.focus.skill], ['prd', 'maverick-prd']);
  assert.ok(payload.focus.sections.includes('Requirements'));
  assert.equal(payload.grounding.relevant[0].path, 'src/orders/list.js');
  await writeFile(join(cwd, '.maverick/tasks/pages/PRD.md'), PRD);
  const next = JSON.parse((await quiet(['instructions', 'pages', '--json'], cwd)).output);
  assert.equal(next.stage, 'techspec');
  assert.deepEqual(next.upstream, ['.maverick/tasks/pages/PRD.md']);
  const result = await handleMessage(cwd, { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'ground_change', arguments: { description: 'orders pagination' } } });
  assert.equal(result.result.structuredContent.relevant[0].path, 'src/orders/list.js');
});

async function withFakeClaude(cwd, extra = {}) {
  const bin = join(cwd, 'fake-claude.mjs');
  await writeFile(bin, "#!/usr/bin/env node\nimport { appendFileSync } from 'node:fs';\nappendFileSync('.claude-argv.jsonl', JSON.stringify(process.argv.slice(2)) + '\\n');\n");
  await chmod(bin, 0o755);
  await mkdir(join(cwd, '.maverick'), { recursive: true });
  await writeFile(join(cwd, '.maverick/config.json'), JSON.stringify({ version: 1, runtime: { bins: { 'claude-code': bin } }, ...extra }));
  return async () => (await readFile(join(cwd, '.claude-argv.jsonl'), 'utf8')).trim().split('\n').map(line => JSON.parse(line).at(-1));
}
const FLOW = ['maverick-new', 'maverick-prd', 'maverick-spec', 'maverick-techspec', 'maverick-tasks', 'maverick-build', 'maverick-review', 'maverick-ship', 'maverick-status'];

test('new opens the agent with every flow skill, so the rest of the flow happens inside it', async () => {
  const cwd = await shop(), prompts = await withFakeClaude(cwd, { language: { docs: 'pt-BR', code: 'en' } });
  const { output } = await quiet(['new', 'Add cursor pagination to the orders list', '--slug', 'pages', '--launch', '--agent', 'claude-code'], cwd);
  assert.match(output, new RegExp(`installed for Claude Code: ${FLOW.join(', ')}`));
  assert.match(output, /opening Claude Code\. The rest of the flow happens there/);
  assert.match(output, /Documents in Brazilian Portuguese \(pt-BR\) · code in English \(en\)/);
  for (const skill of FLOW) assert.match(await readFile(join(cwd, '.claude/skills', skill, 'SKILL.md'), 'utf8'), new RegExp(`name: ${skill}`));
  assert.match(await readFile(join(cwd, '.claude/skills/maverick-prd/references/question-protocol.md'), 'utf8'), /One question at a time, in the answer selector[\s\S]*AskUserQuestion/);
  assert.match((await prompts())[0], /Use the maverick-new skill for the Maverick task "pages"[\s\S]*maverick instructions pages --json/);
  assert.deepEqual(JSON.parse((await readFile(join(cwd, '.claude-argv.jsonl'), 'utf8')).split('\n')[0]).slice(0, 4), ['--model', 'opus', '--effort', 'xhigh'], 'the PRD step opens with its recommended model and reasoning');

  // Resuming opens the skill for the current stage; skills are installed once.
  await planTask(cwd, 'pages');
  const resumed = await quiet(['new', 'pages', '--launch', '--agent', 'claude-code'], cwd);
  assert.doesNotMatch(resumed.output, /installed for/);
  assert.match((await prompts()).at(-1), /Use the maverick-build skill for the Maverick task "pages"/);

  // Without an idea, the agent asks for it.
  await quiet(['new', '--launch', '--agent', 'claude-code'], cwd);
  assert.match((await prompts()).at(-1), /Ask me what I want to build/);
  await assert.rejects(quiet(['new', '--no-launch'], cwd), /describe what to build/);
});

test('init sets the two languages and installs the flow skills; language shows and changes them', async () => {
  const cwd = await shop();
  const { output } = await quiet(['init', '--docs-language', 'pt_br', '--code-language', 'EN', '--agents', 'claude-code,codex'], cwd);
  assert.match(output, /Documents: Brazilian Portuguese \(pt-BR\) · code: English \(en\)/);
  assert.match(output, /flow skills installed for claude-code, codex/);
  assert.deepEqual(JSON.parse(await readFile(join(cwd, '.maverick/config.json'), 'utf8')).language, { docs: 'pt-BR', code: 'en' });
  assert.match(await readFile(join(cwd, '.agents/skills/maverick-build/SKILL.md'), 'utf8'), /name: maverick-build/);
  await quiet(['language', 'es'], cwd);
  await quiet(['language', '--code', 'pt-BR'], cwd);
  const shown = JSON.parse((await quiet(['language', '--json'], cwd)).output);
  assert.deepEqual([shown.docs, shown.code], ['es', 'pt-BR']);
  assert.match(shown.rule, /documents[\s\S]*Spanish \(es\)[\s\S]*code[\s\S]*Portuguese/i);
  await assert.rejects(quiet(['language', 'not a language'], cwd), /not a language code/);
  const plain = await shop();
  await quiet(['init', '--no-skills'], plain);
  assert.deepEqual(JSON.parse(await readFile(join(plain, '.maverick/config.json'), 'utf8')).language, { docs: 'en', code: 'en' }, 'defaults without a terminal');
});

test('init interviews through flags: agents share .agents/, AGENTS.md is written and linked, agents can be added later', async () => {
  const cwd = await shop();
  const { output } = await quiet(['init', '--agents', 'claude,kiro,3', '--description', 'Order management for small shops.', '--workflow', 'strict', '--verify', 'npm test; npm run lint'], cwd);
  assert.match(output, /flow skills installed for claude-code, kiro, cursor \(\.agents\/skills, linked into each tool\)/);
  const config = JSON.parse(await readFile(join(cwd, '.maverick/config.json'), 'utf8'));
  assert.deepEqual(config.capabilities.targets, ['claude-code', 'kiro', 'cursor']);
  assert.equal(config.workflow.default, 'strict');
  assert.equal(config.project.description, 'Order management for small shops.');
  assert.deepEqual(config.verification.commands, ['npm test', 'npm run lint']);
  assert.match(await readFile(join(cwd, 'AGENTS.md'), 'utf8'), /Order management for small shops\.[\s\S]*`npm run lint`[\s\S]*\.agents\//);
  assert.equal(await readlink(join(cwd, 'CLAUDE.md')), 'AGENTS.md');
  assert.equal(existsSync(join(cwd, 'GEMINI.md')), false, 'only chosen agents get a link');
  for (const tool of ['.claude', '.kiro', '.cursor']) assert.equal(await readlink(join(cwd, tool, 'skills')), '../.agents/skills');

  const added = await quiet(['init', '--agents', 'gemini'], cwd);
  assert.match(added.output, /agents: claude-code, kiro, cursor, gemini/);
  assert.equal(await readlink(join(cwd, 'GEMINI.md')), 'AGENTS.md');
  assert.equal(await readlink(join(cwd, '.gemini/skills')), '../.agents/skills');
  await assert.rejects(quiet(['init'], cwd), /add agents with maverick init --agents/);
  await assert.rejects(quiet(['init', '--agents', 'vim'], await shop()), /unknown agent vim/);
});

test('init turns an existing CLAUDE.md into AGENTS.md and links it; different files are never overwritten', async () => {
  const cwd = await shop();
  await writeFile(join(cwd, 'CLAUDE.md'), '# House rules\nUse pnpm.\n');
  const { output } = await quiet(['init', '--agents', 'claude,gemini', '--no-skills'], cwd);
  assert.match(output, /CLAUDE\.md moved to AGENTS\.md/);
  assert.equal(await readFile(join(cwd, 'AGENTS.md'), 'utf8'), '# House rules\nUse pnpm.\n');
  assert.equal(await readlink(join(cwd, 'CLAUDE.md')), 'AGENTS.md');
  assert.equal(await readlink(join(cwd, 'GEMINI.md')), 'AGENTS.md');

  const both = await shop();
  await writeFile(join(both, 'AGENTS.md'), 'shared');
  await writeFile(join(both, 'CLAUDE.md'), 'shared');
  await writeFile(join(both, 'GEMINI.md'), 'gemini only');
  const second = await quiet(['init', '--agents', 'claude,gemini', '--no-skills'], both);
  assert.equal(await readlink(join(both, 'CLAUDE.md')), 'AGENTS.md', 'an identical copy becomes the link');
  assert.equal(await readFile(join(both, 'GEMINI.md'), 'utf8'), 'gemini only');
  assert.match(second.output, /GEMINI\.md differs from AGENTS\.md; left as is/);
});

test('the init wizard model: steps skip flag answers, checkboxes toggle in order, answers read back', () => {
  const adapters = [{ id: 'claude-code', name: 'Claude Code', home: '.claude/' }, { id: 'kiro', name: 'Kiro', home: '.kiro/' }, { id: 'codex', name: 'OpenAI Codex', home: '.agents/' }];
  const steps = wizardSteps({ name: 'shop', adapters, suggested: ['kiro'], docs: 'pt-BR', commands: ['npm test', 'npm run lint'], skip: ['workflow'] });
  assert.deepEqual(steps.map(step => step.id), ['name', 'description', 'agents', 'docs', 'code', 'verify']);
  const agents = steps.find(step => step.id === 'agents');
  assert.deepEqual(agents.value, ['kiro']);
  assert.equal(agents.options.find(option => option.value === 'kiro').tag, 'found');
  assert.deepEqual(toggle(agents, ['kiro'], 'claude-code'), ['claude-code', 'kiro'], 'options keep their order');
  assert.deepEqual(toggleAll(agents, ['kiro']), ['claude-code', 'kiro', 'codex']);
  assert.deepEqual(toggleAll(agents, ['claude-code', 'kiro', 'codex']), []);
  assert.match(validate(agents, []), /at least 1/);
  assert.match(validate(steps[0], '  '), /required/);
  assert.equal(validate(steps[1], ''), null, 'the description is optional');
  assert.equal(steps.find(step => step.id === 'docs').options[0].value, 'pt-BR', 'the environment language is suggested first');
  assert.equal(summarize(agents, ['claude-code', 'kiro']), 'Claude Code, Kiro');
  const text = wizardSteps({ name: 'x', adapters, suggested: [], docs: 'en', commands: [] });
  assert.deepEqual(text.find(step => step.id === 'agents').value, ['claude-code'], 'Claude Code when nothing is found');
  assert.deepEqual(answersFrom(text, { ...Object.fromEntries(text.map(step => [step.id, step.value])), verify: 'npm test; make lint' }).verify, ['npm test', 'make lint']);
});

test('instructions give headings and keywords in the docs language, and Portuguese artifacts validate', async () => {
  const cwd = await shop();
  await mkdir(join(cwd, '.maverick'));
  await writeFile(join(cwd, '.maverick/config.json'), JSON.stringify({ version: 1, language: { docs: 'pt-BR', code: 'en' } }));
  await quiet(['new', 'Paginação da listagem de pedidos', '--slug', 'paginas', '--no-launch'], cwd);
  const payload = JSON.parse((await quiet(['instructions', 'paginas', '--json'], cwd)).output);
  assert.ok(payload.focus.sections.includes('Critérios de Aceite') && payload.focus.sections.includes('Fora de Escopo'));
  assert.deepEqual([payload.language.keywords.requirement, payload.language.keywords.then], ['Requisito', 'ENTÃO']);
  assert.match(payload.language.rule, /Brazilian Portuguese \(pt-BR\)[\s\S]*English \(en\)/);
  const dir = await planTask(cwd, 'paginas');
  const pt = PRD.replace('## Overview', '## Visão Geral').replace('## Goals', '## Objetivos').replace('## User Stories', '## Histórias de Usuário').replace('## Acceptance Criteria', '## Critérios de Aceite').replace('## Business Rules', '## Regras de Negócio').replace('## Edge Cases', '## Casos de Borda').replace('## Non-Goals', '## Fora de Escopo').replace('## Open Questions', '## Questões em Aberto')
    .replace('### Requirement: Paginated listing\nThe list SHALL return', '### Requisito: Listagem paginada\nA listagem DEVE retornar').replace('#### Scenario: More orders than the limit\n- **WHEN** 3 orders exist and 2 are requested\n- **THEN**', '#### Cenário: Mais pedidos que o limite\n- **QUANDO** existem 3 pedidos e 2 são pedidos\n- **ENTÃO**');
  await writeFile(join(dir, 'PRD.md'), pt);
  assert.deepEqual((await lintTask(cwd, dir, { strict: true })).filter(item => item.status === 'FAIL'), []);
  await quiet(['review', 'paginas'], cwd);
  const review = await readFile(join(dir, 'REVIEW.md'), 'utf8');
  assert.match(review, /## Critérios de Aceite\n- \[ \] AC-01[\s\S]*## Tarefas[\s\S]*## Decisão\n- \[ \] approve \(aprovar\)/);
  await writeFile(join(dir, 'REVIEW.md'), review.replace('- [ ] approve (aprovar)', '- [x] approve (aprovar)'));
  assert.equal(JSON.parse((await quiet(['status', '--json'], cwd)).output)[0].stage, 'build', 'the decision is read in any language');
});

test('generate runs the three stage skills headlessly, writes each artifact and retries on failures', async () => {
  const cwd = await shop();
  const tasks = `<maverick-subtask id="01" title="Keyset pagination" type="backend" complexity="medium" after="">\n${TASK_BODY}</maverick-subtask>\n<maverick-subtask id="02" title="Document the cursor" type="docs" after="01">\n${TASK_BODY.replace('# Keyset pagination', '# Document the cursor')}</maverick-subtask>`;
  const replies = {
    prd: `<maverick-file name="PRD.md">\n${PRD}</maverick-file>`,
    // The first technical spec misses a test for AC-02; the retry receives the failure and fixes it.
    techspecBroken: `<maverick-file name="TECHSPEC.md">\n${TECHSPEC.replace('- UT-02 → AC-02: a bad cursor throws\n', '')}</maverick-file>`,
    techspec: `<maverick-file name="TECHSPEC.md">\n${TECHSPEC}</maverick-file>`,
    tasks
  };
  await writeFile(join(cwd, 'agent.mjs'), `import { appendFileSync, readFileSync } from 'node:fs';
const prompt = readFileSync(0, 'utf8'), replies = ${JSON.stringify(replies)};
appendFileSync('.prompts.jsonl', JSON.stringify(prompt) + '\\n');
const stage = prompt.includes('running the maverick-prd skill') ? 'prd' : prompt.includes('running the maverick-techspec skill') ? (prompt.includes('Validation failures to fix') ? 'techspec' : 'techspecBroken') : 'tasks';
process.stdout.write(replies[stage] + '\\n\`\`\`maverick-result\\n' + JSON.stringify({ status: stage === 'prd' ? 'needs-input' : 'done', summary: stage + ' written', questions: stage === 'prd' ? ['Largest page size? Recommended: 100'] : [] }) + '\\n\`\`\`\\n');
`);
  await mkdir(join(cwd, '.maverick'));
  await writeFile(join(cwd, '.maverick/config.json'), JSON.stringify({ version: 1, runtime: { trusted: ['fake'], maxPermission: 'read-only', custom: [{ id: 'fake', command: 'node agent.mjs', permissions: ['read-only'] }] } }));
  await quiet(['new', 'Add cursor pagination to the orders list', '--slug', 'pages', '--no-launch'], cwd);
  const { output } = await quiet(['generate', 'pages', '--agent', 'fake'], cwd);
  const dir = join(cwd, '.maverick/tasks/pages');
  assert.equal(await readFile(join(dir, 'PRD.md'), 'utf8'), PRD);
  assert.equal(await readFile(join(dir, 'TECHSPEC.md'), 'utf8'), TECHSPEC);
  assert.match(await readFile(join(dir, 'subtasks/_tasks.md'), 'utf8'), /from: "?01"?\n\s+to: "?02"?/);
  assert.match(output, /TECHSPEC \(fixing validation failures\)/);
  assert.match(output, /Largest page size\?/);
  assert.match(output, /Stage: BUILD/);
  const prompts = (await readFile(join(cwd, '.prompts.jsonl'), 'utf8')).trim().split('\n').map(line => JSON.parse(line));
  assert.equal(prompts.length, 4);
  assert.match(prompts[0], /# Skill: maverick-prd[\s\S]*# Maverick PRD[\s\S]*Skill reference: references\/question-protocol\.md/, 'the prompt is the skill itself');
  assert.match(prompts[0], /src\/orders\/list\.js — /, 'the agent starts from the grounded files');
  assert.match(prompts[1], /# PRD\.md \(earlier stage[\s\S]*AC-01/, 'later stages read earlier artifacts');
  assert.match(prompts[2], /Validation failures to fix[\s\S]*the Test Plan has no test for AC-02/);
  assert.equal(JSON.parse(await readFile(join(dir, 'TASK.json'), 'utf8')).pendingQuestions.length, 1);
  await quiet(['validate', 'pages', '--strict'], cwd);

  // Revising the tasks keeps the ones that started and passes the answers along.
  await quiet(['subtask', 'set', 'pages', '01', 'in-progress'], cwd);
  const revised = await quiet(['generate', 'pages', 'tasks', '--agent', 'fake', '--answers', '1) 100'], cwd);
  assert.match(revised.output, /existing tasks have started/);
  assert.match((await readFile(join(cwd, '.prompts.jsonl'), 'utf8')).trim().split('\n').map(line => JSON.parse(line)).at(-1), /Answers from the user[\s\S]*1\) 100/);
  await assert.rejects(quiet(['generate', 'pages', '--agent', 'fake'], cwd), /planning is complete/);
});

test('parseGeneration keeps only the stage artifact and a valid task graph', () => {
  const text = `<maverick-file name="PRD.md">\n\`\`\`markdown\n# PRD\n\`\`\`\n</maverick-file>
<maverick-file name="TECHSPEC.md">no</maverick-file>
<maverick-subtask id="01" title="Backend" type="backend" complexity="medium">one</maverick-subtask>
<maverick-subtask id="02" title="Frontend" after="01">two</maverick-subtask>
<maverick-subtask id="03" title="Bad" after="04">x</maverick-subtask>
<maverick-subtask id="04" title="Weird" complexity="huge">x</maverick-subtask>`;
  const parsed = parseGeneration(text, ['PRD.md']);
  assert.deepEqual(parsed.files, { 'PRD.md': '# PRD\n' });
  assert.deepEqual(parsed.subtasks.map(item => [item.id, item.after]), [['01', []], ['02', ['01']]]);
  assert.equal(parsed.rejected.length, 3);
});

test('review writes REVIEW.md from the acceptance criteria and the tasks, and guard reads the spec scope', async () => {
  const cwd = await shop();
  await quiet(['new', IDEA, '--slug', 'pages', '--no-launch'], cwd);
  const dir = await planTask(cwd, 'pages');
  await quiet(['review', 'pages'], cwd);
  const review = await readFile(join(dir, 'REVIEW.md'), 'utf8');
  assert.match(review, /- \[ \] AC-01: Given 3 orders[\s\S]*- \[ \] AC-02[\s\S]*- \[ \] 01 Keyset pagination \(pending\)[\s\S]*## Decision/);
  assert.doesNotMatch(review, /FILL ME/);
  const status = JSON.parse((await quiet(['status', '--json'], cwd)).output);
  assert.deepEqual([status[0].stage, status[0].tasks], ['build', { total: 1, done: 0 }]);
});

test('validate wants tasks written as checklists and never done with open items', async () => {
  const cwd = await shop();
  await quiet(['new', IDEA, '--slug', 'pages', '--no-launch'], cwd);
  const dir = await planTask(cwd, 'pages'), file = join(dir, 'subtasks/task_01.md');
  await writeFile(file, `---\ntitle: Keyset pagination\nstatus: pending\n---\n\n${TASK_BODY.replace('- [ ] Add the cursor.', '1. Add the cursor.')}`);
  assert.ok((await lintTask(cwd, dir)).some(item => item.status === 'WARN' && /write "## Steps" as a checklist/.test(item.message)));
  await writeFile(file, `---\ntitle: Keyset pagination\nstatus: done\n---\n\n${TASK_BODY.replace('- [ ] AC-01', '- [x] AC-01')}`);
  const done = (await lintTask(cwd, dir)).find(item => /marked done/.test(item.message));
  assert.equal(done.status, 'FAIL');
  assert.match(done.message, /is marked done with 3 unchecked item\(s\): AC-02; Add the cursor\.; UT-01, UT-02/);
});

test('sync <task> brings an older task to checklists once, keeping content and code blocks', async () => {
  const cwd = await shop();
  await quiet(['new', IDEA, '--slug', 'pages', '--no-launch'], cwd);
  const dir = await planTask(cwd, 'pages'), file = join(dir, 'subtasks/task_01.md'), manifest = join(dir, 'subtasks/_tasks.md');
  const old = TASK_BODY.replaceAll('- [ ] ', '- ').replace('- Add the cursor.', '1. Add the cursor.\n2. Page the query.');
  await writeFile(file, `---\ntitle: Keyset pagination\nstatus: pending\n---\n\n${old}`);
  const text = await readFile(manifest, 'utf8');
  await writeFile(manifest, `${text.slice(0, text.indexOf('- [ ] 01'))}| ID | Title | Status | Depends on |\n|---|---|---|---|\n| 01 | Keyset pagination | pending | — |\n`);
  const dry = JSON.parse((await quiet(['sync', 'pages', '--dry-run', '--json'], cwd)).output);
  assert.deepEqual(dry.changes.map(change => [change.file, change.converted]), [['subtasks/task_01.md', 5], ['subtasks/_tasks.md', 1]]);
  assert.match(await readFile(file, 'utf8'), /1\. Add the cursor/, '--dry-run writes nothing');
  await quiet(['sync', 'pages'], cwd);
  const body = await readFile(file, 'utf8');
  assert.match(body, /- \[ \] AC-01\n- \[ \] AC-02[\s\S]*- \[ \] Add the cursor\.\n- \[ \] Page the query\.[\s\S]*```bash\nnpm test\n```\n- \[ \] UT-01, UT-02/);
  assert.match(body, /- `src\/orders\/list.js` — keyset query/, 'Files stays a plain list');
  assert.match(await readFile(manifest, 'utf8'), /- \[ \] 01 Keyset pagination — pending/);
  assert.deepEqual(JSON.parse((await quiet(['sync', 'pages', '--json'], cwd)).output).changes, [], 'running it again changes nothing');
});

test('a missing task argument names the tasks here instead of guessing when no one can answer', async () => {
  const cwd = await shop();
  await quiet(['new', IDEA, '--slug', 'pages', '--no-launch'], cwd);
  await planTask(cwd, 'pages');
  await assert.rejects(quiet(['validate', '--stage', 'techspec'], cwd), /which task\? pass it: maverick validate <task>; tasks here: pages \(BUILD\)/);
  await assert.rejects(quiet(['flow', 'run', 'ship'], cwd), /pass it: maverick flow run ship <task>/);
  await assert.rejects(quiet(['instructions', 'techspec'], cwd), /pass it: maverick instructions <task>/, 'a stage name in the task position asks for the task');
  await assert.rejects(quiet(['verify', 'missing'], cwd), /task not found: .+; tasks here: pages\. Run it from the project that owns the task/);
  assert.match((await quiet(['validate', 'pages', '--stage', 'prd'], cwd)).output, /VALIDATE/, 'an explicit task is used as given');
});

test('status renders each task as a branded block with its stage pipeline and next step', async () => {
  const cwd = await shop();
  await quiet(['new', IDEA, '--slug', 'pages', '--no-launch'], cwd);
  await planTask(cwd, 'pages');
  const { output } = await quiet(['status'], cwd);
  assert.match(output, /^MAVERICK AI \/ STATUS\n\npages {2}standard {2}0\/1 tasks\n {2}✔ prd {2}› {2}✔ techspec {2}› {2}✔ tasks {2}› {2}● BUILD {2}› {2}○ verify/);
  assert.match(output, /\n {2}Next: .+\n\n1 task\(s\)/);
});

test('every flow skill asks the user through the agent answer selector', async () => {
  for (const name of [...FLOW, 'maverick-loop']) assert.match(await readFile(join(import.meta.dirname, '../capabilities/skills', name, 'SKILL.md'), 'utf8'), /## Asking the user[\s\S]*AskUserQuestion/, name);
});
