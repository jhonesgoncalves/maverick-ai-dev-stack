import { api, closeOverlays, copy, dialog, esc, icon, markdown, pill, timeAgo, toast } from '../lib.js';
import { loadProject, store } from '../app.js';

export const title = () => 'Agents';
export const crumbs = () => ['<b>Agents</b>'];
export const loading = () => '<div class="page"><div class="skeleton" style="height:28px;width:160px;margin-bottom:24px"></div><div class="skeleton" style="height:260px"></div></div>';
const ui = { role: null };

/* ── Model and reasoning pickers, shared by the run dialog and the stage defaults ── */
const modelLists = new Map();
/** The models a provider offers, fetched once per page load; the server caches the CLI's answer. */
function modelsFor(id) {
  if (!modelLists.has(id)) modelLists.set(id, api(`/api/agents/models?provider=${encodeURIComponent(id)}`).catch(() => ({ models: [] })));
  return modelLists.get(id);
}
const CUSTOM = '__custom';
/**
 * Fills every model picker inside root with its provider's full model list. A select, not a
 * datalist: a datalist filters its options by the text already in the field, so a prefilled
 * "opus" would hide every other model. "Custom model…" reveals a field for any other id.
 */
async function fillModelLists(root) {
  await Promise.all([...root.querySelectorAll('.model-pick')].map(async pick => {
    const select = pick.querySelector('select'), custom = pick.querySelector('input'), value = pick.dataset.value || '';
    const { models = [] } = await modelsFor(pick.dataset.models);
    const listed = models.some(m => m.id === value);
    select.innerHTML = `<option value="">provider default</option>${models.map(m => `<option value="${esc(m.id)}">${esc(m.id)}${m.name && m.name !== m.id ? ` — ${esc(m.name)}` : ''}</option>`).join('')}${value && !listed ? `<option value="${esc(value)}">${esc(value)}</option>` : ''}<option value="${CUSTOM}">Custom model…</option>`;
    select.value = value;
    select.onchange = () => {
      const other = select.value === CUSTOM;
      custom.classList.toggle('hidden', !other);
      if (other) { custom.value = ''; custom.focus(); }
    };
  }));
}
/** The model a picker holds: the selected one, or the typed id when "Custom model…" is chosen. */
const readModel = root => { const select = root.querySelector('.model-pick select'); return (select?.value === CUSTOM ? root.querySelector('.model-pick input').value : select?.value || '').trim(); };
/** What a provider should use at a stage: the configured default when that stage uses it, else its recommendation. */
function suggestionFor(info, provider, stage) {
  const current = info.stageDefaults?.[stage];
  if (current?.provider === provider.id) return { model: current.model || '', effort: current.effort || '' };
  const rec = provider.recommended?.[stage] || {};
  return { model: rec.model || '', effort: rec.effort && provider.efforts.includes(rec.effort) ? rec.effort : '' };
}
const isRecommended = (provider, stage, model, effort) => { const rec = provider?.recommended?.[stage] || {}; return Boolean(rec.model) && rec.model === model && (rec.effort || '') === (effort || ''); };
const effortSelect = (provider, value, attrs = '') => provider.efforts.length
  ? `<select class="select" ${attrs}><option value="">provider default</option>${provider.efforts.map(level => `<option value="${level}" ${level === value ? 'selected' : ''}>${level}</option>`).join('')}</select>`
  : `<select class="select" ${attrs} disabled title="This agent has no reasoning setting"><option value="">not configurable</option></select>`;
const modelInput = (provider, value, attrs = '') => `<span class="model-pick" data-models="${esc(provider.id)}" data-value="${esc(value)}" style="display:flex;flex-direction:column;gap:6px"><select class="select mono" ${attrs}><option value="${esc(value)}">${esc(value || 'provider default')}</option></select><input class="select mono hidden" ${attrs.replace(/aria-label="[^"]*"/, '')} placeholder="model id, e.g. claude-opus-5-5" autocomplete="off" spellcheck="false" aria-label="Custom model id"></span>`;

