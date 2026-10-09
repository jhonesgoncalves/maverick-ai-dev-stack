import { copy, esc, icon, markdown, pill } from '../lib.js';
import { store } from '../app.js';

const queries = { specs: '', docs: '', lab: '' };
const META = {
  specs: { title: 'Specs', text: 'Every PRD, behavioral spec and technical spec in the project.', icon: 'spec', empty: 'No specs yet. They are written for each task: PRD.md, SPEC.md and TECHSPEC.md.' },
  docs: { title: 'Docs', text: 'Project documentation and architecture decisions, searchable.', icon: 'book', empty: 'No Markdown documentation was found in this project.' },
  lab: { title: 'Lab', text: 'Experiments and measurement scorecards.', icon: 'bolt', empty: 'The lab folder is empty.' }
};

function items(page) {
  const p = store.project;
  if (page === 'specs') return (p.specs || []).map(s => ({ path: s.path, title: s.path.split('/').slice(-2, -1)[0] || s.title, content: s.content, tag: s.path.match(/(PRD|SPEC|TECHSPEC)\.md$/i)?.[1]?.toUpperCase() || 'SPEC', tone: s.status === 'draft' ? 'warn' : '', status: s.status, task: s.path.match(/tasks\/([^/]+)\//)?.[1] }));
  if (page === 'lab') return (p.lab || []).map(l => ({ path: l.path, title: l.name, content: l.content, tag: 'LAB' }));
  return (p.docs || []).filter(doc => doc.type !== 'SPEC' && !doc.path.includes('.maverick/')).map(doc => ({ path: doc.path, title: doc.title, content: doc.content, tag: doc.type, tone: doc.type === 'ADR' ? 'info' : '' }));
}

export const title = ({ route }) => META[route.page].title;
export const crumbs = ({ route }) => [`<b>${META[route.page].title}</b>`];

export function render({ route }) {
  const page = route.page, meta = META[page], all = items(page), q = queries[page].trim().toLowerCase();
  const list = q ? all.filter(item => `${item.title} ${item.path} ${item.content || ''}`.toLowerCase().includes(q)) : all;
  const selected = all.find(item => item.path === route.params.get('path')) || list[0];
  const head = `<div class="page-head"><div><h1>${meta.title}</h1><p>${meta.text}</p></div></div>`;
  if (!all.length) return `<div class="page">${head}<div class="card empty-state"><div class="glyph">${icon(meta.icon)}</div><h3>Nothing here yet</h3><p>${meta.empty}</p></div></div>`;
  return `<div class="page wide" style="max-width:1500px">${head}
    <div class="split">
      <section class="card"><div style="padding:10px;border-bottom:1px solid var(--line-soft)"><label class="field">${icon('search')}<input id="lib-q" data-input="search" placeholder="Search ${meta.title.toLowerCase()}" value="${esc(queries[page])}" aria-label="Search"></label></div>
        <div class="list">${list.length ? list.slice(0, 300).map(item => `<a class="list-item ${item === selected ? 'on' : ''}" href="#/${page}?path=${encodeURIComponent(item.path)}">${icon('file')}<div class="t"><b>${esc(item.title)}</b><small>${esc(item.path)}</small></div>${pill(item.tag, item.tone)}</a>`).join('') : '<div class="empty">No match.</div>'}</div></section>
      <section class="card" style="min-width:0">${selected ? `<div class="reader-head"><h2>${esc(selected.title)}</h2>${selected.task ? `<a class="btn sm" href="#/tasks/${encodeURIComponent(selected.task)}">${icon('tasks')}Open task</a>` : ''}<button class="btn sm ghost" data-act="copy-path" data-path="${esc(selected.path)}">${icon('copy')}Copy path</button><span class="path">${esc(selected.path)}</span></div><div class="md">${markdown(selected.content || '')}</div>` : '<div class="empty">Select a document.</div>'}</section>
    </div></div>`;
}

export const actions = {
  search: (el, ctx) => { queries[ctx.route.page] = el.value; ctx.rerender(); },
  'copy-path': el => copy(el.dataset.path, 'Path copied')
};
