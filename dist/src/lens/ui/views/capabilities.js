import { $, api, closeOverlays, esc, icon, markdown, pill, plural, toast } from '../lib.js';
import { loadProject } from '../app.js';

const ui = { tab: 'installed', query: '', kind: 'all' };
const KIND_ICON = { skill: 'bolt', agent: 'agent', command: 'terminal', mcp: 'puzzle' };
const OP = { create: ['ok', '+'], update: ['warn', '~'], delete: ['bad', '−'], unchanged: ['', '='] };

export const title = () => 'Capabilities';
export const crumbs = () => ['<b>Capabilities</b>'];
export const loading = () => '<div class="page"><div class="skeleton" style="height:28px;width:200px;margin-bottom:24px"></div><div class="skeleton" style="height:320px"></div></div>';

let cache = null;
async function load(force) { if (!cache || force) cache = await api('/api/capabilities'); return cache; }

function installedTab(data) {
  const drifted = data.installed.filter(i => i.status !== 'ok'), updates = data.installed.filter(i => i.update);
  if (!data.installed.length) return `<div class="card empty-state"><div class="glyph">${icon('puzzle')}</div><h3>Nothing installed yet</h3><p>Install skills, agents, commands and MCP servers into your AI tools from the catalog. Every install is recorded in a lockfile and checked for drift.</p><button class="btn primary" data-act="tab" data-tab="catalog">Browse the catalog</button></div>`;
  return `${drifted.length || updates.length ? `<div class="banner warn">${icon('alert')}<span style="flex:1">${[drifted.length && `${plural(drifted.length, 'capability')} drifted from the lockfile`, updates.length && `${plural(updates.length, 'update')} available`].filter(Boolean).join(' · ')}</span><button class="btn sm" data-act="sync">${icon('refresh')}Preview sync</button></div>` : ''}
    <section class="card"><div class="card-head"><h3>Installed</h3><span class="count">${data.installed.length}</span><div class="right"><button class="btn sm ghost" data-act="sync">${icon('refresh')}Sync</button></div></div>
    <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Capability</th><th>Version</th><th>Tools</th><th>Status</th><th></th></tr></thead><tbody>
    ${data.installed.map(item => { const [kind] = item.ref.split('/'); return `<tr class="click" data-act="show" data-ref="${esc(item.ref)}"><td>${icon(KIND_ICON[kind] || 'puzzle')} <b class="mono" style="font-size:12.5px">${esc(item.ref)}</b></td><td class="mono muted">${esc(item.version)}</td><td><div class="chip-row">${item.targets.filter(t => t !== 'agents').map(t => pill(t)).join('')}</div></td>
      <td><div class="chip-row">${pill(item.status === 'ok' ? 'in sync' : 'drifted', item.status === 'ok' ? 'ok' : 'warn')}${item.update ? pill(item.update, 'accent') : ''}</div>${item.issues.length ? `<div class="faint mono" style="font-size:11px;margin-top:4px">${item.issues.slice(0, 3).map(i => `${esc(i.status)} ${esc(i.path)}`).join('<br>')}</div>` : ''}</td>
      <td style="text-align:right"><button class="btn sm ghost" data-act="remove" data-ref="${esc(item.ref)}">Remove</button></td></tr>`; }).join('')}
    </tbody></table></div></section>`;
}

