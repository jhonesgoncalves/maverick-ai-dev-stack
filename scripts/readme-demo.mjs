// Generates site/public/readme/demo.svg: the looping terminal session at the top of the README.
// The lines are real Maverick output from examples/nestjs-orders-api, trimmed to fit.
// Pure CSS keyframes, so it animates inside a GitHub <img>; without animation support every line is visible.
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'site/public/readme/demo.svg');

const W = 1200, H = 720, CYCLE = 26, FONT = 15, CHAR = 9.03, LINE = 24.5, X = 40, TOP = 104;
const C = { bg: '#070707', term: '#0B0B0B', border: '#292929', text: '#F7F7F5', out: '#CFCFCA', muted: '#9B9B96', dim: '#6B6B66', orange: '#FF6B00', amber: '#FFB15A', ok: '#38C172', warn: '#F6AD55' };
const MONO = "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, 'Liberation Mono', monospace";
const SANS = "Inter, ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";

// [kind, at (s), segments]; a segment is [text, color] or a string in the line's default color.
const script = [
  ['cmd', 0.6, 'npx @maverick-ai/cli new "Add cursor pagination to the orders endpoint"'],
  ['out', 3.9, [['✓ ', C.ok], ['task created: ', C.out], ['add-cursor-pagination-orders-endpoint', C.text]]],
  ['out', 4.1, [['  Workflow: ', C.muted], ['Spec Driven', C.amber], [' (the idea defines an API, integration or shared contract)', C.muted]]],
  ['out', 4.3, [['  Pipeline: ', C.muted], ['[PRD]', C.orange], [' → SPEC → TECHSPEC → TASKS', C.out]]],
  ['out', 4.5, [['  Grounded in: ', C.muted], ['src/orders/orders.service.ts, src/orders/dto/list-orders.dto.ts (+4 more)', C.out]]],
  ['out', 5.1, [['▶ opening Claude Code. ', C.orange], ['The rest of the flow happens there.', C.out]]],
  ['out', 5.8, [['# in the agent: PRD → SPEC → TECHSPEC → 3 subtasks, one question at a time, then built and tested', C.dim]]],
  ['gap'],
  ['cmd', 7.4, 'maverick impact src/orders/orders.service.ts'],
  ['out', 9.2, [['Direct dependents: ', C.muted], ['3', C.text], [' · transitive: ', C.muted], ['7', C.text], [' (2 test files)', C.muted]]],
  ['out', 9.4, [['Entry points affected: ', C.muted], ['6', C.text], ['  GET /api/v1/orders · POST /api/v1/orders · EVENT payment.confirmed …', C.out]]],
  ['out', 9.6, [['Tests to run: ', C.muted], ['src/orders/orders.service.spec.ts, test/orders.e2e-spec.ts', C.out]]],
  ['gap'],
  ['cmd', 11.2, 'maverick flow run ship add-cursor-pagination-orders-endpoint'],
  ['out', 13.6, [['PASS ', C.ok], ['artifacts      ', C.text], ['PRD · SPEC · TECHSPEC · TASKS complete and traced', C.muted]]],
  ['out', 13.95, [['PASS ', C.ok], ['checks         ', C.text], ['npm run lint · typecheck · test · build', C.muted]]],
  ['out', 14.3, [['PASS ', C.ok], ['scope          ', C.text], ['every changed file was declared in the spec', C.muted]]],
  ['out', 14.65, [['PASS ', C.ok], ['security       ', C.text], ['no high-signal risks in the diff', C.muted]]],
  ['out', 15.0, [['PASS ', C.ok], ['dependencies   ', C.text], ['0 manifests, 0 lockfiles changed', C.muted]]],
  ['out', 15.6, [['WAIT ', C.warn], ['human-review   ', C.text], ['a human reviews the change and records the decision', C.muted]]],
  ['gap'],
  ['out', 16.5, [['Outcome: ', C.text], ['AWAITING-APPROVAL', C.orange], [' (failed iteration 0/3)', C.muted]]],
  ['out', 16.7, [['Blocking checks pass; a human must record the pending approval(s).', C.out]]]
];

