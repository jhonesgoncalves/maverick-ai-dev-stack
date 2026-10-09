import { pretty } from '../core/util.js';
import { sha256 } from './model.js';

// Key-level edits inside files people also edit by hand. Every handler works on text so
// the engine can stage, compare and roll back uniformly, and exposes the same contract:
//   read(text, pointer) → fingerprint | undefined   (undefined when the key is absent)
//   write(text, pointer, value) → text    remove(text, pointer) → text
//   fingerprint(pointer, value) → what read() returns once `value` is written

const getAt = (object, pointer) => pointer.reduce((node, key) => (node && typeof node === 'object' ? node[key] : undefined), object);
const hashValue = value => sha256(JSON.stringify(value));

const json = {
  parse(text, path) {
    if (text === null || !text.trim()) return {};
    try { return JSON.parse(text); } catch { throw new Error(`cannot merge into ${path}: it is not plain JSON (comments are not supported)`); }
  },
  read(text, pointer, path) { const value = getAt(json.parse(text, path), pointer); return value === undefined ? undefined : hashValue(value); },
  write(text, pointer, value, path) {
    const document = json.parse(text, path);
    let node = document;
    for (const key of pointer.slice(0, -1)) { if (!node[key] || typeof node[key] !== 'object') node[key] = {}; node = node[key]; }
    node[pointer.at(-1)] = value;
    return pretty(document);
  },
  remove(text, pointer, path) {
    const document = json.parse(text, path), parent = getAt(document, pointer.slice(0, -1));
    if (parent && typeof parent === 'object') delete parent[pointer.at(-1)];
    return pretty(document);
  },
  fingerprint: (_pointer, value) => hashValue(value)
};

// TOML: Maverick owns whole tables (`[a.b]` plus its `[a.b.*]` subtables) and never parses
// the rest of the file, so comments and formatting elsewhere survive untouched.
const bareKey = key => (/^[A-Za-z0-9_-]+$/.test(key) ? key : JSON.stringify(key));
const scalar = value => (Array.isArray(value) ? `[${value.map(scalar).join(', ')}]` : typeof value === 'string' ? JSON.stringify(value) : String(value));
const HEADER = /^\s*\[\s*([^[\]]+?)\s*\]\s*(?:#.*)?$/, ARRAY_HEADER = /^\s*\[\[/;
const headerName = line => line.match(HEADER)?.[1].split('.').map(part => part.trim().replace(/^"(.*)"$/, '$1')).join('.');

function renderTable(name, value) {
  const plain = Object.entries(value).filter(([, item]) => item === null || typeof item !== 'object' || Array.isArray(item));
  const nested = Object.entries(value).filter(([, item]) => item && typeof item === 'object' && !Array.isArray(item) && Object.keys(item).length);
  const lines = [`[${name.split('.').map(bareKey).join('.')}]`, ...plain.filter(([, item]) => item !== null).map(([key, item]) => `${bareKey(key)} = ${scalar(item)}`)];
  return [lines.join('\n'), ...nested.map(([key, item]) => renderTable(`${name}.${key}`, item))].join('\n\n');
}

function findBlock(lines, name) {
  const start = lines.findIndex(line => headerName(line) === name);
  if (start < 0) return null;
  let end = start + 1;
  while (end < lines.length && !ARRAY_HEADER.test(lines[end]) && !(HEADER.test(lines[end]) && headerName(lines[end]) !== name && !headerName(lines[end]).startsWith(`${name}.`))) end++;
  while (end > start + 1 && !lines[end - 1].trim()) end--;
  return { start, end };
}

/** Refuses layouts where the same table could also be defined with dotted keys or inline tables. */
function assertSafe(lines, pointer, path) {
  const [root, child] = pointer;
  let current = '';
  for (const line of lines) {
    if (HEADER.test(line) || ARRAY_HEADER.test(line)) { current = headerName(line) || ''; continue; }
    const key = line.match(/^\s*("[^"]+"|[A-Za-z0-9_-]+)\s*[.=]/)?.[1]?.replace(/"/g, '');
    if (!key) continue;
    if ((current === '' && key === root) || (current === root && key === child)) throw new Error(`cannot merge into ${path}: ${pointer.join('.')} is defined with dotted keys or an inline table; edit it manually`);
  }
}

const normalize = block => block.split('\n').map(line => line.trim()).filter(line => line && !line.startsWith('#')).join('\n');

const toml = {
  read(text, pointer, path) {
    if (!text) return undefined;
    const lines = text.split('\n');
    assertSafe(lines, pointer, path);
    const block = findBlock(lines, pointer.join('.'));
    return block ? sha256(normalize(lines.slice(block.start, block.end).join('\n'))) : undefined;
  },
  write(text, pointer, value, path) {
    const lines = (text || '').split('\n');
    assertSafe(lines, pointer, path);
    const rendered = renderTable(pointer.join('.'), value), block = findBlock(lines, pointer.join('.'));
    if (block) return [...lines.slice(0, block.start), rendered, ...lines.slice(block.end)].join('\n');
    const base = (text || '').replace(/\s*$/, '');
    return `${base ? `${base}\n\n` : ''}${rendered}\n`;
  },
  remove(text, pointer) {
    const lines = (text || '').split('\n'), block = findBlock(lines, pointer.join('.'));
    if (!block) return text;
    return [...lines.slice(0, block.start), ...lines.slice(block.end)].join('\n').replace(/\n{3,}/g, '\n\n').replace(/^\n+/, '').replace(/\n+$/, '\n');
  },
  fingerprint: (pointer, value) => sha256(normalize(renderTable(pointer.join('.'), value)))
};

export function formatFor(path) { return /\.toml$/i.test(path) ? toml : json; }