function catalogTab(data) {
  const installed = new Map(data.installed.map(i => [i.ref, i])), q = ui.query.trim().toLowerCase();
  const kinds = [...new Set(data.catalog.map(c => c.kind))];
  const list = data.catalog.filter(c => (ui.kind === 'all' || c.kind === ui.kind) && (!q || `${c.ref} ${c.description} ${(c.tags || []).join(' ')}`.toLowerCase().includes(q)));
  return `<div class="toolbar"><label class="field">${icon('search')}<input id="cap-q" data-input="search" placeholder="Search the catalog" value="${esc(ui.query)}" aria-label="Search the catalog"></label>
      <div class="seg" role="group" aria-label="Kind">${['all', ...kinds].map(k => `<button class="${ui.kind === k ? 'on' : ''}" data-act="kind" data-kind="${k}">${k === 'all' ? 'All' : ({ skill: 'Skills', agent: 'Agents', command: 'Commands', mcp: 'MCP servers' })[k] || k} <span class="faint">${k === 'all' ? data.catalog.length : data.catalog.filter(c => c.kind === k).length}</span></button>`).join('')}</div></div>
    ${list.length ? `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(290px,1fr));gap:12px">${list.map(c => `<button class="card" data-act="show" data-ref="${esc(c.ref)}" style="text-align:left;padding:14px 16px;display:flex;flex-direction:column;gap:8px;cursor:pointer">
      <div style="display:flex;align-items:center;gap:8px"><span class="icon-btn" style="width:26px;height:26px;background:var(--panel-2)">${icon(KIND_ICON[c.kind] || 'puzzle')}</span><b style="font-weight:600">${esc(c.name)}</b><span class="mono faint" style="font-size:11px;margin-left:auto">${esc(c.version)}</span></div>
      <p class="muted" style="margin:0;font-size:12.5px;line-height:1.5;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden">${esc(c.description)}</p>
      <div class="chip-row" style="margin-top:auto">${pill(c.kind, 'info')}${installed.has(c.ref) ? pill('installed', 'ok') : ''}${c.source !== 'built-in' ? pill(c.source) : ''}</div></button>`).join('')}</div>` : '<div class="card empty">No capability matches.</div>'}`;
}

function toolsTab(data) {
  return `<section class="card"><div class="card-head"><h3>AI tools</h3><span class="count">${data.adapters.filter(a => a.detected).length} detected</span></div>
    <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Tool</th><th>Folder</th><th>In this repository</th></tr></thead><tbody>${data.adapters.map(a => `<tr><td><b>${esc(a.name)}</b><div class="faint mono" style="font-size:11px">${esc(a.id)}</div></td><td><code>${esc(a.home)}</code></td><td>${pill(a.detected ? 'detected' : 'not set up', a.detected ? 'ok' : '')}</td></tr>`).join('')}</tbody></table></div>
    <div class="card-body muted" style="border-top:1px solid var(--line-soft);font-size:12.5px">Capabilities install into the tools listed in <code class="mono">capabilities.targets</code>, or the ones detected here. Pick them per install from the catalog.</div></section>`;
}

// The catalog comes from running commands, so it is read once per visit, not on every keystroke.
export function leave() { cache = null; }
export async function render() {
  const data = await load();
  const tabs = [['installed', 'Installed', data.installed.length], ['catalog', 'Catalog', data.catalog.length], ['tools', 'AI tools', data.adapters.filter(a => a.detected).length]];
  return `<div class="page"><div class="page-head"><div><h1>Capabilities</h1><p>Skills, agents, commands and MCP servers for every AI tool, installed from one catalog with a lockfile.</p></div></div>
    ${data.errors.length ? `<div class="banner">${icon('alert')}${data.errors.map(esc).join('<br>')}</div>` : ''}
    <nav class="tabs" style="margin-top:0" aria-label="Capabilities">${tabs.map(([k, l, n]) => `<a href="#/capabilities" data-act="tab" data-tab="${k}" class="${ui.tab === k ? 'on' : ''}">${l}<em>${n}</em></a>`).join('')}</nav>
    ${ui.tab === 'catalog' ? catalogTab(data) : ui.tab === 'tools' ? toolsTab(data) : installedTab(data)}</div>`;
}

/* ── Plan preview and apply ──────────────────────────────────────── */
function planHtml(result) {
  const plans = result.data?.plans || [];
  const changes = plans.flatMap(p => p.changes.filter(c => c.op !== 'unchanged').map(c => ({ ...c, ref: p.ref })));
  const skipped = plans.flatMap(p => (p.skipped || []).map(s => ({ ...s, ref: p.ref }))), conflicts = plans.flatMap(p => (p.conflicts || []).map(c => ({ ...c, ref: p.ref })));
  const notes = [...(result.data?.notes || []), ...(result.data?.updates || []).map(u => `update ${u}`)];
  return `${!result.ok ? `<div class="banner" style="margin:0 0 10px">${esc(result.error)}</div>` : ''}
    ${notes.length ? `<div class="muted" style="font-size:12.5px">${notes.map(esc).join('<br>')}</div>` : ''}
    ${changes.length ? `<div class="term" style="height:auto;max-height:280px;border-radius:8px;border:1px solid var(--line-soft)">${changes.map(c => { const [tone, mark] = OP[c.op] || ['', '·']; return `<div class="${tone === 'ok' ? 'ok' : tone === 'bad' ? 'bad' : tone === 'warn' ? 'acc' : ''}">${mark} <span class="dim">${esc(c.target.padEnd(12))}</span> ${esc(c.path || c.pointer || c.type)}</div>`; }).join('')}</div>` : result.ok ? '<p class="muted" style="margin:0">Already up to date: nothing to write.</p>' : ''}
    ${skipped.length ? `<div class="faint" style="font-size:12px">${skipped.map(s => `· ${esc(s.target)} skipped: ${esc(s.reason)}`).join('<br>')}</div>` : ''}
    ${conflicts.length ? `<div class="banner" style="margin:0;display:block"><b>${plural(conflicts.length, 'conflict')}</b> — files you edited would be overwritten:<br>${conflicts.map(c => `${esc(c.path)} (${esc(c.reason)})`).join('<br>')}</div>` : ''}`;
}

/** Previews a change with --dry-run, asks, then applies it with --yes. */
async function previewAndApply(ctx, body, heading) {
  closeOverlays();
  const o = document.createElement('div');
  o.className = 'overlay';
  o.innerHTML = `<div class="modal" role="dialog" aria-modal="true" aria-label="${esc(heading)}" style="width:min(640px,calc(100vw - 32px))"><header><h2>${esc(heading)}</h2><p class="mono" id="pl-cmd" style="font-size:12px"></p></header><div class="body" id="pl-body"><div class="skeleton sk-line"></div><div class="skeleton sk-line" style="width:70%"></div></div><footer><button class="btn ghost" data-close>Cancel</button><button class="btn primary" id="pl-apply" disabled>Apply</button></footer></div>`;
  document.body.append(o);
  o.addEventListener('mousedown', event => { if (event.target === o) o.remove(); });
  o.querySelector('[data-close]').addEventListener('click', () => o.remove());
  let preview;
  try { preview = await api('/api/capabilities', { ...body, apply: false }); } catch (error) { preview = { ok: false, error: error.message }; }
  $('#pl-cmd').textContent = `$ ${preview.command || ''}`.replace('--dry-run', '--yes');
  $('#pl-body').innerHTML = planHtml(preview);
  const conflicts = (preview.data?.plans || []).some(p => p.conflicts?.length), count = (preview.data?.plans || []).flatMap(p => p.changes).filter(c => c.op !== 'unchanged').length;
  const apply = $('#pl-apply');
  if (preview.ok && count) { apply.disabled = false; apply.textContent = `Apply ${plural(count, 'change')}`; }
  else if (conflicts) { apply.disabled = false; apply.className = 'btn bad'; apply.textContent = 'Overwrite my edits'; body = { ...body, force: true }; }
  else apply.textContent = 'Nothing to apply';
  apply.addEventListener('click', async () => {
    apply.disabled = true; apply.innerHTML = '<span class="spin"></span>Applying…';
    try {
      const result = await api('/api/capabilities', { ...body, apply: true });
      if (result.ok) { o.remove(); toast(`${heading}: done`); } else { $('#pl-body').innerHTML = planHtml(result); apply.textContent = 'Failed'; }
    } catch (error) { toast(error.message, 'bad'); }
    cache = null; await loadProject().catch(() => {}); ctx.rerender();
  });
}

async function show(ctx, ref) {
  closeOverlays();
  const data = await load(), installed = data.installed.find(i => i.ref === ref);
  const wrap = document.createElement('div');
  wrap.className = 'drawer-wrap';
  wrap.innerHTML = `<aside class="drawer" role="dialog" aria-modal="true" aria-label="${esc(ref)}"><header>${icon(KIND_ICON[ref.split('/')[0]] || 'puzzle')}<h2>${esc(ref)}</h2><button class="icon-btn" data-close aria-label="Close">${icon('x')}</button></header><div id="cap-detail" style="overflow:auto;flex:1"><div style="padding:16px"><div class="skeleton sk-line"></div><div class="skeleton sk-line" style="width:60%"></div></div></div></aside>`;
  wrap.addEventListener('mousedown', event => { if (event.target === wrap) wrap.remove(); });
  wrap.addEventListener('click', event => { if (event.target.closest('[data-close]')) wrap.remove(); });
  document.body.append(wrap);
  let detail;
  try { detail = await api(`/api/capability?ref=${encodeURIComponent(ref)}`); } catch (error) { $('#cap-detail').innerHTML = `<div class="banner" style="margin:16px">${esc(error.message)}</div>`; return; }
  const targets = data.adapters.filter(a => a.detected).map(a => a.id);
  $('#cap-detail').innerHTML = `<div class="kv"><dt>Version</dt><dd class="mono">${esc(detail.version)}</dd><dt>Source</dt><dd>${esc(detail.source)}</dd>${detail.tags?.length ? `<dt>Tags</dt><dd class="chip-row">${detail.tags.map(t => pill(t)).join('')}</dd>` : ''}${detail.files?.length ? `<dt>Files</dt><dd class="mono" style="font-size:12px">${detail.files.map(esc).join('<br>')}</dd>` : ''}${detail.server ? `<dt>Starts</dt><dd class="mono" style="font-size:12px">${esc([detail.server.command, ...(detail.server.args || [])].join(' '))}</dd>` : ''}${installed ? `<dt>Installed in</dt><dd class="chip-row">${installed.targets.filter(t => t !== 'agents').map(t => pill(t, 'ok')).join('')}</dd>` : ''}</div>
    <div style="padding:14px 16px;border-top:1px solid var(--line-soft);border-bottom:1px solid var(--line-soft)"><div class="muted" style="font-size:12px;margin-bottom:8px">${installed ? 'Install into more tools' : 'Install into'}</div>
      <div class="chip-row" id="cap-targets">${data.adapters.map(a => `<label class="pill" style="cursor:pointer;height:26px;gap:6px"><input type="checkbox" value="${esc(a.id)}" ${targets.includes(a.id) ? 'checked' : ''} style="accent-color:var(--accent)">${esc(a.name)}</label>`).join('')}</div>
      ${detail.server ? '<label class="muted" style="display:flex;gap:8px;align-items:center;margin-top:10px;font-size:12.5px"><input type="checkbox" id="cap-exec" style="accent-color:var(--accent)">I reviewed the command above; allow it to start a local process</label>' : ''}
      <div style="display:flex;gap:8px;margin-top:12px"><button class="btn primary" id="cap-install">${icon('plus')}Preview install</button>${installed ? `<button class="btn ghost" id="cap-remove">Remove</button>` : ''}</div></div>
    <div class="md">${markdown(detail.body || detail.description || '')}</div>`;
  $('#cap-install').addEventListener('click', () => {
    const to = [...wrap.querySelectorAll('#cap-targets input:checked')].map(i => i.value);
    if (!to.length) { toast('Pick at least one tool', 'warn'); return; }
    if (detail.server && !$('#cap-exec')?.checked) { toast('Review the command it starts and confirm first', 'warn'); return; }
    previewAndApply(ctx, { action: 'add', refs: [ref], to, allowExec: Boolean(detail.server) }, `Install ${ref}`);
  });
  $('#cap-remove')?.addEventListener('click', () => previewAndApply(ctx, { action: 'remove', refs: [ref] }, `Remove ${ref}`));
}

export const actions = {
  tab: (el, ctx) => { ui.tab = el.dataset.tab; ctx.rerender(); },
  kind: (el, ctx) => { ui.kind = el.dataset.kind; ctx.rerender(); },
  search: (el, ctx) => { ui.query = el.value; ctx.rerender(); },
  show: (el, ctx) => show(ctx, el.dataset.ref),
  remove: (el, ctx) => previewAndApply(ctx, { action: 'remove', refs: [el.dataset.ref] }, `Remove ${el.dataset.ref}`),
  sync: (el, ctx) => previewAndApply(ctx, { action: 'sync' }, 'Sync capabilities')
};
