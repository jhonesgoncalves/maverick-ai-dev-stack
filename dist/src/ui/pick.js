import { emitKeypressEvents } from 'node:readline';
import { style } from '../core/style.js';

// A small arrow-key picker for plain commands (no Ink). It draws on stderr so stdout stays
// clean for --json and pipes, and it only runs on an interactive terminal.

/** True when a person can answer a prompt: stdin and stderr are terminals and this is not CI. */
export function canPrompt() { return Boolean(process.stdin.isTTY && process.stderr.isTTY) && !process.env.CI; }

/**
 * Asks the user to choose one item. Items are `{ value, label, detail?, dim? }` or `{ separator: 'text' }`.
 * Resolves the chosen value, or null when the user cancels with Esc, q or Ctrl+C.
 */
export function pick({ title, hint, items, initial = 0 }) {
  const out = process.stderr, input = process.stdin;
  const selectable = items.map((item, index) => (item.separator ? -1 : index)).filter(index => index >= 0);
  if (!selectable.length) return Promise.resolve(null);
  const s = (fn, text) => fn(text, out);
  let index = selectable.includes(initial) ? initial : selectable[0], drawn = 0;

  const row = (item, i) => {
    if (item.separator) return s(style.gray, `  ${item.separator}`);
    const on = i === index, label = on ? s(style.text, item.label) : item.dim ? s(style.gray, item.label) : item.label;
    return `${on ? s(style.brand, '❯') : ' '} ${label}${item.detail ? `  ${on ? item.detail : s(style.gray, item.detail)}` : ''}`;
  };
  const render = () => {
    const lines = [`${s(style.brand, '?')} ${s(style.bold, title)}${hint ? `  ${s(style.gray, hint)}` : ''}`, ...items.map(row), s(style.gray, '  ↑/↓ move · enter select · esc cancel')];
    out.write(`${drawn ? `\x1b[${drawn}A` : ''}${lines.map(line => `\x1b[2K${line}`).join('\n')}\n`);
    drawn = lines.length;
  };
  const move = step => { const at = selectable.indexOf(index); index = selectable[(at + step + selectable.length) % selectable.length]; render(); };

  return new Promise(resolve => {
    const finish = value => {
      input.off('keypress', onKey);
      input.setRawMode(false);
      input.pause();
      // Replace the list with a one-line summary of the answer.
      out.write(`\x1b[${drawn}A\x1b[0J${value === null ? `${s(style.gray, '✖')} ${title} ${s(style.gray, 'cancelled')}` : `${s(style.green, '✔')} ${title} ${s(style.text, items[index].label.trim())}`}\n\x1b[?25h`);
      resolve(value === null ? null : value);
    };
    const onKey = (text, key = {}) => {
      if (key.ctrl && key.name === 'c') return finish(null);
      if (key.name === 'escape' || text === 'q') return finish(null);
      if (key.name === 'up' || text === 'k') return move(-1);
      if (key.name === 'down' || text === 'j' || key.name === 'tab') return move(1);
      if (key.name === 'return' || key.name === 'enter') return finish(items[index].value);
      const number = Number(text);
      if (number >= 1 && number <= selectable.length) { index = selectable[number - 1]; render(); }
    };
    emitKeypressEvents(input);
    input.setRawMode(true);
    input.resume();
    input.on('keypress', onKey);
    out.write('\x1b[?25l');
    render();
  });
}
