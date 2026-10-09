import { $, api, esc, icon, OUTCOME, pill, timeAgo, toast } from '../lib.js';
import { bus, loadAgentRuns, loadRuns } from '../app.js';
import { runFlowFor } from './task.js';
import { agentLine } from './agents.js';

const ui = { kind: null, outcome: 'all' };
const AGENT_TONE = { running: 'accent', ok: 'ok', failed: 'bad', stopped: 'warn' };
let unsubscribe = null;

export const title = () => 'Runs';
export const crumbs = ({ route }) => route.id ? ['<a href="#/runs">Runs</a>', `<b>${route.id === 'flow' ? 'Flow run' : 'Agent run'}</b>`] : ['<b>Runs</b>'];
export const loading = () => '<div class="page"><div class="skeleton" style="height:28px;width:160px;margin-bottom:24px"></div><div class="runs"><div class="skeleton" style="height:360px"></div><div class="skeleton" style="height:360px"></div></div></div>';
export const followsLive = route => route.id === 'agent';
export function leave() { unsubscribe?.(); unsubscribe = null; }

const duration = ms => ms == null ? '' : ms < 60000 ? `${Math.round(ms / 1000)}s` : `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`;

// Runs started by this Lens process also have a transcript; list them once, as live runs.
function pastRuns(agentRuns) { const files = new Set(agentRuns.live.map(r => r.result?.transcript?.split('/').pop()).filter(Boolean)); return agentRuns.history.filter(h => !files.has(h.file)); }

function agentList(agentRuns, route) {
  const live = agentRuns.live, history = pastRuns(agentRuns);
  const selectedLive = route.id === 'agent' ? route.tab : null, selectedFile = route.id === 'transcript' ? `${route.tab}/${route.rest[0]}` : null;
  const rows = [
    ...live.map(r => `<a class="run-item ${r.id === selectedLive ? 'on' : ''}" href="#/runs/agent/${esc(r.id)}">${r.status === 'running' ? '<span class="spin" style="margin-top:3px"></span>' : `<span class="dot ${AGENT_TONE[r.status]}" style="margin-top:7px"></span>`}<div class="t"><b>${esc(r.providerName)} · ${esc(r.task)}</b><small>${r.subtask ? `subtask ${esc(r.subtask)} · ` : r.kind === 'fix' ? 'fix · ' : ''}${esc(r.status)} · ${esc(timeAgo(r.startedAt))}</small></div></a>`),
    ...history.map(h => `<a class="run-item ${`${h.task}/${h.file}` === selectedFile ? 'on' : ''}" href="#/runs/transcript/${encodeURIComponent(h.task)}/${encodeURIComponent(h.file)}"><span class="dot ${h.ok === null ? '' : h.ok ? 'ok' : 'bad'}" style="margin-top:7px"></span><div class="t"><b>${esc(h.provider)} · ${esc(h.task)}</b><small>${h.ok === null ? 'incomplete' : h.ok ? 'finished' : 'failed'}${h.durationMs != null ? ` · ${duration(h.durationMs)}` : ''} · ${esc(timeAgo(h.at))}</small></div></a>`)
  ];
  return rows.length ? rows.join('') : '<div class="empty">No agent has run yet.</div>';
}

