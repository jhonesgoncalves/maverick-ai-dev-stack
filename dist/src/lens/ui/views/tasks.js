import { $, api, closeOverlays, esc, icon, LANES, pill, ring, STAGE_LABEL, STATE, stagesMini, taskState, timeAgo, toast } from '../lib.js';
import { loadProject, store } from '../app.js';

const ui = { query: '', filter: 'all', layout: 'list', sort: 'recent' };
const FILTERS = ['all', 'attention', 'active', 'ready', 'queued'];

export const title = () => 'Tasks';
export const crumbs = () => ['<b>Tasks</b>'];

function rows(list) {
  return list.map(t => {
    const s = taskState(t), sub = t.subtasks || {};
    return `<div class="task-row" data-go="#/tasks/${encodeURIComponent(t.id)}" tabindex="0" role="link" aria-label="${esc(t.title)}">
      ${ring(t)}
      <div class="title"><b>${esc(t.title)}</b><small><span>${esc(t.id)}</span><span>·</span><span>${esc(t.preset)}</span>${sub.total ? `<span>·</span><span>${sub.done}/${sub.total} subtasks</span>` : ''}</small></div>
      <div class="c-stage">${stagesMini(t)}<small class="muted" style="font-size:11.5px">${esc(STAGE_LABEL[t.stage] || t.stage)}</small></div>
      <div class="c-state"><span class="pill ${s.tone}" title="${esc(s.reason)}">${esc(s.state === 'attention' ? (s.kind === 'approval' ? 'Approve' : 'Fix') : STATE[s.state][1])}</span></div>
      <div class="c-upd muted mono" style="font-size:11.5px">${esc(timeAgo(t.updated))}</div>
      <span class="chev">${icon('chev')}</span></div>`;
  }).join('');
}

function board(list) {
  return `<div class="kanban" style="grid-template-columns:repeat(${LANES.length},minmax(200px,1fr))">${LANES.map(lane => {
    const col = list.filter(t => lane.stages.includes(t.stage));
    return `<div class="col"><div class="col-head"><span class="dot ${lane.tone}"></span>${lane.label}<em>${col.length}</em></div><div class="col-body">${col.map(t => {
      const s = taskState(t), sub = t.subtasks || {};
      return `<div class="kcard" data-go="#/tasks/${encodeURIComponent(t.id)}" tabindex="0" role="link"><b>${esc(t.title)}</b>
        <div class="meta">${lane.id === 'plan' || lane.id === 'verify' ? pill(STAGE_LABEL[t.stage] || t.stage, 'info') : ''}${s.state === 'attention' ? pill(s.kind === 'approval' ? 'approve' : 'fix', s.tone) : ''}<span class="pill">${esc(t.preset)}</span></div>
        <div class="foot">${sub.total ? `${icon('tasks')}${sub.done}/${sub.total}` : ''}<span style="margin-left:auto">${esc(timeAgo(t.updated))}</span></div></div>`;
    }).join('') || '<div class="faint" style="padding:8px 4px;font-size:12px">Nothing here</div>'}</div></div>`;
  }).join('')}</div>`;
}

export function render({ route }) {
  if (route.params.get('view') === 'board') ui.layout = 'board';
  if (FILTERS.includes(route.params.get('filter'))) ui.filter = route.params.get('filter');
  const all = store.project.tasks || [], q = ui.query.trim().toLowerCase();
  const list = all.filter(t => (ui.filter === 'all' || taskState(t).state === ui.filter) && (!q || `${t.title} ${t.id} ${t.preset}`.toLowerCase().includes(q)))
    .sort((a, b) => ui.sort === 'name' ? a.title.localeCompare(b.title) : String(b.updated).localeCompare(String(a.updated)));
  const count = f => f === 'all' ? all.length : all.filter(t => taskState(t).state === f).length;
  let body;
  if (!all.length) body = `<div class="card empty-state"><div class="glyph">${icon('tasks')}</div><h3>No tasks yet</h3><p>A task takes one change from idea to merged pull request: PRD, spec, subtasks, gates and review.</p><button class="btn primary" data-act="new-task">${icon('plus')}New task</button></div>`;
  else if (!list.length) body = `<div class="card empty">No task matches${ui.query ? ` “${esc(ui.query)}”` : ''} in ${esc(ui.filter === 'all' ? 'all tasks' : STATE[ui.filter][1].toLowerCase())}. <button class="link" data-act="clear">Clear filters</button></div>`;
  else if (ui.layout === 'board') body = board(list);
  else body = ['attention', 'active', 'ready', 'queued'].map(s => [s, list.filter(t => taskState(t).state === s)]).filter(([, l]) => l.length)
    .map(([s, l]) => `<div class="group-title"><span class="dot ${STATE[s][0]}"></span>${STATE[s][1]} <span class="faint">${l.length}</span></div><div class="rows">${rows(l)}</div>`).join('');
  return `<div class="page ${ui.layout === 'board' ? 'wide' : ''}">
    <div class="page-head"><div><h1>Tasks</h1><p>Every change from idea to merged pull request.</p></div><div class="actions"><button class="btn" data-act="new-task">${icon('plus')}New task</button></div></div>
    <div class="toolbar">
      <label class="field">${icon('search')}<input id="task-q" data-input="search" placeholder="Filter tasks" value="${esc(ui.query)}" aria-label="Filter tasks"><kbd>/</kbd></label>
      <div class="seg" role="group" aria-label="State">${FILTERS.map(f => `<button class="${ui.filter === f ? 'on' : ''}" data-act="filter" data-filter="${f}" aria-pressed="${ui.filter === f}">${f === 'all' ? 'All' : STATE[f][1]} <span class="faint">${count(f)}</span></button>`).join('')}</div>
      <span class="spacer"></span>
      <select class="select" data-change="sort" aria-label="Sort" style="height:32px"><option value="recent" ${ui.sort === 'recent' ? 'selected' : ''}>Most recent</option><option value="name" ${ui.sort === 'name' ? 'selected' : ''}>Name</option></select>
      <div class="seg" role="group" aria-label="Layout"><button class="${ui.layout === 'list' ? 'on' : ''}" data-act="layout" data-layout="list">${icon('list')}List</button><button class="${ui.layout === 'board' ? 'on' : ''}" data-act="layout" data-layout="board">${icon('kanban')}Board</button></div>
    </div>
    ${body}
  </div>`;
}

