// Terminal styling for plain (non-Ink) command output. Colour is only emitted
// on an interactive terminal, so pipes, files, CI logs and tests stay plain.
// Honours NO_COLOR, FORCE_COLOR and TERM=dumb.

/** @param {{ isTTY?: boolean }} [stream] */
export function colorEnabled(stream = process.stdout) {
  if (process.env.NO_COLOR) return false;
  if (process.env.FORCE_COLOR !== undefined) return process.env.FORCE_COLOR !== '0';
  return Boolean(stream?.isTTY) && process.env.TERM !== 'dumb';
}

/** @returns {(text: unknown, stream?: { isTTY?: boolean }) => string} */
const sgr = (open, close = 0) => (text, stream) => colorEnabled(stream) ? `\x1b[${open}m${text}\x1b[${close}m` : String(text);

export const style = {
  bold: sgr(1, 22), dim: sgr(2, 22), italic: sgr(3, 23), underline: sgr(4, 24),
  brand: sgr('1;38;5;202', '22;39'), text: sgr('1;97', '22;39'), amber: sgr('38;5;214', 39), gray: sgr('38;5;244', 39),
  green: sgr(32, 39), red: sgr(31, 39), yellow: sgr(33, 39), cyan: sgr(36, 39), blue: sgr(34, 39)
};

const BADGES = {
  PASS: '1;30;42', OK: '1;30;42', DONE: '1;30;42',
  WARN: '1;30;43', PENDING: '1;30;43',
  FAIL: '1;97;41', ERROR: '1;97;41', BLOCK: '1;97;41', BLOCKED: '1;97;41',
  SKIP: '1;97;100', INFO: '1;30;46'
};

/** A coloured status pill such as ` PASS `; plain `PASS` when colour is off. */
export function badge(label, stream) {
  const code = BADGES[label] || '1;30;47';
  return colorEnabled(stream) ? `\x1b[${code}m ${label} \x1b[0m` : label;
}

export function rule(width = 48, stream) {
  const columns = Math.min(width, (stream || process.stdout).columns || width);
  return style.gray('─'.repeat(Math.max(8, columns)), stream);
}

const ESC = '\x1b[';
const HEADER = /^MAVERICK AI(?: \/ (.+))?$/;
const STATUS = new RegExp(`^(\\s*)(${Object.keys(BADGES).join('|')})(?= |$)(.*)$`);
const SECTION = /^([A-Z][\w &/()'.-]{0,48}):$/;
const KEY_VALUE = /^([A-Z][\w /-]{0,22}):(\s+)(\S.*)$/;
const COMMAND_HINT = /\bmaverick(?: (?:[a-z<[][^\s;,)]*|--[\w-]+))+/g;
const URL = /\bhttps?:\/\/[^\s)]+/g;

/** The wordmark as the logo draws it: MAVERICK in white, AI in brand orange. */
export function wordmark(stream) { return `${style.text('MAVERICK', stream)} ${style.brand('AI', stream)}`; }

function inline(text) {
  return text.replace(URL, url => style.underline(style.cyan(url))).replace(COMMAND_HINT, hint => style.cyan(hint));
}

function decorateLine(line) {
  if (!line || line.includes(ESC)) return line;
  const header = line.match(HEADER);
  if (header) return `${wordmark()}${header[1] ? `${style.gray(' › ')}${style.bold(header[1])}` : ''}\n${rule()}`;
  const status = line.match(STATUS);
  if (status) {
    const [, indent, label, rest] = status, cut = rest.indexOf(' — ');
    return `${indent}${badge(label)}${cut < 0 ? inline(rest) : `${inline(rest.slice(0, cut))}${style.gray(rest.slice(cut))}`}`;
  }
  if (/^\s*✓/.test(line)) return line.replace('✓', style.green('✔'));
  if (/^\s*[✗✖]/.test(line)) return style.red(line);
  if (/^#{1,4} /.test(line)) return style.brand(line);
  if (SECTION.test(line)) return style.amber(style.bold(line));
  if (/^[A-Z][A-Z0-9 -]{2,40}$/.test(line)) return style.bold(line);
  const pair = line.match(KEY_VALUE);
  if (pair) return `${style.gray(`${pair[1]}:`)}${pair[2]}${inline(pair[3])}`;
  return inline(line);
}

/** Adds colour to the conventional plain-text shapes commands print (headers, PASS/WARN/FAIL, ✓, sections, hints). */
export function decorate(message) {
  const text = String(message);
  if (!colorEnabled() || /^\s*[[{]/.test(text)) return text;
  return text.split('\n').map(decorateLine).join('\n');
}
