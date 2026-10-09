// Shared helpers for every Lens view: escaping, icons, formatting, markdown, API calls and overlays.

export const $ = (selector, root = document) => root.querySelector(selector);
export const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
export const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const icon = (id, cls = 'i') => `<svg class="${cls}" aria-hidden="true"><use href="#i-${id}"/></svg>`;

export const STAGE_LABEL = { prd: 'PRD', spec: 'Spec', techspec: 'Tech spec', tasks: 'Tasks', build: 'Build', verify: 'Verify', security: 'Security', review: 'Review', pr: 'PR' };
export const PLANNING = ['prd', 'spec', 'techspec', 'tasks'];
export const LANES = [
  { id: 'plan', label: 'Plan', tone: 'info', stages: PLANNING },
  { id: 'build', label: 'Build', tone: 'accent', stages: ['build'] },
  { id: 'verify', label: 'Verify', tone: 'accent', stages: ['verify', 'security'] },
  { id: 'review', label: 'Review', tone: 'warn', stages: ['review'] },
  { id: 'ship', label: 'Ship', tone: 'ok', stages: ['pr'] }
];
export const OUTCOME = { 'awaiting-approval': ['warn', 'Awaiting approval'], done: ['ok', 'Passing'], revise: ['bad', 'Needs fixes'], stalled: ['bad', 'Stalled'], exhausted: ['bad', 'Out of iterations'], 'not run': ['', 'Not run'] };
export const STATE = { attention: ['bad', 'Needs you'], active: ['accent', 'In progress'], ready: ['ok', 'Ready to ship'], queued: ['info', 'Not started'] };

export function timeAgo(value) {
  if (!value) return '—';
  const s = Math.max(0, (Date.now() - new Date(value).getTime()) / 1000);
  if (s < 45) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  if (s < 86400 * 30) return `${Math.round(s / 86400)}d ago`;
  return new Date(value).toLocaleDateString();
}
export const clock = value => value ? new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
export const pill = (text, tone = '') => `<span class="pill ${tone}">${esc(text)}</span>`;
export const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** Where a task stands for a human: what needs them, what is moving, what can ship. */
export function taskState(task) {
  const flows = task.flows || [];
  const failing = flows.find(flow => ['revise', 'stalled', 'exhausted'].includes(flow.status));
  const approval = flows.find(flow => flow.status === 'awaiting-approval');
  if (failing) return { state: 'attention', tone: 'bad', reason: `${failing.flow} flow needs fixes`, kind: 'failing', flow: failing.flow };
  if (approval) return { state: 'attention', tone: 'warn', reason: `${approval.flow} flow awaits your approval`, kind: 'approval', flow: approval.flow };
  if (task.subtasks?.problems) return { state: 'attention', tone: 'bad', reason: `${plural(task.subtasks.problems, 'subtask graph problem')}`, kind: 'graph' };
  if (task.stage === 'pr') return { state: 'ready', tone: 'ok', reason: 'Ready: open the pull request', kind: 'ship' };
  if (task.stage === 'prd' && !(task.artifacts || []).includes('PRD.md')) return { state: 'queued', tone: 'info', reason: 'Write the PRD', kind: 'plan' };
  if (task.stage === 'build' && task.subtasks?.ready?.length) return { state: 'active', tone: 'accent', reason: `Subtask ${task.subtasks.ready[0]} is ready to build`, kind: 'build' };
  return { state: 'active', tone: 'accent', reason: task.next || 'In progress', kind: 'progress' };
}
export function stageProgress(task) {
  const stages = task.stages || [], index = stages.indexOf(task.stage);
  return index < 0 ? 0 : Math.round((index / stages.length) * 100);
}
export const stagesMini = task => `<div class="stages-mini" title="${esc(STAGE_LABEL[task.stage] || task.stage)}">${(task.stages || []).map((stage, i) => `<i class="${i < task.stages.indexOf(task.stage) ? 'done' : stage === task.stage ? 'cur' : ''}"></i>`).join('')}</div>`;
export const ring = task => { const p = stageProgress(task); return `<div class="ring" style="--p:${p}" data-label="${p}" aria-label="${p}% through the workflow"></div>`; };

