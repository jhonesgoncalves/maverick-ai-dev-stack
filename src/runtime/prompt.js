import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import { exists } from '../core/util.js';

/** Rules prepended to every headless run. Agents return data; Maverick and humans own side effects. */
export const HEADLESS_RULES = `You are running non-interactively under Maverick. Follow these rules:
- Work only inside this repository and only within the task scope below. PRD.md (what), SPEC.md when present (the exact behavior and contracts) and TECHSPEC.md (how) are the scope contract.
- Do not commit, push, open pull requests, publish packages, or change CI/CD, credentials, or secrets. A human does that after review.
- Do not add dependencies or change public contracts unless the task explicitly allows it.
- If you are blocked or need a decision, stop and ask in the result block instead of guessing.
- Report the real results of every verification command you run; never claim a check passed that you did not run.
- End your final message with exactly one fenced block in this format:

\`\`\`maverick-result
{"status": "done" | "blocked" | "needs-input", "summary": "one or two sentences", "questions": [], "filesChanged": []}
\`\`\``;

export const resultSchema = z.object({
  status: z.enum(['done', 'blocked', 'needs-input']),
  summary: z.string().default(''),
  questions: z.array(z.string()).default([]),
  filesChanged: z.array(z.string()).default([])
});

/** Extracts the last `maverick-result` block. Returns null when missing or invalid, never throws. */
export function parseResultBlock(text = '') {
  const blocks = [...text.matchAll(/```maverick-result\s*\n([\s\S]*?)```/g)];
  if (!blocks.length) return null;
  try {
    const parsed = resultSchema.safeParse(JSON.parse(blocks.at(-1)[1]));
    return parsed.success ? parsed.data : null;
  } catch { return null; }
}

const TASK_FILES = ['PRD.md', 'SPEC.md', 'TECHSPEC.md'];

/** Builds the full prompt: rules, task artifacts, the current subtask, and the instruction. */
export async function buildPrompt({ taskDir, task, subtask, subtaskFile, instruction, issues = [], commands = [], shell = 'all' }) {
  const sections = [HEADLESS_RULES, `# Task: ${task}`];
  const list = commands.map(item => `- \`${item.command}\`${item.cwd ? ` (in \`${item.cwd}/\`)` : ''}`).join('\n');
  if (shell === 'verification') sections.push(`## Verification commands\n\nIn this run you can run these commands, with extra arguments (for example a single test file), and read-only git (\`git status\`, \`git diff\`, \`git log\`, \`git show\`). Any other shell command is denied, so use these instead of calling tools directly (\`npm run test -- <file>\`, not \`npx jest <file>\`). Run the relevant ones before finishing:\n\n${list || '- none detected; say so in the result'}`);
  else if (shell === 'none') sections.push(`## Verification commands\n\nThis run cannot execute shell commands, so do not try. Maverick runs verification after you finish; make the change complete and name in the summary what should be checked.${list ? `\n\nThe project's checks:\n\n${list}` : ''}`);
  else sections.push(`## Verification commands\n\nRun the relevant ones before finishing:\n\n${list || '- none detected; find the project\'s test command'}`);
  for (const file of TASK_FILES) {
    const path = join(taskDir, file);
    if (await exists(path)) sections.push(`## ${file}\n\n${(await readFile(path, 'utf8')).trim()}`);
  }
  // The task file is the progress record: `subtask set … done` refuses while any item is open.
  const record = subtaskFile ? `\n\nThe checklist lives in \`${subtaskFile}\` and is your progress record. As each item becomes true (a criterion met, a step done, a test written and passing), change its \`- [ ]\` to \`- [x]\` in that file, one at a time, never in a batch at the end and never before it is true. Leave an item unchecked when you did not do it or could not verify it, and say why in the result. Do not edit anything else in the file.` : '';
  if (subtask) sections.push(`## Current subtask ${subtask.id}: ${subtask.title}\n\nWork only on this subtask. Its dependencies (${subtask.dependsOn.join(', ') || 'none'}) are done.${record}\n\n${subtask.body.trim()}`);
  if (issues.length) sections.push(`## Blocking issues to fix\n\nThe last verification run failed. Fix these without widening scope, then re-run the checks:\n\n${issues.map(issue => `- ${issue}`).join('\n')}`);
  sections.push(`## Instruction\n\n${instruction || (subtask ? `Implement subtask ${subtask.id}.` : 'Implement the task criterion by criterion.')}`);
  return sections.join('\n\n');
}