/* ── Transcript rendering, shared with Runs ──────────────────────── */
export function agentLine(event) {
  const t = event.type;
  if (t === 'start') return `<div class="acc">▶ ${esc(event.provider)}${event.model ? ` (${esc(event.model)}${event.effort ? `, ${esc(event.effort)} reasoning` : ''})` : event.effort ? ` (${esc(event.effort)} reasoning)` : ''} · permission ${esc(event.permission)}</div>`;
  if (t === 'session') return `<div class="dim">session ${esc(event.id || '')}</div>`;
  if (t === 'text') return event.text?.trim() ? `<div class="txt">${esc(event.text.trim())}</div>` : '';
  if (t === 'tool') return `<div class="tool">→ ${esc(event.name)}${event.detail ? ` <span class="dim">${esc(event.detail)}</span>` : ''}</div>`;
  if (t === 'error') return `<div class="bad">! ${esc(event.message)}</div>`;
  if (t === 'result') return `<div class="${event.ok === false ? 'bad' : 'ok'}">${event.ok === false ? '✗ agent reported an error' : '✓ agent finished its turn'}${event.cost != null ? ` · $${Number(event.cost).toFixed(4)}` : ''}</div>`;
  if (t === 'end') return `<div class="${event.ok ? 'ok' : 'bad'}">${event.ok ? '✓' : '✗'} run ${event.ok ? 'finished' : 'failed'}${event.durationMs != null ? ` in ${Math.round(event.durationMs / 1000)}s` : ''}${event.status ? ` · ${esc(event.status)}` : ''}${event.problems?.length ? `<br>${event.problems.map(esc).join('<br>')}` : ''}</div>`;
  return '';
}

