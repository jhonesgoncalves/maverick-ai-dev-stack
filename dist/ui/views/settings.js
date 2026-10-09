import { api, copy, esc, icon, pill, toast } from '../lib.js';
import { loadProject, store } from '../app.js';

const LANGS = [['en', 'English'], ['pt-BR', 'Português (Brasil)'], ['es', 'Español']];
export const title = () => 'Settings';
export const crumbs = () => ['<b>Settings</b>'];
export const loading = () => '<div class="page"><div class="skeleton" style="height:28px;width:160px;margin-bottom:24px"></div><div class="grid-2"><div class="skeleton" style="height:300px"></div><div class="skeleton" style="height:300px"></div></div></div>';

const langSelect = (name, value) => `<select class="select" name="${name}" style="height:34px;width:100%">${[...LANGS, ...(LANGS.some(([v]) => v === value) ? [] : [[value, value]])].map(([v, l]) => `<option value="${esc(v)}" ${v === value ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`;

export async function render() {
  const s = await api('/api/settings'), p = store.project, cfg = s.config?.config || {}, checks = s.doctor?.checks || [];
  const failing = checks.filter(c => !c.ok), commands = s.stack?.commands || [], configured = cfg.verification?.commands || [];
  return `<div class="page"><div class="page-head"><div><h1>Settings</h1><p>How Maverick sees this project, and the settings Lens can change for you.</p></div></div>
    ${s.configError ? `<div class="banner">${icon('alert')}Configuration is invalid: ${esc(s.configError)}</div>` : ''}
    <div class="grid-2">
      <div class="stack">
        <section class="card"><div class="card-head"><h3>Health</h3><span class="count">${checks.length - failing.length}/${checks.length} passing</span><div class="right">${pill(failing.length ? `${failing.length} to fix` : 'healthy', failing.length ? 'warn' : 'ok')}</div></div>
          ${checks.map(c => `<div class="gate" style="grid-template-columns:28px minmax(0,1fr)"><span class="mark ${c.ok ? 'pass' : 'warn'}">${icon(c.ok ? 'check' : 'alert')}</span><div><b>${esc(c.name)}</b>${c.detail && (!c.ok || c.name === 'Stack detected') ? `<p>${esc(c.detail)}</p>` : ''}</div></div>`).join('')}
          ${s.doctor?.fixes?.length ? `<div class="card-body" style="border-top:1px solid var(--line-soft)"><div class="eyebrow" style="margin-bottom:6px">Suggested fixes</div><ul class="problems" style="color:var(--text-2);padding:0 0 0 18px">${s.doctor.fixes.map(f => `<li>${esc(f)}</li>`).join('')}</ul></div>` : ''}</section>
        <section class="card"><div class="card-head"><h3>Verification commands</h3><span class="count">${configured.length ? 'from config' : 'detected'}</span></div>
          ${(configured.length ? configured.map(c => ({ name: c.name || c.kind || 'custom', command: c.command || c, cwd: c.cwd || '' })) : commands).map(c => `<div class="run-row"><span class="pill">${esc(c.kind || c.name)}</span><div class="t"><b class="mono" style="font-size:12.5px">${esc(c.command)}</b>${c.cwd ? `<small>in ${esc(c.cwd)}/</small>` : ''}</div></div>`).join('') || '<div class="empty">No verification command detected. Declare them in <code class="mono">.maverick/config.json</code> under <code class="mono">verification.commands</code>.</div>'}
          <div class="card-body muted" style="border-top:1px solid var(--line-soft);font-size:12.5px">These run in <b>verify</b> and in the <b>checks</b> gate. Override them with <code class="mono">verification.commands</code> in <code class="mono">.maverick/config.json</code>.</div></section>
      </div>
      <div class="stack">
        <section class="card"><div class="card-head"><h3>Project</h3></div><dl class="kv">
          <dt>Name</dt><dd>${esc(p.project?.name || '')}</dd><dt>Root</dt><dd class="mono" style="font-size:12px">${esc(p.project?.root || '')}</dd>
          <dt>Stack</dt><dd class="chip-row">${[...(s.stack?.languages || []), ...(s.stack?.frameworks || [])].map(x => pill(x, 'info')).join('') || '—'}</dd>
          <dt>Package manager</dt><dd>${esc(p.project?.packageManager || '—')}</dd><dt>Default workflow</dt><dd>${pill(cfg.workflow?.default || 'standard', 'accent')}</dd>
          <dt>Task folder</dt><dd class="mono" style="font-size:12px">${esc(cfg.taskRoot || '.maverick/tasks')}</dd><dt>Maverick</dt><dd class="mono" style="font-size:12px">v${esc(p.project?.version || '')}</dd></dl></section>
        <form class="card" data-language><div class="card-head"><h3>Language</h3></div><div class="approve-box">
          <label>Documents (PRD, spec, tasks, review)${langSelect('docs', s.language?.docs || 'en')}</label>
          <label>Code (identifiers, comments, tests, commits)${langSelect('code', s.language?.code || 'en')}</label>
          <div class="row"><button type="button" class="btn primary" data-act="save-language">Save</button><span class="faint" style="font-size:12px;align-self:center">Runs <span class="mono">maverick language</span></span></div></div></form>
        <section class="card"><div class="card-head"><h3>Configuration layers</h3><div class="right"><button class="btn sm ghost" data-act="copy" data-text=".maverick/config.json">${icon('copy')}Project file</button></div></div>
          ${(s.config?.sources || []).map((src, i) => `<div class="run-row"><span class="pill ${i === (s.config.sources.length - 1) ? 'accent' : ''}">${esc(src.scope)}</span><div class="t"><b class="mono" style="font-size:12px">${esc(src.path || 'built-in defaults')}</b></div></div>`).join('')}
          <details style="border-top:1px solid var(--line-soft)"><summary style="padding:12px 16px;cursor:pointer;color:var(--muted)">Effective configuration</summary><pre class="term" style="height:auto;max-height:360px;margin:0;border-radius:0 0 12px 12px">${esc(JSON.stringify(cfg, null, 2))}</pre></details></section>
        ${(p.adapters || []).length ? `<section class="card"><div class="card-head"><h3>Instruction templates</h3><span class="count">${p.adapters.filter(a => a.installed).length}/${p.adapters.length} installed</span></div>${p.adapters.map(a => `<div class="run-row"><div class="t"><b>${esc(a.name || a.id)}</b><small class="mono">${esc(a.target || '')}${a.status === 'active' ? ' · active adapter' : ''}</small></div>${a.installed ? pill('installed', 'ok') : `<button class="btn sm ghost" data-act="adapter" data-id="${esc(a.id)}">${icon('plus')}Install</button>`}</div>`).join('')}
          <div class="card-body muted" style="border-top:1px solid var(--line-soft);font-size:12.5px">Skills, agents, commands and MCP servers for each tool are managed in <b>Capabilities</b>.</div></section>` : ''}
        <section class="card"><div class="card-head"><h3>MCP server</h3></div><div class="card-body muted" style="font-size:12.5px">Give any MCP client read-only access to the project map, tasks and analysis:<div class="cmd mono" style="margin-top:10px;display:flex;gap:8px;align-items:center;padding:8px 10px;border:1px solid var(--line-soft);border-radius:8px;background:var(--bg);color:var(--text-2)"><span style="flex:1">maverick mcp</span><button class="icon-btn" style="width:22px;height:22px" data-act="copy" data-text="maverick mcp" aria-label="Copy">${icon('copy')}</button></div></div></section>
      </div>
    </div></div>`;
}

export const actions = {
  copy: el => copy(el.dataset.text),
  'save-language': async (el, ctx) => {
    const data = Object.fromEntries(new FormData(el.closest('form')));
    el.disabled = true;
    try { const result = await api('/api/settings', { action: 'language', docs: data.docs, code: data.code }); toast(result.ok ? `Documents in ${data.docs}, code in ${data.code}` : result.error, result.ok ? 'ok' : 'bad'); }
    catch (error) { toast(error.message, 'bad'); }
    await loadProject().catch(() => {}); ctx.rerender();
  },
  adapter: async (el, ctx) => {
    el.disabled = true;
    try { const result = await api('/api/settings', { action: 'adapter', id: el.dataset.id }); toast(result.ok ? `Installed ${result.data?.path || el.dataset.id}` : result.error, result.ok ? 'ok' : 'bad'); }
    catch (error) { toast(error.message, 'bad'); }
    await loadProject().catch(() => {}); ctx.rerender();
  }
};
