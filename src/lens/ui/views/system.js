import { copy, esc, icon, pill } from '../lib.js';
import { store } from '../app.js';

const ui = { cli: '' };
export const title = ({ route }) => ({ changes: 'Changes', cli: 'CLI reference' })[route.page];
export const crumbs = ctx => [`<b>${title(ctx)}</b>`];

const STATUS = { M: ['warn', 'modified'], A: ['ok', 'added'], D: ['bad', 'deleted'], R: ['info', 'renamed'], '??': ['accent', 'new'], U: ['bad', 'conflict'] };

function changes() {
  const git = store.project.git || {}, list = (git.changes || []).map(line => ({ status: line.slice(0, 2).trim() || '?', path: line.slice(3).replace(/^"|"$/g, '').split(' -> ').pop() })), known = new Set((store.project.modules || []).map(m => m.path));
  return `<div class="page"><div class="page-head"><div><h1>Changes</h1><p>Uncommitted work on <span class="mono">${esc(git.branch || 'this branch')}</span>, and what it can break.</p></div></div>
    <div class="grid-2">
      <section class="card"><div class="card-head"><h3>Working tree</h3><span class="count">${list.length}</span>${list.some(c => known.has(c.path)) ? `<div class="right"><a class="btn ghost sm" href="#devtools/impact?file=${encodeURIComponent(list.filter(c => known.has(c.path)).map(c => c.path).join(','))}">Impact of all ${icon('chev')}</a></div>` : ''}</div>
        ${list.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Status</th><th>File</th><th></th></tr></thead><tbody>${list.map(c => { const [tone, label] = STATUS[c.status] || STATUS[c.status?.[0]] || ['', c.status]; return `<tr><td>${pill(label, tone)}</td><td><code>${esc(c.path)}</code></td><td style="text-align:right;white-space:nowrap">${known.has(c.path) ? `<a class="btn sm ghost" href="#devtools/impact?file=${encodeURIComponent(c.path)}">Impact</a>` : ''}<button class="btn sm ghost" data-act="copy" data-text="${esc(c.path)}" aria-label="Copy path">${icon('copy')}</button></td></tr>`; }).join('')}</tbody></table></div>`
          : `<div class="empty-state" style="padding:32px"><div class="glyph">${icon('check')}</div><h3>Working tree is clean</h3><p>Nothing to commit.</p></div>`}</section>
      <section class="card"><div class="card-head"><h3>Recent commits</h3></div>
        ${(git.commits || []).length ? git.commits.map(c => { const [sha, ...msg] = c.split(' '); return `<div class="run-row"><code class="mono muted" style="font-size:12px">${esc(sha)}</code><div class="t"><b>${esc(msg.join(' '))}</b></div><button class="btn sm ghost" data-act="copy" data-text="${esc(sha)}" aria-label="Copy SHA">${icon('copy')}</button></div>`; }).join('') : '<div class="empty">No commits.</div>'}</section>
    </div></div>`;
}

function cli(route) {
  const q = (route.params.get('q') && !ui.cli ? route.params.get('q') : ui.cli).trim().toLowerCase();
  const list = (store.project.commands || []).filter(c => !q || `${c.id} ${c.description} ${c.aliases.join(' ')}`.toLowerCase().includes(q));
  const groups = [...new Set(list.map(c => c.group || 'Other'))];
  return `<div class="page"><div class="page-head"><div><h1>CLI reference</h1><p>Every <span class="mono">maverick</span> command, grouped the way <span class="mono">maverick help</span> shows them.</p></div></div>
    <div class="toolbar"><label class="field">${icon('search')}<input id="cli-q" data-input="cli-search" placeholder="Search commands" value="${esc(ui.cli || route.params.get('q') || '')}" aria-label="Search commands"></label></div>
    ${groups.map(g => `<div class="group-title">${esc(g)} <span class="faint">${list.filter(c => (c.group || 'Other') === g).length}</span></div><div class="rows">${list.filter(c => (c.group || 'Other') === g).map(c => `<div class="task-row" style="grid-template-columns:minmax(160px,220px) minmax(0,1fr) auto;cursor:default"><div class="title"><b class="mono" style="font-size:12.5px">maverick ${esc(c.id)}</b>${c.aliases.length ? `<small>${esc(c.aliases.join(', '))}</small>` : ''}</div><div class="title"><b style="font-weight:400;color:var(--text-2);white-space:normal">${esc(c.description)}</b><small>${esc(`maverick ${c.example}`)}</small></div><button class="btn sm ghost" data-act="copy" data-text="${esc(`maverick ${c.example}`)}" aria-label="Copy usage">${icon('copy')}</button></div>`).join('')}</div>`).join('') || '<div class="card empty">No command matches.</div>'}</div>`;
}

export function render({ route }) {
  if (route.page === 'changes') return changes();
  return cli(route);
}

export const actions = {
  copy: el => copy(el.dataset.text, 'Copied'),
  'cli-search': (el, ctx) => { ui.cli = el.value; ctx.rerender(); }
};
