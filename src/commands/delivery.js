import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { getTask } from '../core/tasks.js';
import { brand, exists, output, packageRoot, rel, replaceVars } from '../core/util.js';

const ADAPTERS = {
  codex: ['adapters/codex/AGENTS.md.example', 'AGENTS.md'],
  'claude-code': ['adapters/claude-code/CLAUDE.md.example', 'CLAUDE.md'],
  cursor: ['adapters/cursor/maverick.mdc.example', '.cursor/rules/maverick.mdc'],
  generic: ['adapters/generic/ROLE_PROMPT.txt', '.maverick/ROLE_PROMPT.txt']
};

async function learn(cwd, slug, options = {}) {
  await getTask(cwd, slug);
  if (!options.rule || options.rule === true) throw new Error('provide a rule with --rule "..."');
  const dir = join(cwd, '.maverick'), path = join(dir, 'LEARNINGS.md');
  await mkdir(dir, { recursive: true });
  const existing = await exists(path) ? await readFile(path, 'utf8') : '# Maverick Learnings\n\nProposed reusable rules. Promote only after team review.\n';
  await writeFile(path, `${existing}\n- [ ] ${options.rule}\n  - Source task: \`${slug}\`\n`);
  output(options.json ? JSON.stringify({ path: rel(cwd, path), rule: options.rule }) : `${brand()} / LEARN\n✓ proposed rule saved: ${rel(cwd, path)}`);
}

async function handoff(cwd, slug, options = {}) {
  const { dir, preset } = await getTask(cwd, slug), present = {};
  for (const file of ['EVIDENCE.md', 'REVIEW-FINDINGS.md', 'SECURITY-REPORT.md', 'DEPENDENCY-REVIEW.md', 'SCOPE-GUARD.md', 'CHECKPOINT.md']) present[file] = await exists(join(dir, file));
  const task = await readFile(join(dir, 'TASK.md'), 'utf8');
  const goal = task.match(/^## Goal\n([^\n]*)/m)?.[1].trim() || 'See TASK.md.';
  const remaining = Object.entries(present).filter(([, value]) => !value).map(([file]) => file), path = join(dir, 'HANDOFF.md');
  await writeFile(path, `# Handoff — ${slug}\n\n## Goal\n${goal}\n\n## Workflow\nPreset: ${preset.name}\n\n## Completed evidence\n${Object.entries(present).filter(([, value]) => value).map(([file]) => `- \`${file}\``).join('\n') || '- none'}\n\n## Still needed\n${remaining.map(file => `- \`${file}\``).join('\n') || '- Complete human review and PR decision.'}\n\n## Next owner\nName/agent: ${options.to || 'FILL ME'}\n\n## Notes\nRead TASK.md, CONTEXT.md, and the reports listed above before continuing.\n`);
  output(options.json ? JSON.stringify({ path: rel(cwd, path), remaining }) : `${brand()} / HANDOFF\n✓ handoff: ${rel(cwd, path)}\nRemaining reports: ${remaining.length}`);
}

async function adapter(cwd, action, name, options = {}) {
  if (action === 'list') return output(options.json ? JSON.stringify(Object.keys(ADAPTERS)) : `${brand()} / ADAPTERS\n${Object.keys(ADAPTERS).join('\n')}`);
  if (action !== 'install' || !ADAPTERS[name]) throw new Error(`use adapter list or adapter install <${Object.keys(ADAPTERS).join('|')}>`);
  const [source, target] = ADAPTERS[name], destination = join(cwd, target);
  if (await exists(destination)) throw new Error(`adapter target already exists: ${rel(cwd, destination)}`);
  await mkdir(dirname(destination), { recursive: true }); await copyFile(join(packageRoot, source), destination);
  output(options.json ? JSON.stringify({ adapter: name, path: rel(cwd, destination) }) : `${brand()} / ADAPTER\n✓ ${name}: ${rel(cwd, destination)}`);
}

async function ci(cwd, provider, slug, options = {}) {
  if (provider !== 'github') throw new Error('only the github CI generator is currently available');
  await getTask(cwd, slug);
  const destination = join(cwd, '.github', 'workflows', `maverick-${slug}.yml`);
  if (await exists(destination)) throw new Error(`CI workflow already exists: ${rel(cwd, destination)}`);
  await mkdir(dirname(destination), { recursive: true });
  await writeFile(destination, replaceVars(await readFile(join(packageRoot, 'templates', 'github-actions-maverick.yml'), 'utf8'), { TASK_SLUG: slug }));
  output(options.json ? JSON.stringify({ provider, task: slug, path: rel(cwd, destination) }) : `${brand()} / CI\n✓ GitHub Actions workflow: ${rel(cwd, destination)}`);
}

async function draftPr(cwd, slug, options = {}) {
  const { dir, preset } = await getTask(cwd, slug);
  const task = await readFile(join(dir, 'TASK.md'), 'utf8');
  const evidence = await exists(join(dir, 'EVIDENCE.md')) ? await readFile(join(dir, 'EVIDENCE.md'), 'utf8') : 'Verification evidence has not been captured.';
  const findings = await exists(join(dir, 'REVIEW-FINDINGS.md')) ? 'Diff review report is available in REVIEW-FINDINGS.md.' : 'Diff review has not been run.';
  const goal = task.match(/^## Goal\n([^\n]*)/m)?.[1].trim() || 'See TASK.md.', path = join(dir, 'PR-DRAFT.md');
  await writeFile(path, `# PR Draft — ${slug}\n\n## Summary\n${goal}\n\n## Workflow\nPreset: ${preset.name}\n\n## Verification\n${evidence.includes('## PASS') ? 'Automated verification evidence captured in EVIDENCE.md.' : evidence}\n\n## Review\n${findings}\n\n## Risks / rollback\nSee TASK.md and PLAN.md.\n\n## Human Review\n- [ ] Scope, behavior, tests, and security-sensitive decisions reviewed.\n`);
  output(options.json ? JSON.stringify({ path: rel(cwd, path) }) : `${brand()} / PR\n✓ draft: ${rel(cwd, path)}`);
}

export const deliveryCommands = [
  { id: 'learn', description: 'Capture a proposed reusable engineering rule.', aliases: [], usage: 'learn <task> --rule <text>', run: ({ cwd, arg, options }) => learn(cwd, arg, options) },
  { id: 'handoff', description: 'Create a task handoff with remaining gates.', aliases: [], usage: 'handoff <task> --to <owner>', run: ({ cwd, arg, options }) => handoff(cwd, arg, options) },
  { id: 'adapter', description: 'List or install an AI adapter.', aliases: [], usage: 'adapter list|install <name>', run: ({ cwd, arg, third, options }) => adapter(cwd, arg, third, options) },
  { id: 'ci', description: 'Generate a GitHub Actions task gate.', aliases: [], usage: 'ci github <task>', run: ({ cwd, arg, third, options }) => ci(cwd, arg, third, options) },
  { id: 'pr', description: 'Generate an evidence-backed PR draft.', aliases: [], usage: 'pr <task>', run: ({ cwd, arg, options }) => draftPr(cwd, arg, options) }
];
