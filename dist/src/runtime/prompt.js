import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import { exists } from '../core/util.js';

/** Rules prepended to every headless run. Agents return data; Maverick and humans own side effects. */
export const HEADLESS_RULES = `You are running non-interactively under Maverick. Follow these rules:
- Work only inside this repository and only within the task scope below. TASK.md is the scope contract.
- Do not commit, push, open pull requests, publish packages, or change CI/CD, credentials, or secrets. A human does that after review.
- Do not add dependencies or change public contracts unless the task explicitly allows it.
- If you are blocked or need a decision, stop and ask in the result block instead of guessing.
- Run the relevant verification commands before finishing and report their real results.
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

const TASK_FILES = ['SPEC.md', 'TASK.md', 'CONTEXT.md', 'PLAN.md'];

/** Builds the full prompt: rules, task artifacts, the current subtask, and the instruction. */
export async function buildPrompt({ taskDir, task, subtask, instruction, issues = [] }) {
  const sections = [HEADLESS_RULES, `# Task: ${task}`];
  for (const file of TASK_FILES) {
    const path = join(taskDir, file);
    if (await exists(path)) sections.push(`## ${file}\n\n${(await readFile(path, 'utf8')).trim()}`);
  }
  if (subtask) sections.push(`## Current subtask ${subtask.id}: ${subtask.title}\n\nWork only on this subtask. Its dependencies (${subtask.dependsOn.join(', ') || 'none'}) are done.\n\n${subtask.body.trim()}`);
  if (issues.length) sections.push(`## Blocking issues to fix\n\nThe last verification run failed. Fix these without widening scope, then re-run the checks:\n\n${issues.map(issue => `- ${issue}`).join('\n')}`);
  sections.push(`## Instruction\n\n${instruction || (subtask ? `Implement subtask ${subtask.id}.` : 'Implement the task criterion by criterion.')}`);
  return sections.join('\n\n');
}
