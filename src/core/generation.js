import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseFrontmatter } from '../capabilities/model.js';
import { COMPLEXITY } from '../subtasks/graph.js';
import { STAGE_SKILLS } from './pipeline.js';
import { packageRoot } from './util.js';

// Headless generation runs the same stage skills an interactive agent follows. The skill
// text is the source of truth: this module wraps it with the facts `maverick instructions`
// would return, an output format, and the rules of a non-interactive, read-only run.
// It is pure apart from reading the bundled skills, and it never writes files.

/**
 * Heuristic workflow for an idea: security, data, payment or migration work gets strict review;
 * work that defines an API, an integration or another shared contract gets a behavioral spec.
 */
export function workflowForIdea(idea = '') {
  const text = idea.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  if (/\b(migrat|auth|login|password|senha|token|permiss|payment|pagamento|billing|cobranc|secur|seguranc|encrypt|cripto|gdpr|lgpd|pii|delete|exclu|drop)/.test(text)) return 'strict';
  return /\b(apis?\b|endpoints?|webhooks?|integra|contract|contrato|protoc|openapi|graphql|grpc|sdk\b|spec-driven|sdd\b)/.test(text) ? 'spec-driven' : 'standard';
}

const SMALL_WORDS = new Set('a an and or of to for in on with the at by from o os as um uma uns umas de do da dos das no na nos nas em para por pelo pela com e ou ao aos que'.split(' '));

/** A readable slug from an idea: "Adicionar paginação na rota de orders" → adicionar-paginacao-rota-orders. */
export function slugFromIdea(idea = '') {
  const words = idea.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().split(/[^a-z0-9]+/).filter(word => word && !SMALL_WORDS.has(word));
  let slug = '';
  for (const word of words) { if (`${slug}-${word}`.length > 48) break; slug = slug ? `${slug}-${word}` : word; if (slug.split('-').length >= 6) break; }
  return slug.length >= 2 ? slug : 'new-task';
}

/** The body of a bundled stage skill and its references, without frontmatter. */
export async function stageSkill(stage) {
  const dir = join(packageRoot, 'capabilities', 'skills', STAGE_SKILLS[stage]);
  const body = parseFrontmatter(await readFile(join(dir, 'SKILL.md'), 'utf8')).body.trim();
  const references = [];
  for (const file of (await readdir(join(dir, 'references')).catch(() => [])).filter(name => name.endsWith('.md')).sort()) references.push({ file: `references/${file}`, text: (await readFile(join(dir, 'references', file), 'utf8')).trim() });
  return { name: STAGE_SKILLS[stage], body, references };
}

function groundingSummary(ground) {
  if (!ground) return 'No grounding: search the repository yourself.';
  return [
    `Stack: ${ground.stack.languages.join(', ') || 'unknown'}${ground.stack.frameworks.length ? ` · ${ground.stack.frameworks.join(', ')}` : ''}`,
    `Verification commands: ${ground.commands.map(item => `\`${item.command}\`${item.cwd !== '.' ? ` (in ${item.cwd})` : ''}`).join(', ') || 'none detected'}`,
    `Instruction files: ${ground.instructions.join(', ') || 'none'}`,
    'Relevant files (ranked by match with the idea, then by how widely they are imported):',
    ...(ground.relevant.length ? ground.relevant.map(item => `- ${item.path} — ${item.reasons.join('; ')}; imported by ${item.fanIn}; ${item.commits} recent commit(s)`) : ['- none matched']),
    ...(ground.neighbors.length ? ['Their dependencies:', ...ground.neighbors.map(path => `- ${path}`)] : []),
    ...(ground.tests.length ? ['Tests near them:', ...ground.tests.map(path => `- ${path}`)] : []),
    ...(ground.routes.length ? ['Matching entry points:', ...ground.routes.map(route => `- ${route.method || route.kind} ${route.path} → ${route.file}:${route.line}`)] : []),
    ...(ground.shared.length ? ['Widely shared (changes ripple):', ...ground.shared.map(item => `- ${item.path} (imported by ${item.importers})`)] : []),
    ...(ground.doNotTouch.length ? [`Generated or lock files: ${ground.doNotTouch.join(', ')}`] : [])
  ].join('\n');
}

const OUTPUT = {
  prd: 'Return the complete PRD inside one tag, with no code fence around the tag:\n\n<maverick-file name="PRD.md">\n# PRD — <title>\n…\n</maverick-file>',
  spec: 'Return the complete behavioral spec inside one tag, with no code fence around the tag:\n\n<maverick-file name="SPEC.md">\n# Spec — <title>\n…\n</maverick-file>',
  techspec: 'Return the complete technical spec inside one tag, with no code fence around the tag:\n\n<maverick-file name="TECHSPEC.md">\n# Technical Spec — <title>\n…\n</maverick-file>',
  tasks: 'Return the tasks in dependency order, each in its own tag, with the body in the task format. `after` lists the ids of earlier tasks it depends on (comma separated, empty when none). `type` is a short kebab-case area such as backend, frontend, data or docs. `complexity` is low, medium or high:\n\n<maverick-subtask id="01" title="Short imperative title" type="backend" complexity="medium" after="">\n# Short imperative title\n…\n</maverick-subtask>'
};

/**
 * The prompt for one stage. `upstream` holds earlier artifacts ({ file, text }), `current` the
 * stage's own artifact when it is being revised, and `findings` validation failures to fix.
 */
export function buildStagePrompt({ slug, stage, idea, workflow, answers = [], ground, skill, upstream = [], current = '', findings = [], sections = [], authoring = {}, language }) {
  const rules = authoring.rules?.[stage.toUpperCase()] || [];
  return [
    `You are running the ${skill.name} skill for the Maverick task "${slug}" non-interactively. Follow the skill below, with these differences:
- You cannot ask the user. Where the skill says to ask, take your recommended option and record it under Open Questions as "question → assumption taken". Put the questions that would change scope, behavior or the acceptance criteria in "questions" of the result block, with status "needs-input".
- You cannot write files or run commands that change anything. Read and search the repository freely. Maverick writes what you return and runs the validation, so skip the steps that run maverick commands: their output is already below.
- Planning only: never change source code, tests or configuration.`,
    language ? `# Language\n\n${language.rule}\nUse exactly these headings: ${sections.join(', ')}. Requirement blocks are \`### ${language.keywords.requirement}:\` with \`#### ${language.keywords.scenario}:\`, stating what the system ${language.keywords.must} do, with **${language.keywords.when}** and **${language.keywords.then}** lines. Keep the ids (US-01, AC-01, SC-01, UT-01) as they are.` : '',
    `# The task\n\nIdea: ${idea.trim()}\nWorkflow: ${workflow}${answers.length ? `\n\nAnswers from the user (they override earlier assumptions):\n${answers.map(answer => `- ${answer}`).join('\n')}` : ''}`,
    authoring.context ? `# Project context (constraints for you, not content to copy)\n\n${authoring.context.trim()}` : '',
    `# What maverick instructions returns\n\n${groundingSummary(ground)}${sections.length ? `\n\nRequired headings: ${sections.join(', ')}` : ''}${rules.length ? `\n\nProject rules for this stage:\n${rules.map(rule => `- ${rule}`).join('\n')}` : ''}`,
    ...upstream.map(item => `# ${item.file} (earlier stage; read it in full)\n\n${item.text.trim()}`),
    current ? `# Current ${stage === 'tasks' ? 'tasks' : 'version'} (revise it: keep what is still right, including human edits)\n\n${current.trim()}` : '',
    findings.length ? `# Validation failures to fix\n\n${findings.map(item => `- ${item.file}: ${item.message}`).join('\n')}` : '',
    `# Skill: ${skill.name}\n\n${skill.body}`,
    ...skill.references.map(item => `# Skill reference: ${item.file}\n\n${item.text}`),
    `# Output format\n\n${OUTPUT[stage]}\n\nEnd your message with exactly one fenced block:\n\n\`\`\`maverick-result\n{"status": "done" | "needs-input" | "blocked", "summary": "one or two sentences", "questions": [], "filesChanged": []}\n\`\`\``
  ].filter(Boolean).join('\n\n');
}

const attributes = text => Object.fromEntries([...text.matchAll(/([a-z-]+)="([^"]*)"/gi)].map(match => [match[1].toLowerCase(), match[2]]));
/** Some agents wrap the whole body in a Markdown fence anyway; unwrap it. */
const unwrap = body => { const trimmed = body.trim(), match = trimmed.match(/^```(?:markdown|md)?\s*\n([\s\S]*?)\n```$/); return `${(match ? match[1] : trimmed).trim()}\n`; };

/**
 * Extracts artifacts and tasks from an agent's answer. Unknown files, invalid attributes and
 * dependencies on later or unknown tasks are reported in `rejected`, never written.
 */
export function parseGeneration(text = '', allowedFiles = []) {
  const files = {}, subtasks = [], rejected = [];
  for (const [, name, body] of text.matchAll(/<maverick-file\s+name="([^"]+)"\s*>([\s\S]*?)<\/maverick-file>/g)) {
    if (!allowedFiles.includes(name)) { rejected.push(`file ${name} is not produced by this stage`); continue; }
    if (!body.trim()) { rejected.push(`file ${name} is empty`); continue; }
    files[name] = unwrap(body);
  }
  const declared = new Set();
  for (const [, attrs, body] of text.matchAll(/<maverick-subtask\s+([^>]*)>([\s\S]*?)<\/maverick-subtask>/g)) {
    const { id = String(subtasks.length + 1).padStart(2, '0'), title = '', type, complexity, after = '' } = attributes(attrs);
    const deps = after.split(/[\s,]+/).filter(Boolean), missing = deps.find(dep => !declared.has(dep));
    const problem = !title.trim() ? 'has no title'
      : type && !/^[a-z0-9-]+$/.test(type) ? `has an invalid type "${type}"`
        : complexity && !COMPLEXITY.includes(complexity) ? `has an invalid complexity "${complexity}"`
          : missing ? `depends on ${missing}, which is not an earlier task` : null;
    if (problem) { rejected.push(`task ${id} ${problem}`); continue; }
    declared.add(id);
    subtasks.push({ id, title: title.trim(), type: type || undefined, complexity: complexity || undefined, after: deps, body: unwrap(body) });
  }
  return { files, subtasks, rejected };
}
