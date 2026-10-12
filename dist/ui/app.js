// Lens shell: data store, hash router, sidebar, command palette and live refresh.
import { $, api, closeOverlays, esc, icon, STAGE_LABEL, taskState, toast } from './lib.js';
import * as inbox from './views/inbox.js';
import * as tasks from './views/tasks.js';
import * as task from './views/task.js';
import * as runs from './views/runs.js';
import * as loops from './views/loops.js';
import * as library from './views/library.js';
import * as system from './views/system.js';
import * as codebase from './views/codebase.js';
import * as agents from './views/agents.js';
import * as capabilities from './views/capabilities.js';
import * as settings from './views/settings.js';

export const store = { project: null, runs: null, agentRuns: null, loops: null, detail: new Map(), version: 0, running: 0 };
/** Agent events from the server: `agent` for each streamed event, `agent-end` when a run finishes. */
export const bus = new EventTarget();
window.d = null; // the codebase views read the project index from this global

export async function loadProject() { store.project = await api('/api/project'); window.d = store.project; return store.project; }
export async function loadRuns(force = false) { if (!store.runs || force) store.runs = (await api('/api/runs')).runs; return store.runs; }
export async function loadAgentRuns(force = false) { if (!store.agentRuns || force) { store.agentRuns = await api('/api/agents/runs'); store.running = store.agentRuns.live.filter(r => r.status === 'running').length; } return store.agentRuns; }
export async function loadDetail(id, force = false) { if (!store.detail.has(id) || force) store.detail.set(id, await api(`/api/task?task=${encodeURIComponent(id)}`)); return store.detail.get(id); }