/* ── API ─────────────────────────────────────────────────────────── */
const token = () => document.querySelector('meta[name="lens-token"]')?.content || '';
export async function api(path, body) {
  const response = await fetch(path, body === undefined ? {} : { method: 'POST', headers: { 'content-type': 'application/json', 'x-lens-token': token() }, body: JSON.stringify(body) });
  const text = await response.text();
  const data = text ? JSON.parse(text) : {};
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
  return data;
}

/* ── Overlays ────────────────────────────────────────────────────── */
export function toast(message, tone = 'ok') {
  $('.toast')?.remove();
  const el = document.createElement('div');
  el.className = 'toast'; el.setAttribute('role', 'status');
  el.innerHTML = `<span class="dot ${tone}"></span><span>${esc(message)}</span>`;
  document.body.append(el);
  setTimeout(() => el.remove(), 3200);
}
export async function copy(text, label = 'Copied') {
  try { await navigator.clipboard.writeText(text); toast(label); } catch { toast('Copy failed; select the text instead', 'warn'); }
}
export function closeOverlays() { $$('.overlay, .drawer-wrap').forEach(el => el.remove()); }

/** A right-hand sheet that shows a command while it runs and its output after. */
export function drawer(title, command) {
  closeOverlays();
  const wrap = document.createElement('div');
  wrap.className = 'drawer-wrap';
  wrap.innerHTML = `<aside class="drawer" role="dialog" aria-modal="true" aria-label="${esc(title)}"><header><span class="spin"></span><h2>${esc(title)}</h2><button class="icon-btn" data-close aria-label="Close">${icon('x')}</button></header>
    ${command ? `<div class="cmdline"><span>$ ${esc(command)}</span><button class="icon-btn" style="width:24px;height:24px" data-copy="${esc(command)}" aria-label="Copy command">${icon('copy')}</button></div>` : ''}
    <div class="summary hidden"></div><div class="term" aria-live="polite"><span class="dim">Running…</span></div></aside>`;
  wrap.addEventListener('mousedown', event => { if (event.target === wrap) wrap.remove(); });
  wrap.addEventListener('click', event => { if (event.target.closest('[data-close]')) wrap.remove(); const c = event.target.closest('[data-copy]'); if (c) copy(c.dataset.copy); });
  document.body.append(wrap);
  return {
    done({ ok, output = '', summary = '' }) {
      const head = wrap.querySelector('header .spin');
      head.outerHTML = `<span class="dot ${ok ? 'ok' : 'bad'}"></span>`;
      const term = wrap.querySelector('.term');
      term.innerHTML = output ? colorize(output) : `<span class="dim">${ok ? 'Done. The command printed nothing.' : 'The command failed without output.'}</span>`;
      if (summary) { const el = wrap.querySelector('.summary'); el.classList.remove('hidden'); el.innerHTML = summary; }
    }
  };
}
function colorize(text) {
  return esc(text).split('\n').map(line => {
    if (/^\s*(PASS|✓|✔)/.test(line)) return `<div class="ok">${line}</div>`;
    if (/^\s*(FAIL|✗|✖|×|ERROR)/i.test(line)) return `<div class="bad">${line}</div>`;
    if (/^\s*(WARN|⚠)/.test(line)) return `<div class="acc">${line}</div>`;
    if (/^MAVERICK AI/.test(line)) return `<div class="dim">${line}</div>`;
    return `<div>${line || '&nbsp;'}</div>`;
  }).join('');
}