/** Asks which trusted agent to run, then starts it and opens the live run. */
export async function startAgent({ task, subtask, issues, heading, instruction = '' }) {
  let info;
  try { info = await api('/api/agents'); } catch (error) { toast(error.message, 'bad'); return; }
  const usable = info.providers.filter(p => p.trusted && p.installed);
  if (!usable.length) {
    const trusted = info.providers.filter(p => p.trusted);
    const go = await dialog({ title: 'No agent can run yet', text: trusted.length ? `${esc(trusted.map(p => p.name).join(', '))} ${trusted.length > 1 ? 'are' : 'is'} trusted but not installed on this machine. Install it, or trust another provider.` : 'Agents run only after you trust a provider for this repository. The decision is written to <code class="mono">.maverick/config.json</code> so your team reviews it.', confirm: 'Open Agents' });
    if (go) location.hash = '#/agents';
    return;
  }
  const rank = level => info.permissions.indexOf(level);
  // The run's workflow step decides the default agent, model and reasoning.
  const stage = issues?.length ? 'fix' : 'build', stageName = info.stages.find(item => item.id === stage)?.name || stage;
  const preferred = usable.find(p => p.id === info.stageDefaults?.[stage]?.provider) || usable.find(p => p.id === info.default?.provider) || usable[0];
  const initial = suggestionFor(info, preferred, stage);
  closeOverlays();
  const o = document.createElement('div');
  o.className = 'overlay';
  const permissionsFor = p => p.permissions.filter(level => rank(level) <= rank(info.maxPermission));
  o.innerHTML = `<form class="modal" role="dialog" aria-modal="true" aria-labelledby="ag-h"><header><h2 id="ag-h">${esc(heading)}</h2><p>The agent runs headless in this repository, within the task's scope, and writes a transcript you can read in Runs.</p></header>
    <div class="body">
      ${issues?.length ? `<div class="banner warn" style="margin:0;display:block"><b>It will fix ${issues.length} blocking issue${issues.length > 1 ? 's' : ''}:</b><ul class="problems" style="padding:6px 0 0 18px;color:inherit">${issues.slice(0, 5).map(i => `<li>${esc(i)}</li>`).join('')}${issues.length > 5 ? `<li>…and ${issues.length - 5} more</li>` : ''}</ul></div>` : ''}
      <label>Agent<select class="select" name="provider" style="height:36px">${usable.map(p => `<option value="${esc(p.id)}" ${p === preferred ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select></label>
      <div class="grid-2" style="gap:12px"><label>Model <span class="faint" data-hint>${isRecommended(preferred, stage, initial.model, initial.effort) ? `recommended for ${esc(stageName)}` : `${esc(stageName)} default`}</span><span data-model-slot>${modelInput(preferred, initial.model, 'style="height:36px;width:100%"')}</span></label>
      <label>Reasoning<span data-effort-slot>${effortSelect(preferred, initial.effort, 'name="effort" style="height:36px;width:100%"')}</span></label></div>
      <label>Permission<select class="select" name="permission" style="height:36px">${permissionsFor(preferred).map(level => `<option value="${level}" ${level === (rank('edit') <= rank(info.maxPermission) && preferred.permissions.includes('edit') ? 'edit' : permissionsFor(preferred).at(-1)) ? 'selected' : ''}>${level}</option>`).join('')}</select></label>
      <label>Extra instruction <span class="faint">(optional)</span><textarea name="prompt" rows="3" maxlength="4000" placeholder="Anything the agent should know for this run">${esc(instruction)}</textarea></label>
      <p class="faint" style="margin:0;font-size:12px">Ceiling: ${esc(info.maxPermission)} · timeout ${info.timeoutMinutes} min · equivalent to <span class="mono">maverick agent run ${esc(task)}${subtask ? ` --subtask ${esc(subtask)}` : ''}</span></p>
      <div class="banner hidden" id="ag-err"></div></div>
    <footer><button type="button" class="btn ghost" data-close>Cancel</button><button type="submit" class="btn primary">${icon('play')}Start agent</button></footer></form>`;
  document.body.append(o);
  o.addEventListener('mousedown', event => { if (event.target === o) o.remove(); });
  o.querySelector('[data-close]').addEventListener('click', () => o.remove());
  fillModelLists(o);
  o.querySelector('[name=provider]').addEventListener('change', event => {
    const p = usable.find(x => x.id === event.target.value), select = o.querySelector('[name=permission]'), next = suggestionFor(info, p, stage);
    select.innerHTML = permissionsFor(p).map(level => `<option value="${level}" ${level === 'edit' ? 'selected' : ''}>${level}</option>`).join('');
    o.querySelector('[data-model-slot]').innerHTML = modelInput(p, next.model, 'style="height:36px;width:100%"');
    o.querySelector('[data-effort-slot]').innerHTML = effortSelect(p, next.effort, 'name="effort" style="height:36px;width:100%"');
    o.querySelector('[data-hint]').textContent = isRecommended(p, stage, next.model, next.effort) ? `recommended for ${stageName}` : `${stageName} default`;
    fillModelLists(o);
  });
  o.querySelector('form').addEventListener('submit', async event => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.target)), submit = o.querySelector('[type=submit]');
    submit.disabled = true; submit.innerHTML = '<span class="spin"></span>Starting…';
    try {
      const run = await api('/api/agents/run', { task, subtask, issues, provider: data.provider, model: readModel(o) || undefined, effort: data.effort || undefined, permission: data.permission, prompt: data.prompt });
      o.remove(); store.detail.delete(task); store.agentRuns = null;
      toast(`${run.providerName}${run.model ? ` ${run.model}` : ''}${run.effort ? ` (${run.effort})` : ''} started on ${task}`, 'accent');
      location.hash = `#/runs/agent/${run.id}`;
    } catch (error) { const err = o.querySelector('#ag-err'); err.textContent = error.message; err.classList.remove('hidden'); submit.disabled = false; submit.innerHTML = `${icon('play')}Start agent`; }
  });
}