/* ── Routing ─────────────────────────────────────────────────────── */
function parse() {
  const hash = location.hash || '#/inbox';
  if (hash.startsWith('#devtools')) return { page: 'codebase', view: hash.slice(1).split('?')[0].split('/')[1] || 'overview', params: new URLSearchParams(hash.split('?')[1] || '') };
  const [path, query] = hash.replace(/^#\/?/, '').split('?');
  const [page = 'inbox', id, tab, ...rest] = path.split('/').map(decodeURIComponent);
  return { page: page || 'inbox', id, tab, rest, params: new URLSearchParams(query || '') };
}
const VIEWS = { inbox, tasks, runs, loops, codebase, agents, specs: library, docs: library, lab: library, changes: system, capabilities, settings, cli: system };
function viewFor(route) { return route.page === 'tasks' && route.id ? task : VIEWS[route.page] || inbox; }

/** Loops waiting on a human are hot; otherwise the number running. */
const loopBadge = () => {
  const all = store.loops || [], waiting = all.filter(loop => loops.HUMAN.includes(loop.status)).length, live = all.filter(loop => loop.live).length;
  return waiting ? `<em class="hot">${waiting}</em>` : live ? `<em>${live}</em>` : '';
};
const NAV = () => {
  const p = store.project, attention = (p?.tasks || []).filter(t => taskState(t).state === 'attention').length;
  return [
    { h: 'Workspace', items: [['#/inbox', 'inbox', 'Inbox', 'inbox', attention ? `<em class="hot">${attention}</em>` : ''], ['#/tasks', 'tasks', 'Tasks', 'tasks', `<em>${p?.tasks?.length ?? ''}</em>`], ['#/runs', 'runs', 'Runs', 'runs', store.running ? `<em class="hot">${store.running}</em>` : ''], ['#/loops', 'loops', 'Loops', 'loop', loopBadge()]] },
    { h: 'Codebase', items: [['#devtools/overview', 'codebase:overview', 'Overview', 'code'], ['#devtools/map', 'codebase:map', 'Architecture', 'map'], ['#devtools/routes', 'codebase:routes', 'Entry points', 'route'], ['#devtools/hotspots', 'codebase:hotspots', 'Hotspots', 'flame'], ['#devtools/findings', 'codebase:findings', 'Findings', 'alert'], ['#/changes', 'changes', 'Changes', 'branch', p?.git?.changes?.length ? `<em>${p.git.changes.length}</em>` : '']] },
    { h: 'Library', items: [['#/specs', 'specs', 'Specs', 'spec', `<em>${p?.specs?.length ?? ''}</em>`], ['#/docs', 'docs', 'Docs', 'book'], ...(p?.lab?.length ? [['#/lab', 'lab', 'Lab', 'bolt']] : [])] },
    { h: 'System', items: [['#/agents', 'agents', 'Agents', 'agent'], ['#/capabilities', 'capabilities', 'Capabilities', 'puzzle'], ['#/settings', 'settings', 'Settings', 'gear'], ['#/cli', 'cli', 'CLI reference', 'terminal']] }
  ];
};
function activeKey(route) {
  if (route.page === 'codebase') { const known = ['overview', 'map', 'routes', 'hotspots', 'findings']; return `codebase:${known.includes(route.view) ? route.view : 'overview'}`; }
  return route.page;
}
function sidebar(route) {
  const p = store.project, key = activeKey(route), name = p?.project?.name || 'Project', initials = name.replace(/[^a-z0-9]+/gi, ' ').trim().split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase() || 'M';
  $('#sidebar').innerHTML = `
    <div class="brand"><svg viewBox="0 0 512 512" aria-hidden="true"><path d="M80 384V177c0-16 19-24 30-13l174 174c12 12 12 31 0 43s-31 12-43 0L133 273v58z" fill="#FF6B00"/><path d="M432 384V177c0-16-19-24-30-13L282 284l40 40 57-57v64z" fill="#FF8A1A"/></svg><b>Maverick</b><span>Lens</span></div>
    <button class="project" data-act="palette" title="${esc(p?.project?.root || name)}"><span class="avatar">${esc(initials)}</span><div><strong>${esc(name)}</strong><small>${icon('branch')}<span>${esc(p?.git?.branch || 'no git')}</span></small></div></button>
    <nav class="nav" aria-label="Main">${NAV().map(g => `<h6>${g.h}</h6>${g.items.map(([href, k, label, ic, badge]) => `<a href="${href}" class="${key === k ? 'on' : ''}" title="${label}" ${key === k ? 'aria-current="page"' : ''}>${icon(ic)}<span>${label}</span>${badge || ''}</a>`).join('')}`).join('')}</nav>
    <div class="side-foot"><i class="live" id="live-dot"></i><span id="live-text">Live · v${esc(p?.project?.version || '')}</span></div>`;
}

let renderToken = 0, current = null;
export async function render({ keepScroll = false } = {}) {
  const route = parse(), view = viewFor(route), mine = ++renderToken, viewEl = $('#view');
  const scroll = keepScroll ? viewEl.scrollTop : 0;
  $('#app').classList.remove('nav-open');
  if (!store.agentRuns) await loadAgentRuns().catch(() => {});
  if (!store.loops) await loops.loadLoops().catch(() => {});
  if (!store.project) { try { await loadProject(); } catch (error) { viewEl.innerHTML = `<div class="page"><div class="banner">${icon('alert')}Lens could not load the project index: ${esc(error.message)}</div></div>`; return; } }
  sidebar(route);
  const ctx = { route, store, rerender: opts => render({ keepScroll: true, ...opts }) };
  if (current && current !== view) current.leave?.();
  current = view;
  $('#crumbs').innerHTML = [`<a href="#/inbox">${esc(store.project.project?.name || 'Project')}</a>`, ...(view.crumbs?.(ctx) || [])].join('<span class="sep">/</span>');
  if (!keepScroll && view.loading) viewEl.innerHTML = view.loading(ctx);
  let html;
  try { html = await view.render(ctx); } catch (error) { html = `<div class="page"><div class="banner">${icon('alert')}${esc(error.message)}</div><a class="btn" href="#/inbox">Back to Inbox</a></div>`; }
  if (mine !== renderToken) return; // a newer navigation won
  const focused = document.activeElement?.id, caret = document.activeElement?.selectionStart;
  viewEl.innerHTML = html;
  view.after?.(ctx, viewEl);
  viewEl.scrollTop = scroll;
  if (focused && keepScroll) { const el = document.getElementById(focused); if (el) { el.focus(); if (caret != null && el.setSelectionRange) el.setSelectionRange(caret, caret); } }
  document.title = `${view.title?.(ctx) || 'Lens'} · ${store.project.project?.name || 'Maverick'}`;
}
window.addEventListener('hashchange', () => { closeOverlays(); render(); });

/* ── Live refresh ────────────────────────────────────────────────── */
let refreshTimer;
function connect() {
  if (!window.EventSource) return;
  const source = new EventSource('/api/events');
  source.addEventListener('changed', () => {
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(async () => {
      if (parse().page === 'codebase') { await loadProject().catch(() => {}); return; } // the codebase views refresh themselves
      if (current?.followsLive?.(parse())) { await loadProject().catch(() => {}); return; } // a live run paints its own events
      store.detail.clear(); store.runs = null;
      await loadProject().catch(() => {});
      if (!document.querySelector('.overlay, .drawer-wrap')) render({ keepScroll: true });
    }, 250);
  });
  const relay = name => source.addEventListener(name, event => { try { bus.dispatchEvent(new CustomEvent(name, { detail: JSON.parse(event.data) })); } catch { /* malformed event */ } });
  relay('agent'); relay('agent-end'); relay('loop'); relay('loop-end');
  bus.addEventListener('loop-end', async () => { await loops.loadLoops(true).catch(() => {}); if (parse().page !== 'loops') render({ keepScroll: true }); });
  bus.addEventListener('agent-end', async () => { store.detail.clear(); await loadAgentRuns(true).catch(() => {}); await loadProject().catch(() => {}); if (!document.querySelector('.overlay, .drawer-wrap')) render({ keepScroll: true }); });
  source.onerror = () => { const dot = $('#live-dot'), text = $('#live-text'); if (dot) dot.style.background = 'var(--warn)'; if (text) text.textContent = 'Reconnecting…'; };
  source.onopen = () => { const dot = $('#live-dot'), text = $('#live-text'); if (dot) dot.style.background = ''; if (text) text.textContent = `Live · v${store.project?.project?.version || ''}`; };
}
export async function refreshAll() {
  await api('/api/refresh', {});
  store.detail.clear(); store.runs = null;
  await loadProject();
  render({ keepScroll: true });
}

/* ── Command palette ─────────────────────────────────────────────── */
let palIndex = 0, palItems = [];
function paletteItems(query) {
  const p = store.project || { tasks: [] };
  const nav = NAV().flatMap(g => g.items.map(([href, , label, ic]) => ({ group: 'Go to', label, ic, hint: g.h, run: () => { location.hash = href; } })));
  const taskItems = p.tasks.map(t => ({ group: 'Tasks', label: t.title, ic: 'tasks', hint: STAGE_LABEL[t.stage] || t.stage, run: () => { location.hash = `#/tasks/${t.id}`; } }));
  const actions = [
    { group: 'Actions', label: 'New task', ic: 'plus', hint: 'N', run: () => tasks.openNewTask() },
    { group: 'Actions', label: 'Refresh the project index', ic: 'runs', hint: 'refresh', run: () => refreshAll().then(() => toast('Index refreshed')) },
    ...p.tasks.filter(t => taskState(t).kind === 'approval').map(t => ({ group: 'Actions', label: `Review and approve ${t.title}`, ic: 'shield', hint: 'approval', run: () => { location.hash = `#/tasks/${t.id}/gates?flow=${encodeURIComponent(taskState(t).flow)}`; } })),
    ...p.tasks.filter(t => t.stage === 'pr').map(t => ({ group: 'Actions', label: `Open the pull request · ${t.title}`, ic: 'pr', hint: 'pr flow', run: () => task.runFlowFor(t.id, 'pr') })),
    ...p.tasks.filter(t => t.stage !== 'done').map(t => ({ group: 'Actions', label: `Run ship flow · ${t.title}`, ic: 'flow', hint: 'flow run', run: () => task.runFlowFor(t.id, 'ship') })),
    ...p.tasks.filter(t => t.stage === 'pr').map(t => ({ group: 'Actions', label: `Finish task · ${t.title}`, ic: 'check', hint: 'done', run: () => task.finishTask(t.id) }))
  ];
  const all = [...actions, ...taskItems, ...nav], q = query.trim().toLowerCase();
  if (!q) return [...actions.slice(0, 4), ...taskItems.slice(0, 6), ...nav];
  return all.filter(item => `${item.label} ${item.hint}`.toLowerCase().includes(q)).slice(0, 40);
}
export function openPalette() {
  if ($('.overlay')) return;
  closeOverlays();
  const o = document.createElement('div');
  o.className = 'overlay';
  o.innerHTML = `<div class="palette" role="dialog" aria-modal="true" aria-label="Command palette"><div class="q">${icon('search')}<input id="pal-q" placeholder="Search tasks, pages and actions…" autocomplete="off" role="combobox" aria-expanded="true" aria-controls="pal-res"><kbd>esc</kbd></div><div class="res" id="pal-res" role="listbox"></div><div class="foot"><span><kbd>↑</kbd> <kbd>↓</kbd> move</span><span><kbd>↵</kbd> open</span><span><kbd>esc</kbd> close</span></div></div>`;
  document.body.append(o);
  const input = $('#pal-q');
  const paint = () => {
    palItems = paletteItems(input.value); palIndex = Math.min(palIndex, Math.max(palItems.length - 1, 0));
    let last = '';
    $('#pal-res').innerHTML = palItems.length ? palItems.map((item, i) => { const h = item.group !== last ? `<h6>${item.group}</h6>` : ''; last = item.group; return `${h}<div class="opt ${i === palIndex ? 'on' : ''}" data-i="${i}" role="option" aria-selected="${i === palIndex}">${icon(item.ic)}<span>${esc(item.label)}</span><small>${esc(item.hint)}</small></div>`; }).join('') : '<div class="empty">No results</div>';
    $('#pal-res .opt.on')?.scrollIntoView({ block: 'nearest' });
  };
  const pick = item => { o.remove(); item?.run(); };
  input.addEventListener('input', () => { palIndex = 0; paint(); });
  input.addEventListener('keydown', event => {
    if (event.key === 'ArrowDown') { event.preventDefault(); palIndex = (palIndex + 1) % Math.max(palItems.length, 1); paint(); }
    if (event.key === 'ArrowUp') { event.preventDefault(); palIndex = (palIndex - 1 + palItems.length) % Math.max(palItems.length, 1); paint(); }
    if (event.key === 'Enter') { event.preventDefault(); pick(palItems[palIndex]); }
  });
  o.addEventListener('mousedown', event => { if (event.target === o) o.remove(); });
  o.addEventListener('click', event => { const opt = event.target.closest('.opt'); if (opt) pick(palItems[Number(opt.dataset.i)]); });
  palIndex = 0; paint(); input.focus();
}

/* ── Global events ───────────────────────────────────────────────── */
document.addEventListener('click', event => {
  const go = event.target.closest('[data-go]');
  if (go && !event.target.closest('a, button, select, input, label')) { location.hash = go.dataset.go; return; }
  const el = event.target.closest('[data-act]');
  if (!el || el.closest('#devtools-root')) return;
  const act = el.dataset.act;
  if (act === 'palette') return openPalette();
  if (act === 'menu') return $('#app').classList.toggle('nav-open');
  if (act === 'new-task') return tasks.openNewTask();
  const view = viewFor(parse());
  const handler = view.actions?.[act];
  if (handler) { event.preventDefault(); handler(el, { route: parse(), store, rerender: opts => render({ keepScroll: true, ...opts }) }); }
});
document.addEventListener('change', event => {
  const el = event.target.closest('[data-change]');
  if (!el || el.closest('#devtools-root')) return;
  const handler = viewFor(parse()).actions?.[el.dataset.change];
  if (handler) handler(el, { route: parse(), store, rerender: opts => render({ keepScroll: true, ...opts }) });
});
document.addEventListener('input', event => {
  const el = event.target.closest('[data-input]');
  if (!el || el.closest('#devtools-root')) return;
  const handler = viewFor(parse()).actions?.[el.dataset.input];
  if (handler) handler(el, { route: parse(), store, rerender: opts => render({ keepScroll: true, ...opts }) });
});
document.addEventListener('keydown', event => {
  const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName) || document.activeElement?.isContentEditable;
  const inCodebase = parse().page === 'codebase';
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k' && !inCodebase) { event.preventDefault(); openPalette(); return; }
  if (event.key === 'Escape') { if (document.querySelector('.overlay, .drawer-wrap')) { closeOverlays(); return; } $('#app').classList.remove('nav-open'); }
  if (typing || inCodebase || event.metaKey || event.ctrlKey || event.altKey || document.querySelector('.overlay, .drawer-wrap')) return;
  if (event.key === '/' && $('#task-q')) { event.preventDefault(); $('#task-q').focus(); }
  else if (event.key.toLowerCase() === 'n') { event.preventDefault(); tasks.openNewTask(); }
  else if (event.key === 'Enter' && document.activeElement?.dataset?.go) location.hash = document.activeElement.dataset.go;
});

render();
connect();
