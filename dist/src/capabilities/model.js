import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { basename, join, relative, sep } from 'node:path';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import { z } from 'zod';

/**
 * A capability is a directory with one portable entry file. The entry file's name
 * decides the kind; everything else in the directory ships with it (skills only).
 */
export const ENTRY_FILES = { skill: 'SKILL.md', agent: 'AGENT.md', command: 'COMMAND.md', mcp: 'MCP.json' };
export const KINDS = Object.keys(ENTRY_FILES);
export const AGENT_TOOLS = ['read', 'edit', 'shell', 'web'];

const name = z.string().regex(/^[a-z0-9][a-z0-9-]{0,62}$/, 'use a lowercase kebab-case name');
const version = z.string().regex(/^\d+\.\d+\.\d+(?:[-+][\w.-]+)?$/, 'use a semantic version such as 1.0.0');
const common = {
  name, version: version.default('1.0.0'),
  description: z.string().min(10, 'describe when an agent should use it (10+ characters)').max(1024),
  tags: z.array(z.string()).default([]),
  targets: z.array(z.string()).optional()
};

const serverSchema = z.union([
  z.object({ command: z.string().min(1), args: z.array(z.string()).default([]), env: z.record(z.string(), z.string()).default({}) }),
  z.object({ url: z.url(), type: z.enum(['http', 'sse']).default('http'), headers: z.record(z.string(), z.string()).default({}) })
]);

export const SCHEMAS = {
  skill: z.object({ ...common, 'allowed-tools': z.array(z.string()).optional() }),
  // Portable permissions; each adapter maps them to its own tool names.
  agent: z.object({ ...common, tools: z.array(z.enum(AGENT_TOOLS)).optional(), model: z.string().optional() }),
  command: z.object({ ...common, 'argument-hint': z.string().optional() }),
  mcp: z.object({ ...common, server: serverSchema })
};

export function sha256(content) { return createHash('sha256').update(content).digest('hex'); }

/** Splits `---\nyaml\n---\nbody` into data and body. Files without frontmatter have empty data. */
export function parseFrontmatter(text) {
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!match) return { data: {}, body: text };
  return { data: parseYaml(match[1]) || {}, body: text.slice(match[0].length) };
}

/** Renders frontmatter, dropping undefined and empty values so each tool gets only what it reads. */
export function renderFrontmatter(data, body) {
  const clean = Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined && value !== '' && !(Array.isArray(value) && !value.length)));
  return `---\n${stringifyYaml(clean, { lineWidth: 0 }).trimEnd()}\n---\n\n${body.replace(/^\s+/, '')}`;
}

async function listFiles(dir, root = dir) {
  const files = [];
  for (const entry of (await readdir(dir, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
    if (entry.name.startsWith('.')) continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...await listFiles(path, root));
    else if (entry.isFile()) files.push(relative(root, path).split(sep).join('/'));
  }
  return files;
}

function formatIssues(error) { return error.issues.map(issue => `${issue.path.join('.') || '(root)'}: ${issue.message}`).join('; '); }

/** Loads and validates a capability directory. Throws a descriptive error on invalid content. */
export async function loadCapability(dir, source = 'local') {
  const entries = await readdir(dir).catch(() => []);
  const kinds = KINDS.filter(kind => entries.includes(ENTRY_FILES[kind]));
  if (kinds.length !== 1) throw new Error(`${dir}: expected exactly one of ${Object.values(ENTRY_FILES).join(', ')}`);
  const kind = kinds[0], entry = ENTRY_FILES[kind];
  const text = await readFile(join(dir, entry), 'utf8');
  let data, body = '';
  if (kind === 'mcp') {
    try { data = JSON.parse(text); } catch (error) { throw new Error(`${dir}/${entry}: invalid JSON (${error.message})`); }
  } else ({ data, body } = parseFrontmatter(text));
  const parsed = SCHEMAS[kind].safeParse(data);
  if (!parsed.success) throw new Error(`${dir}/${entry}: ${formatIssues(parsed.error)}`);
  if (parsed.data.name !== basename(dir)) throw new Error(`${dir}/${entry}: name "${parsed.data.name}" must match its directory "${basename(dir)}"`);
  if (kind !== 'mcp' && !body.trim()) throw new Error(`${dir}/${entry}: the body is empty; add the instructions the agent should follow`);
  const files = kind === 'skill' ? await listFiles(dir) : [entry];
  const contents = Object.fromEntries(await Promise.all(files.map(async file => [file, await readFile(join(dir, file))])));
  // Integrity covers every shipped file, so any catalog edit is detectable in the lockfile.
  const integrity = sha256(files.map(file => `${file}\0${sha256(contents[file])}`).join('\n'));
  return { ref: `${kind}/${parsed.data.name}`, kind, ...parsed.data, body, dir, source, entry, files, contents, integrity };
}