/** Hands an agent the blocking issues of a flow's last run, so it fixes exactly those. */
export async function fixWithAgent(task, flow) {
  try {
    const detail = await api(`/api/task?task=${encodeURIComponent(task)}`), state = detail.flows.find(f => f.name === flow);
    const issues = (state?.lastRun?.results || []).filter(r => r.severity === 'block' && r.status === 'fail').flatMap(r => r.issues.length ? r.issues.map(i => `${r.id}: ${i}`) : [`${r.id} failed`]);
    if (!issues.length) { toast('No blocking gate is failing on this flow', 'warn'); return; }
    await startAgent({ task, issues, heading: `Fix ${flow} flow on ${task}` });
  } catch (error) { toast(error.message, 'bad'); }
}

/* ── Page ────────────────────────────────────────────────────────── */
export async function render() {
  const [info, runs] = await Promise.all([api('/api/agents'), api('/api/agents/runs')]);
  const roles = store.project.agents || [], docs = new Map((store.project.docs || []).map(d => [d.path, d.content]));
  const role = roles.find(r => r.path === ui.role) || roles[0];
  const rank = level => info.permissions.indexOf(level);
  const liveFiles = new Set(runs.live.map(r => r.result?.transcript?.split('/').pop()).filter(Boolean));
  const recent = [...runs.live.map(r => ({ live: true, ...r })), ...runs.history.filter(h => !liveFiles.has(h.file))].slice(0, 6);
  return `<div class="page"><div class="page-head"><div><h1>Agents</h1><p>Headless coding agents that build subtasks and fix failing gates, with scoped permissions and transcripts.</p></div><div class="actions"><a class="btn" href="#/runs?kind=agents">${icon('runs')}Agent runs</a></div></div>
    <section class="card" style="margin-bottom:16px"><div class="card-head"><h3>Providers</h3><span class="count">${info.providers.filter(p => p.trusted).length} trusted</span>
      <div class="right"><label class="muted" style="font-size:12px;display:flex;align-items:center;gap:8px">Max permission<select class="select" data-change="ceiling" aria-label="Maximum permission">${info.permissions.map(level => `<option value="${level}" ${level === info.maxPermission ? 'selected' : ''}>${level}</option>`).join('')}</select></label></div></div>
      <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Agent</th><th>Binary</th><th>Status</th><th>Permissions</th><th></th></tr></thead><tbody>
      ${info.providers.map(p => `<tr><td><b>${esc(p.name)}</b>${info.default?.provider === p.id ? ' ' + pill('default', 'accent') : ''}${p.custom ? ' ' + pill('custom') : ''}<div class="faint mono" style="font-size:11px">${esc(p.id)}</div></td>
        <td><code>${esc(p.bin)}</code></td>
        <td><div class="chip-row">${pill(p.installed ? 'installed' : 'not installed', p.installed ? 'ok' : '')}${pill(p.trusted ? 'trusted' : 'not trusted', p.trusted ? 'accent' : '')}</div></td>
        <td><div class="chip-row">${p.permissions.map(level => pill(level, rank(level) <= rank(info.maxPermission) ? '' : 'warn')).join('')}</div></td>
        <td style="text-align:right;white-space:nowrap">${p.trusted ? `<button class="btn sm ghost" data-act="untrust" data-id="${esc(p.id)}" data-name="${esc(p.name)}">Untrust</button>` : `<button class="btn sm" data-act="trust" data-id="${esc(p.id)}" data-name="${esc(p.name)}" data-bin="${esc(p.bin)}">${icon('shield')}Trust</button>`}</td></tr>`).join('')}
      </tbody></table></div>
      <div class="card-body muted" style="border-top:1px solid var(--line-soft);font-size:12.5px">Trusting a provider lets Lens and <span class="mono">maverick agent run</span> start it with your user account, up to the max permission. The decision is written to <code class="mono">.maverick/config.json</code>; commit it so the team reviews it.${info.routes.length ? ` Routes: ${info.routes.map(r => `<span class="mono">${esc(JSON.stringify(r.match || {}))} → ${esc(r.provider)}</span>`).join(', ')}.` : ''}</div></section>
    ${stagesCard(info)}
    <div class="grid-2">
      <section class="card"><div class="card-head"><h3>Recent agent runs</h3><div class="right"><a class="btn ghost sm" href="#/runs?kind=agents">All ${icon('chev')}</a></div></div>
        ${recent.length ? recent.map(r => r.live ? `<a class="run-row" href="#/runs/agent/${esc(r.id)}">${r.status === 'running' ? '<span class="spin"></span>' : `<span class="dot ${r.status === 'ok' ? 'ok' : r.status === 'stopped' ? 'warn' : 'bad'}"></span>`}<div class="t"><b>${esc(r.providerName)} · ${esc(r.task)}${r.subtask ? ` · ${esc(r.subtask)}` : ''}</b><small>${esc(r.status)} · ${esc(timeAgo(r.startedAt))}</small></div>${r.status === 'running' ? pill('live', 'accent') : ''}</a>`
          : `<a class="run-row" href="#/runs/transcript/${encodeURIComponent(r.task)}/${encodeURIComponent(r.file)}"><span class="dot ${r.ok === null ? '' : r.ok ? 'ok' : 'bad'}"></span><div class="t"><b>${esc(r.provider)} · ${esc(r.task)}</b><small>${r.ok === null ? 'incomplete' : r.ok ? 'finished' : 'failed'}${r.status ? ` · ${esc(r.status)}` : ''} · ${esc(timeAgo(r.at))}</small></div></a>`).join('')
          : '<div class="empty">No agent has run yet. Start one from a ready subtask.</div>'}</section>
      <section class="card"><div class="card-head"><h3>Role instructions</h3><span class="count">${roles.length}</span></div>
        ${roles.length ? `<div style="display:flex;gap:6px;flex-wrap:wrap;padding:12px 16px;border-bottom:1px solid var(--line-soft)">${roles.map(r => `<button class="btn sm ${r === role ? '' : 'ghost'}" data-act="role" data-path="${esc(r.path)}">${esc(r.name)}</button>`).join('')}</div><div class="md" style="max-height:480px;overflow:auto">${markdown(docs.get(role.path) || '')}</div>` : '<div class="empty">No role files in agents/.</div>'}</section>
    </div></div>`;
}