const pct = seconds => `${(seconds / CYCLE * 100).toFixed(3)}%`;
const FADE_OUT = CYCLE - 1.6, GONE = CYCLE - 0.9;
const esc = text => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const css = [], body = [];
let y = TOP, index = 0;
for (const [kind, at, content] of script) {
  if (kind === 'gap') { y += LINE * 0.55; continue; }
  const id = `l${index++}`;
  // A line is invisible until its time, then stays until the cycle fades out.
  css.push(`@keyframes ${id}{0%,${pct(at)}{opacity:0}${pct(at + 0.15)},${pct(FADE_OUT)}{opacity:1}${pct(GONE)},100%{opacity:0}}`, `.${id}{animation:${id} ${CYCLE}s linear infinite}`);
  if (kind === 'cmd') {
    const chars = content.length + 2, start = X + CHAR * 2, typed = (chars - 2) * 0.034, cursorAt = start + CHAR * (chars - 2);
    body.push(`<text class="${id}" x="${X}" y="${y}"><tspan fill="${C.orange}" font-weight="700">$</tspan><tspan fill="${C.text}" dx="${CHAR}">${esc(content)}</tspan></text>`);
    // A terminal-coloured cover with a block cursor slides right in character steps: the typing effect.
    // Its default opacity is 0, so renderers without CSS animations show the full command.
    css.push(`@keyframes t${id}{0%,${pct(at)}{opacity:0;transform:translateX(0)}${pct(at + 0.01)}{opacity:1;transform:translateX(0);animation-timing-function:steps(${chars - 2},end)}${pct(at + typed)}{opacity:1;transform:translateX(${(cursorAt - start).toFixed(1)}px)}${pct(at + typed + 0.35)}{opacity:1;transform:translateX(${(cursorAt - start).toFixed(1)}px)}${pct(at + typed + 0.36)},100%{opacity:0;transform:translateX(${W}px)}}`, `.t${id}{animation:t${id} ${CYCLE}s linear infinite}`);
    body.push(`<g class="cover t${id}" opacity="0"><rect x="${start}" y="${y - FONT}" width="${W}" height="${LINE}" fill="${C.term}"/><rect x="${start}" y="${y - FONT + 1}" width="${CHAR}" height="${FONT + 4}" fill="${C.orange}" opacity=".9"/></g>`);
  } else {
    const tspans = content.map(([text, color]) => `<tspan fill="${color}">${esc(text)}</tspan>`).join('');
    body.push(`<text class="${id}" x="${X}" y="${y}">${tspans}</text>`);
  }
  y += LINE;
}

// The idle prompt blinks while the screen is empty and after the session ends.
css.push(`@keyframes blink{0%,49%{opacity:1}50%,100%{opacity:0}}`, `.blink{animation:blink 1.1s steps(1,end) infinite}`);
const promptY = y + LINE * 0.55;
css.push(`@keyframes idle{0%,${pct(17.4)}{opacity:0}${pct(17.5)},${pct(FADE_OUT)}{opacity:1}${pct(GONE)},100%{opacity:0}}`, `.idle{animation:idle ${CYCLE}s linear infinite}`);
css.push('@media (prefers-reduced-motion: reduce){*{animation:none!important}.cover,.blink{display:none}}');

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-labelledby="title desc">
<title id="title">Maverick AI in a terminal</title>
<desc id="desc">maverick new turns one sentence into a spec-driven task grounded in the code and opens Claude Code; maverick impact lists the dependents, entry points and tests a change affects; maverick flow run ship passes every evidence gate and waits for a human review decision.</desc>
<defs>
<radialGradient id="glow" cx="${W - 120}" cy="0" r="620" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="${C.orange}" stop-opacity=".16"/><stop offset="1" stop-color="${C.orange}" stop-opacity="0"/></radialGradient>
<clipPath id="screen"><rect x="19" y="63" width="${W - 38}" height="${H - 82}" rx="13"/></clipPath>
<style>text{white-space:pre}${css.join('')}</style>
</defs>
<g font-family="${MONO}" font-size="${FONT}">
<rect width="${W}" height="${H}" rx="22" fill="${C.bg}"/>
<rect width="${W}" height="${H}" rx="22" fill="url(#glow)"/>
<rect x="18" y="18" width="${W - 36}" height="${H - 36}" rx="14" fill="${C.term}" stroke="${C.border}"/>
<path d="M18 62H${W - 18}" stroke="${C.border}"/>
<circle cx="44" cy="40" r="6" fill="#2E2E2E"/><circle cx="64" cy="40" r="6" fill="#2E2E2E"/><circle cx="84" cy="40" r="6" fill="${C.orange}"/>
<text x="${W / 2}" y="45" text-anchor="middle" fill="${C.muted}" font-size="13">~/orders-api — zsh</text>
<text x="${W - 40}" y="45" text-anchor="end" fill="${C.amber}" font-size="12" letter-spacing="2.4">MAVERICK <tspan fill="${C.orange}" font-weight="700">AI</tspan></text>
<g clip-path="url(#screen)">
${body.join('\n')}
</g>
<g class="idle"><text x="${X}" y="${promptY}"><tspan fill="${C.orange}" font-weight="700">$</tspan></text><rect class="blink" x="${X + CHAR * 2}" y="${promptY - FONT + 1}" width="${CHAR}" height="${FONT + 4}" fill="${C.orange}" opacity=".9"/></g>
<text x="${W - 40}" y="${H - 38}" text-anchor="end" fill="${C.dim}" font-family="${SANS}" font-size="13">Context before code. Evidence before merge.</text>
</g>
</svg>
`;

await mkdir(dirname(out), { recursive: true });
await writeFile(out, svg);
console.log(`wrote ${out.replace(`${root}/`, '')} (${svg.length} bytes, ${index} lines, ends at y=${Math.round(promptY)})`);