function agentDetail(run, events) {
  const r = run.result;
  return `<section class="card" style="display:flex;flex-direction:column;min-width:0"><div class="card-head"><h3>${esc(run.providerName || run.provider)} · <a class="link" href="#/tasks/${encodeURIComponent(run.task)}">${esc(run.task)}</a>${run.subtask ? ` · subtask ${esc(run.subtask)}` : ''}</h3>
      <div class="right">${pill(run.status || (r?.ok ? 'ok' : r ? 'failed' : 'incomplete'), AGENT_TONE[run.status] || (r?.ok ? 'ok' : 'bad'))}${run.status === 'running' ? `<button class="btn sm bad" data-act="stop" data-id="${esc(run.id)}">${icon('x')}Stop</button>` : ''}</div></div>
    <div class="steps-line">${[run.subtaskTitle && pill(run.subtaskTitle), pill(`permission ${run.permission || '—'}`), run.model && pill(run.model), run.kind === 'fix' && pill('fixing gates', 'warn')].filter(Boolean).join('')}<span class="muted mono" id="run-clock" style="margin-left:auto;font-size:11.5px" data-start="${esc(run.startedAt || '')}">${run.status === 'running' ? '' : r?.durationMs != null ? duration(r.durationMs) : ''}</span></div>
    ${r ? `<div class="kv" style="border-top:1px solid var(--line-soft)">${r.status ? `<dt>Agent status</dt><dd>${esc(r.status)}</dd>` : ''}${r.summary ? `<dt>Summary</dt><dd>${esc(r.summary)}</dd>` : ''}${r.filesChanged?.length ? `<dt>Files changed</dt><dd class="chip-row">${r.filesChanged.map(f => `<code class="pill">${esc(f)}</code>`).join('')}</dd>` : ''}${r.questions?.length ? `<dt>Questions</dt><dd>${r.questions.map(q => `<div>? ${esc(q)}</div>`).join('')}</dd>` : ''}${r.problems?.length ? `<dt>Problems</dt><dd class="bad" style="color:#ff9b98">${r.problems.map(esc).join('<br>')}</dd>` : ''}${r.warnings?.length ? `<dt>Warnings</dt><dd>${r.warnings.map(esc).join('<br>')}</dd>` : ''}${r.cost != null ? `<dt>Cost</dt><dd class="mono">$${Number(r.cost).toFixed(4)}</dd>` : ''}${r.transcript ? `<dt>Transcript</dt><dd class="mono muted">${esc(r.transcript)}</dd>` : ''}</div>` : ''}
    ${run.subtask && run.status === 'ok' ? `<div class="banner warn" style="margin:0 16px 12px">Review the change, then mark subtask ${esc(run.subtask)} done from the task's Subtasks tab and run the ship flow.</div>` : ''}
    <div class="term" id="term" aria-live="polite" style="height:auto;min-height:320px;max-height:calc(100vh - 340px);white-space:pre-wrap;overflow-wrap:anywhere">${events.map(agentLine).join('') || '<span class="dim" id="term-wait">Waiting for the agent…</span>'}${run.status === 'running' ? '<span class="caret" id="caret"></span>' : ''}</div></section>`;
}

function flowList(runs, selected) {
  const filtered = runs.map((run, index) => ({ ...run, index })).filter(run => ui.outcome === 'all' || (ui.outcome === 'failed' ? ['revise', 'stalled', 'exhausted'].includes(run.outcome) : run.outcome === ui.outcome));
  return filtered.length ? filtered.map(run => { const [t] = OUTCOME[run.outcome] || ['']; return `<a class="run-item ${selected && run.index === selected.index ? 'on' : ''}" href="#/runs/flow/${run.index}"><span class="dot ${t}" style="margin-top:7px"></span><div class="t"><b>${esc(run.flow)} · ${esc(run.task)}</b><small>${esc(run.outcome.replace(/-/g, ' '))} · ${esc(timeAgo(run.at))}</small></div></a>`; }).join('') : '<div class="empty">No run matches this filter.</div>';
}

function flowDetail(selected) {
  const [tone, label] = OUTCOME[selected.outcome] || ['', selected.outcome];
  const blocking = selected.results.filter(r => r.severity === 'block');
  return `<section class="card"><div class="card-head"><h3>${esc(selected.flow)} flow · <a class="link" href="#/tasks/${encodeURIComponent(selected.task)}">${esc(selected.task)}</a></h3><div class="right">${pill(label, tone)}<button class="btn sm" data-act="rerun" data-task="${esc(selected.task)}" data-flow="${esc(selected.flow)}">${icon('refresh')}Run again</button></div></div>
    <div class="steps-line">${selected.results.map(r => `<span class="pill ${r.status === 'pass' ? 'ok' : r.status === 'fail' ? (r.severity === 'warn' ? 'warn' : 'bad') : 'accent'}">${icon(r.status === 'pass' ? 'check' : r.status === 'fail' ? 'x' : 'clock')}${esc(r.id)}</span>`).join('')}<span class="muted mono" style="margin-left:auto;font-size:11.5px">${esc(new Date(selected.at).toLocaleString())} · iteration ${selected.iteration}</span></div>
    <div style="border-top:1px solid var(--line-soft)">${selected.results.map(r => { const st = r.status === 'fail' && r.severity === 'warn' ? 'warn' : r.status; return `<div class="gate"><span class="mark ${st}">${icon(st === 'pass' ? 'check' : st === 'fail' ? 'x' : st === 'warn' ? 'alert' : 'clock')}</span><div style="min-width:0"><b>${esc(r.id)}</b> <span class="pill">${esc(r.type)}</span>${r.severity === 'warn' ? ' <span class="pill">warn only</span>' : ''}${r.summary ? `<div class="summary">${esc(r.summary)}</div>` : ''}${r.issues.length && st !== 'pass' ? `<ul class="${st === 'warn' || st === 'pending' ? 'warn' : ''}">${r.issues.map(i => `<li>${esc(i)}</li>`).join('')}</ul>` : ''}</div>${pill(st, st === 'pass' ? 'ok' : st === 'fail' ? 'bad' : st === 'warn' ? 'warn' : 'accent')}</div>`; }).join('')}</div>
    <div class="kv" style="border-top:1px solid var(--line-soft)"><dt>Blocking gates</dt><dd>${blocking.filter(r => r.status === 'pass').length}/${blocking.length} passed</dd><dt>Task</dt><dd><a class="link" href="#/tasks/${encodeURIComponent(selected.task)}/gates?flow=${encodeURIComponent(selected.flow)}">Open gates & approvals</a></dd></div></section>`;
}

export async function render({ route }) {
  const [flows, agentRuns] = await Promise.all([loadRuns(true), loadAgentRuns(true)]);
  const agentCount = agentRuns.live.length + pastRuns(agentRuns).length;
  if (route.params.get('kind')) ui.kind = route.params.get('kind');
  if (route.id === 'flow') ui.kind = 'flows'; else if (['agent', 'transcript'].includes(route.id)) ui.kind = 'agents';
  const kind = ui.kind || (agentCount ? 'agents' : 'flows');
  const head = `<div class="page-head"><div><h1>Runs</h1><p>Agent sessions and flow evaluations across tasks.</p></div>
    <div class="actions">${kind === 'flows' ? `<div class="seg" role="group" aria-label="Outcome">${[['all', 'All'], ['done', 'Passing'], ['awaiting-approval', 'Awaiting'], ['failed', 'Failed']].map(([k, l]) => `<button class="${ui.outcome === k ? 'on' : ''}" data-act="outcome" data-outcome="${k}">${l}</button>`).join('')}</div>` : ''}
      <div class="seg" role="tablist" aria-label="Kind"><a href="#/runs?kind=agents" role="tab" aria-selected="${kind === 'agents'}" class="${kind === 'agents' ? 'on' : ''}" style="height:26px;padding:0 10px;border-radius:6px;display:inline-flex;align-items:center;gap:6px;${kind === 'agents' ? 'background:var(--panel-3);color:var(--text)' : 'color:var(--muted)'}">${icon('agent')}Agents <span class="faint">${agentCount}</span></a><a href="#/runs?kind=flows" role="tab" aria-selected="${kind === 'flows'}" style="height:26px;padding:0 10px;border-radius:6px;display:inline-flex;align-items:center;gap:6px;${kind === 'flows' ? 'background:var(--panel-3);color:var(--text)' : 'color:var(--muted)'}">${icon('flow')}Flows <span class="faint">${flows.length}</span></a></div></div></div>`;

  if (kind === 'flows') {
    if (!flows.length) return `<div class="page">${head}<div class="card empty-state"><div class="glyph">${icon('flow')}</div><h3>No flow runs yet</h3><p>Open a task and run its ship flow. Each run evaluates every gate once and is recorded here.</p><a class="btn" href="#/tasks">Go to tasks</a></div></div>`;
    const selected = route.id === 'flow' && flows[Number(route.tab)] ? { ...flows[Number(route.tab)], index: Number(route.tab) } : { ...flows[0], index: 0 };
    return `<div class="page">${head}<div class="runs"><section class="card" style="max-height:calc(100vh - 200px);overflow:auto">${flowList(flows, selected)}</section>${flowDetail(selected)}</div></div>`;
  }

  if (!agentCount) return `<div class="page">${head}<div class="card empty-state"><div class="glyph">${icon('agent')}</div><h3>No agent runs yet</h3><p>Start an agent on a ready subtask, or let one fix the failing gates of a flow. Its events stream here live, and the transcript stays for review.</p><a class="btn" href="#/agents">Set up agents</a></div></div>`;
  let detail;
  if (route.id === 'transcript') {
    const data = await api(`/api/agents/transcript?task=${encodeURIComponent(route.tab)}&file=${encodeURIComponent(route.rest[0] || '')}`);
    const start = data.events.find(e => e.type === 'start'), end = data.events.findLast(e => e.type === 'end'), result = data.events.findLast(e => e.type === 'result');
    detail = agentDetail({ provider: start?.provider, providerName: start?.provider, task: data.task, permission: start?.permission, model: start?.model, status: end ? (end.ok ? 'ok' : 'failed') : null, result: end ? { ok: end.ok, problems: end.problems || [], status: end.status, durationMs: end.durationMs, cost: result?.cost ?? null, transcript: `${data.task}/runs/${data.file}` } : null }, data.events);
  } else {
    const id = route.id === 'agent' ? route.tab : agentRuns.live[0]?.id;
    if (id) { const run = await api(`/api/agents/run?id=${encodeURIComponent(id)}`).catch(() => null); detail = run ? agentDetail(run, run.events) : '<section class="card empty">This run belongs to an earlier Lens session; open its transcript from the list.</section>'; }
    else { const h = pastRuns(agentRuns)[0]; location.replace(`#/runs/transcript/${encodeURIComponent(h.task)}/${encodeURIComponent(h.file)}`); return loading(); }
  }
  return `<div class="page wide" style="max-width:1500px">${head}<div class="runs"><section class="card" style="max-height:calc(100vh - 200px);overflow:auto">${agentList(agentRuns, route)}</section>${detail}</div></div>`;
}