/** One row per workflow step: the agent, model and reasoning its runs use unless changed at launch. */
function stagesCard(info) {
  const byId = new Map(info.providers.map(p => [p.id, p]));
  const rows = info.stages.map(stage => {
    const current = info.stageDefaults?.[stage.id] || {}, provider = byId.get(current.provider);
    const recommended = provider && isRecommended(provider, stage.id, current.model || '', current.effort || '');
    return `<tr data-stage="${esc(stage.id)}"><td><b>${esc(stage.name)}</b><div class="faint" style="font-size:11.5px;max-width:260px">${esc(stage.description)}</div></td>
      <td><select class="select" data-change="stage-provider" aria-label="${esc(stage.name)} agent" style="min-width:150px">${provider ? '' : '<option value="" selected>choose an agent</option>'}${info.providers.map(p => `<option value="${esc(p.id)}" ${p === provider ? 'selected' : ''}>${esc(p.name)}${p.trusted ? '' : ' (not trusted)'}</option>`).join('')}</select></td>
      <td data-model-slot>${provider ? modelInput(provider, current.model || '', `aria-label="${esc(stage.name)} model" style="min-width:170px"`) : '<span class="faint">—</span>'}</td>
      <td data-effort-slot>${provider ? effortSelect(provider, current.effort || '', `aria-label="${esc(stage.name)} reasoning"`) : ''}</td>
      <td>${current.configured ? pill('configured', 'accent') : recommended ? pill('recommended', 'ok') : pill('provider default')}</td>
      <td style="text-align:right;white-space:nowrap"><button class="btn sm" data-act="stage-save">Save</button>${current.configured ? ` <button class="btn sm ghost" data-act="stage-reset" title="Back to the recommendation">Reset</button>` : ''}</td></tr>`;
  }).join('');
  return `<section class="card" style="margin-bottom:16px"><div class="card-head"><h3>Workflow defaults</h3><span class="count">agent · model · reasoning per step</span></div>
    <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Step</th><th>Agent</th><th>Model</th><th>Reasoning</th><th></th><th></th></tr></thead><tbody>${rows}</tbody></table></div>
    <div class="card-body muted" style="border-top:1px solid var(--line-soft);font-size:12.5px">Every run starts with its step's default and you can change it at launch. Recommended: the strongest model with high reasoning for planning (PRD, specs, tasks), the coding workhorse at high reasoning for building, and a lighter setting for fixing failed gates. Saved to <code class="mono">runtime.stages</code> in <code class="mono">.maverick/config.json</code> through <span class="mono">maverick agent stage</span>.</div></section>`;
}