const setHash = () => { const q = new URLSearchParams(); if (ui.filter !== 'all') q.set('filter', ui.filter); if (ui.layout === 'board') q.set('view', 'board'); history.replaceState(null, '', `#/tasks${q.toString() ? `?${q}` : ''}`); };
export const actions = {
  search: (el, ctx) => { ui.query = el.value; ctx.rerender(); },
  filter: (el, ctx) => { ui.filter = el.dataset.filter; setHash(); ctx.rerender(); },
  layout: (el, ctx) => { ui.layout = el.dataset.layout; setHash(); ctx.rerender(); },
  sort: (el, ctx) => { ui.sort = el.value; ctx.rerender(); },
  clear: (el, ctx) => { ui.query = ''; ui.filter = 'all'; setHash(); ctx.rerender(); }
};

/** The New task dialog: creates the task with `maverick new`; the agent writes the PRD next. */
export function openNewTask() {
  closeOverlays();
  const o = document.createElement('div');
  o.className = 'overlay';
  const options = [['standard', 'Standard', 'PRD → tech spec → tasks'], ['spec-driven', 'Spec-driven', 'Adds an approved behavioral spec'], ['strict', 'Strict', 'Security gate and checkpoints']];
  o.innerHTML = `<form class="modal" role="dialog" aria-modal="true" aria-labelledby="nt-h"><header><h2 id="nt-h">New task</h2><p>Describe the change. Your agent writes the PRD next.</p></header>
    <div class="body"><label>Goal<input name="title" required maxlength="140" placeholder="Add pagination to the orders API" autocomplete="off"></label>
      <label>Context<textarea name="detail" rows="3" placeholder="Constraints, links, what success looks like"></textarea></label>
      <div><div class="muted" style="font-size:12px;margin-bottom:6px">Workflow</div><div class="wf-opts" role="radiogroup">${options.map(([v, l, d], i) => `<button type="button" class="wf-opt ${i ? '' : 'on'}" data-wf="${v}" role="radio" aria-checked="${!i}"><b>${l}</b><small>${d}</small></button>`).join('')}</div></div>
      <div class="banner hidden" id="nt-err"></div></div>
    <footer><button type="button" class="btn ghost" data-close>Cancel</button><button type="submit" class="btn primary">Create task</button></footer></form>`;
  document.body.append(o);
  let workflow = 'standard';
  o.querySelector('input').focus();
  o.addEventListener('mousedown', event => { if (event.target === o) o.remove(); });
  o.addEventListener('click', event => {
    if (event.target.closest('[data-close]')) o.remove();
    const wf = event.target.closest('.wf-opt');
    if (wf) { workflow = wf.dataset.wf; o.querySelectorAll('.wf-opt').forEach(b => { b.classList.toggle('on', b === wf); b.setAttribute('aria-checked', b === wf); }); }
  });
  o.querySelector('form').addEventListener('submit', async event => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.target)), submit = o.querySelector('[type=submit]');
    submit.disabled = true; submit.innerHTML = '<span class="spin"></span>Creating…';
    try {
      const created = await api('/api/improvements', { slug: data.title, title: data.title, detail: data.detail, preset: workflow });
      o.remove(); await loadProject();
      toast('Task created · next: write the PRD with your agent');
      location.hash = `#/tasks/${encodeURIComponent(created.slug)}`;
    } catch (error) { const err = $('#nt-err'); err.textContent = error.message; err.classList.remove('hidden'); submit.disabled = false; submit.textContent = 'Create task'; }
  });
}