export function after({ route }) {
  leave();
  const term = $('#term');
  if (term) term.scrollTop = term.scrollHeight;
  if (route.id !== 'agent') return;
  const id = route.tab, clock = $('#run-clock');
  const onEvent = event => {
    if (event.detail.id !== id) return;
    const box = $('#term'); if (!box) return;
    const follow = box.scrollHeight - box.scrollTop - box.clientHeight < 60;
    $('#term-wait')?.remove();
    $('#caret')?.insertAdjacentHTML('beforebegin', agentLine(event.detail.event));
    if (follow) box.scrollTop = box.scrollHeight;
  };
  bus.addEventListener('agent', onEvent);
  const timer = clock?.dataset.start && !clock.textContent ? setInterval(() => { clock.textContent = duration(Date.now() - new Date(clock.dataset.start).getTime()); }, 1000) : null;
  unsubscribe = () => { bus.removeEventListener('agent', onEvent); if (timer) clearInterval(timer); };
}

export const actions = {
  outcome: (el, ctx) => { ui.outcome = el.dataset.outcome; ctx.rerender(); },
  rerun: el => runFlowFor(el.dataset.task, el.dataset.flow),
  stop: async el => { el.disabled = true; el.innerHTML = '<span class="spin"></span>Stopping…'; try { await api('/api/agents/stop', { id: el.dataset.id }); toast('Stop requested', 'warn'); } catch (error) { toast(error.message, 'bad'); } }
};