async function saveStage(ctx, body, label) {
  try {
    const result = await api('/api/agents/stage', body);
    if (!result.ok) toast(result.error || 'Nothing changed', 'bad'); else toast(label, 'ok');
  } catch (error) { toast(error.message, 'bad'); }
  ctx.rerender();
}

export function after(ctx, root) { fillModelLists(root); }

async function setTrust(ctx, body, label) {
  try {
    const result = await api('/api/agents/trust', body);
    if (!result.ok) toast(result.error || 'Nothing changed', 'bad'); else toast(label);
  } catch (error) { toast(error.message, 'bad'); }
  await loadProject().catch(() => {}); ctx.rerender();
}
export const actions = {
  role: (el, ctx) => { ui.role = el.dataset.path; ctx.rerender(); },
  trust: async (el, ctx) => {
    const ok = await dialog({ title: `Trust ${el.dataset.name}?`, text: `Lens and <span class="mono">maverick agent run</span> will be able to start <code class="mono">${esc(el.dataset.bin)}</code> in this repository with your user account, up to the max permission. This is written to <code class="mono">.maverick/config.json</code>.`, confirm: 'Trust provider' });
    if (ok) setTrust(ctx, { provider: el.dataset.id, trusted: true }, `${el.dataset.name} is trusted`);
  },
  untrust: async (el, ctx) => {
    const ok = await dialog({ title: `Stop trusting ${el.dataset.name}?`, text: 'It will no longer be able to run in this repository until someone trusts it again.', confirm: 'Untrust', tone: 'bad' });
    if (ok) setTrust(ctx, { provider: el.dataset.id, trusted: false }, `${el.dataset.name} is no longer trusted`);
  },
  ceiling: async (el, ctx) => {
    const info = await api('/api/agents'), trusted = info.providers.find(p => p.trusted);
    if (!trusted) { toast('Trust a provider first; the ceiling is saved with it', 'warn'); ctx.rerender(); return; }
    setTrust(ctx, { provider: trusted.id, trusted: true, maxPermission: el.value }, `Max permission set to ${el.value}`);
  },
  copy: el => copy(el.dataset.text),
  'stage-provider': async el => {
    const row = el.closest('tr'), info = await api('/api/agents'), provider = info.providers.find(p => p.id === el.value);
    if (!provider) return;
    const next = suggestionFor(info, provider, row.dataset.stage);
    row.querySelector('[data-model-slot]').innerHTML = modelInput(provider, next.model, 'style="min-width:170px"');
    row.querySelector('[data-effort-slot]').innerHTML = effortSelect(provider, next.effort);
    fillModelLists(row);
  },
  'stage-save': (el, ctx) => {
    const row = el.closest('tr'), provider = row.querySelector('[data-change=stage-provider]').value;
    if (!provider) { toast('Choose an agent for this step first', 'warn'); return; }
    const model = readModel(row), effort = row.querySelector('[data-effort-slot] select')?.value || '';
    el.disabled = true;
    saveStage(ctx, { stage: row.dataset.stage, provider, model, effort }, `${row.querySelector('b').textContent}: ${provider}${model ? ` · ${model}` : ''}${effort ? ` · ${effort}` : ''}`);
  },
  'stage-reset': (el, ctx) => { el.disabled = true; saveStage(ctx, { stage: el.closest('tr').dataset.stage, reset: true }, 'Back to the recommended default'); }
};