/** A small confirm/prompt dialog. Resolves with the form values, or null when cancelled. */
export function dialog({ title, text = '', fields = [], confirm = 'Confirm', tone = 'primary' }) {
  closeOverlays();
  return new Promise(resolve => {
    const o = document.createElement('div');
    o.className = 'overlay';
    o.innerHTML = `<form class="modal" role="dialog" aria-modal="true" aria-labelledby="dlg-h"><header><h2 id="dlg-h">${esc(title)}</h2>${text ? `<p>${text}</p>` : ''}</header>
      ${fields.length ? `<div class="body">${fields.map(f => `<label>${esc(f.label)}${f.multiline ? `<textarea name="${f.name}" rows="4" placeholder="${esc(f.placeholder || '')}" ${f.required ? 'required' : ''}>${esc(f.value || '')}</textarea>` : `<input name="${f.name}" value="${esc(f.value || '')}" placeholder="${esc(f.placeholder || '')}" ${f.required ? 'required' : ''} autocomplete="${f.autocomplete || 'off'}">`}</label>`).join('')}</div>` : '<div style="height:14px"></div>'}
      <footer><button type="button" class="btn ghost" data-cancel>Cancel</button><button type="submit" class="btn ${tone}">${esc(confirm)}</button></footer></form>`;
    const finish = value => { o.remove(); resolve(value); };
    o.addEventListener('mousedown', event => { if (event.target === o) finish(null); });
    o.querySelector('[data-cancel]').addEventListener('click', () => finish(null));
    o.querySelector('form').addEventListener('submit', event => { event.preventDefault(); finish(Object.fromEntries(new FormData(event.target))); });
    document.body.append(o);
    (o.querySelector('input, textarea') || o.querySelector('[type=submit]')).focus();
  });
}

/* ── Markdown (escaped first, so no raw HTML ever reaches the page) ── */
function inline(text) {
  return esc(text)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[\s(])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>');
}
export function markdown(source) {
  const lines = String(source || '').replace(/^---\n[\s\S]*?\n---\n?/, '').split('\n');
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const fence = line.match(/^```(\w*)/);
    if (fence) {
      const body = []; i++;
      while (i < lines.length && !lines[i].startsWith('```')) body.push(lines[i++]);
      i++; out.push(`<pre><code>${esc(body.join('\n'))}</code></pre>`); continue;
    }
    const heading = line.match(/^(#{1,5})\s+(.+)$/);
    if (heading) { const n = heading[1].length; out.push(`<h${n}>${inline(heading[2])}</h${n}>`); i++; continue; }
    if (/^\s*(---|\*\*\*)\s*$/.test(line)) { out.push('<hr>'); i++; continue; }
    if (/^\|.+\|\s*$/.test(line) && /^\|[\s:|-]+\|\s*$/.test(lines[i + 1] || '')) {
      const cells = row => row.trim().replace(/^\||\|$/g, '').split('|').map(cell => cell.trim());
      const head = cells(line); i += 2; const rows = [];
      while (i < lines.length && /^\|.+\|\s*$/.test(lines[i])) rows.push(cells(lines[i++]));
      out.push(`<table><thead><tr>${head.map(h => `<th>${inline(h)}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr>${r.map(c => `<td>${inline(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`); continue;
    }
    if (/^\s*>/.test(line)) { const body = []; while (i < lines.length && /^\s*>/.test(lines[i])) body.push(lines[i++].replace(/^\s*>\s?/, '')); out.push(`<blockquote>${inline(body.join(' '))}</blockquote>`); continue; }
    if (/^\s*([-*+]|\d+\.)\s+/.test(line)) {
      const ordered = /^\s*\d+\./.test(line), items = [];
      while (i < lines.length && (/^\s*([-*+]|\d+\.)\s+/.test(lines[i]) || (/^\s{2,}\S/.test(lines[i]) && items.length))) {
        const item = lines[i++];
        if (/^\s*([-*+]|\d+\.)\s+/.test(item)) items.push(item.replace(/^\s*([-*+]|\d+\.)\s+/, ''));
        else items[items.length - 1] += ` ${item.trim()}`;
      }
      out.push(`<${ordered ? 'ol' : 'ul'}>${items.map(item => { const task = item.match(/^\[([ xX])\]\s+(.*)$/); return task ? `<li class="task"><i class="${task[1] === ' ' ? '' : 'on'}"></i><span>${inline(task[2])}</span></li>` : `<li>${inline(item)}</li>`; }).join('')}</${ordered ? 'ol' : 'ul'}>`); continue;
    }
    if (!line.trim()) { i++; continue; }
    const para = [];
    while (i < lines.length && lines[i].trim() && !/^(#{1,5}\s|```|\s*([-*+]|\d+\.)\s|\s*>|\|)/.test(lines[i])) para.push(lines[i++]);
    if (para.length) out.push(`<p>${inline(para.join(' '))}</p>`); else i++;
  }
  return out.join('\n');
}
