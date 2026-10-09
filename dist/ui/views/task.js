import { $, api, clock, copy, dialog, drawer, esc, icon, markdown, OUTCOME, pill, PLANNING, STAGE_LABEL, taskState, timeAgo, toast } from '../lib.js';
import { loadDetail, loadProject, render as renderApp, store } from '../app.js';
import { fixWithAgent, startAgent } from './agents.js';

const TABS = [['overview', 'Overview'], ['subtasks', 'Subtasks'], ['gates', 'Gates & approvals'], ['artifacts', 'Artifacts'], ['activity', 'Activity']];
const artifactCache = new Map();
const reviewer = () => { try { return localStorage.getItem('lens.reviewer') || ''; } catch { return ''; } };
const q = encodeURIComponent;

export const title = ({ route }) => store.detail.get(route.id)?.title || route.id;
export const crumbs = ({ route }) => ['<a href="#/tasks">Tasks</a>', `<b>${esc(store.project.tasks.find(t => t.id === route.id)?.title || route.id)}</b>`];
export const loading = () => `<div class="page"><div class="skeleton" style="height:14px;width:280px"></div><div class="skeleton" style="height:28px;width:60%;margin:12px 0 24px"></div><div class="skeleton" style="height:22px"></div><div class="skeleton" style="height:320px;margin-top:24px"></div></div>`;

/* ── Commands the page suggests ──────────────────────────────────── */
function nextStep(t) {
  const ready = t.subtasks.find(s => s.ready);
  if (PLANNING.includes(t.stage)) return { text: t.next, command: `maverick instructions ${t.id} ${t.stage}`, label: `Copy ${STAGE_LABEL[t.stage]} instructions`, act: 'copy-cmd' };
  if (t.stage === 'build' && ready) return { text: `Subtask ${ready.id} · ${ready.title} is ready to build.`, command: `maverick agent run ${t.id} --subtask ${ready.id}`, label: `Start subtask ${ready.id}`, act: 'start-subtask', id: ready.id };
  if (t.stage === 'build') return { text: t.next, command: `maverick subtask next ${t.id}`, label: 'Open subtasks', act: 'tab', tab: 'subtasks' };
  if (t.stage === 'verify') return { text: 'Run lint, typecheck, tests and build, and record the evidence.', command: `maverick verify ${t.id}`, label: 'Run verify', act: 'run', action: 'verify' };
  if (t.stage === 'security') return { text: 'Run the security gate on the diff.', command: `maverick security ${t.id}`, label: 'Run security scan', act: 'run', action: 'security' };
  if (t.stage === 'review' && t.flows.find(f => f.name === 'ship')?.status === 'awaiting-approval') return { text: 'Every blocking check of the ship flow passed. Review the change and record your decision.', command: `maverick flow approve ship ${t.id} human-review`, label: 'Review and approve', act: 'tab', tab: 'gates' };
  if (t.stage === 'review') return { text: 'Run the ship flow, review the change and record your decision.', command: `maverick flow run ship ${t.id}`, label: 'Open gates', act: 'tab', tab: 'gates' };
  return { text: 'Every gate passed. Draft the pull request description.', command: `maverick pr ${t.id}`, label: 'Draft pull request', act: 'run', action: 'pr' };
}

/* ── Tabs ────────────────────────────────────────────────────────── */
function overview(t) {
  const traced = t.criteria.filter(c => c.tested).length;
  return `${t.goal ? `<div class="section"><h4>Overview</h4><div class="card"><div class="md" style="padding:14px 18px">${markdown(t.goal)}</div></div></div>` : ''}
    ${t.goals.length ? `<div class="section"><h4>Goals</h4><div class="card"><ul class="problems" style="color:var(--text-2)">${t.goals.map(g => `<li>${esc(g)}</li>`).join('')}</ul></div></div>` : ''}
    <div class="section"><h4>Acceptance criteria${t.criteria.length ? ` · ${traced}/${t.criteria.length} have a test` : ''}</h4>
      ${t.criteria.length ? `<div class="card">${t.criteria.map(c => `<div class="ac"><code>${esc(c.id)}</code><p>${esc(c.text)}</p><div class="cov">${t.workflow === 'spec-driven' ? pill('spec', c.specified ? 'info' : 'warn') : ''}${pill(c.tested ? 'test' : 'no test', c.tested ? 'ok' : 'warn')}${c.tasks.length ? pill(c.tasks.join(' '), '') : pill('no task', t.subtasks.length ? 'warn' : '')}</div></div>`).join('')}</div>`
        : `<div class="card empty">No acceptance criteria yet. They come from the PRD.</div>`}</div>
    <div class="section scope"><div><h4>Files in scope</h4><div class="card">${t.scope.length ? `<ul>${t.scope.map(s => `<li><code>${esc(s)}</code></li>`).join('')}</ul>` : '<div class="empty" style="padding:20px">Declared by the technical spec.</div>'}</div></div>
      <div><h4>Out of scope</h4><div class="card">${t.nonGoals.length ? `<ul>${t.nonGoals.map(s => `<li>${esc(s)}</li>`).join('')}</ul>` : '<div class="empty" style="padding:20px">Declared by the PRD.</div>'}</div></div></div>`;
}

function subtasks(t) {
  if (!t.subtasks.length) return `<div class="card empty-state"><div class="glyph">${icon('tasks')}</div><h3>No subtasks yet</h3><p>${PLANNING.includes(t.stage) ? 'Subtasks are written after the technical spec, at the Tasks stage.' : 'Break the technical spec into subtasks with the maverick-tasks skill.'}</p><button class="btn" data-act="copy-cmd" data-cmd="maverick instructions ${esc(t.id)} tasks">${icon('copy')}Copy tasks instructions</button></div>`;
  // Columns are dependency depths, so parallel work sits side by side.
  const depth = new Map(), byId = new Map(t.subtasks.map(s => [s.id, s]));
  const depthOf = (id, seen = new Set()) => { if (depth.has(id)) return depth.get(id); if (seen.has(id)) return 0; seen.add(id); const d = Math.max(-1, ...(byId.get(id)?.dependsOn || []).map(dep => depthOf(dep, seen))) + 1; depth.set(id, d); return d; };
  t.subtasks.forEach(s => depthOf(s.id));
  const columns = [...new Set(depth.values())].sort((a, b) => a - b).map(d => t.subtasks.filter(s => depth.get(s.id) === d));
  const tone = s => s.status === 'done' ? 'ok' : s.ready ? 'accent' : s.status === 'in-progress' ? 'warn' : s.status === 'blocked' ? 'bad' : '';
  const label = s => s.ready ? 'ready' : s.status;
  const done = t.subtasks.filter(s => s.status === 'done').length;
  return `${t.subtaskProblems.length ? `<div class="banner">${icon('alert')}<div><b>The subtask graph has problems</b><ul class="problems" style="padding:4px 0 0 18px">${t.subtaskProblems.map(p => `<li>${esc(p)}</li>`).join('')}</ul></div></div>` : ''}
    <div class="section"><h4>Dependency graph</h4><div class="card dag" role="list" aria-label="Subtask dependency graph">
      ${columns.map((col, i) => `${i ? `<span class="darrow" aria-hidden="true">${icon('chev')}</span>` : ''}<div class="dag-col">${col.map(s => `<div class="dnode ${s.status === 'done' ? 'done' : s.ready ? 'ready' : ''}" role="listitem"><div class="top"><code>${esc(s.id)}</code>${pill(label(s), tone(s))}</div><b>${esc(s.title)}</b>${s.checklist.total ? `<div class="prog"><div class="bar"><i style="width:${Math.round(s.checklist.done / s.checklist.total * 100)}%"></i></div>${s.checklist.done}/${s.checklist.total}</div>` : ''}</div>`).join('')}</div>`).join('')}
    </div></div>
    <div class="section"><h4>Subtasks · ${done}/${t.subtasks.length} done</h4><div class="card">${t.subtasks.map(s => `<div class="sub-row"><span class="num">${esc(s.id)}</span>
      <div style="min-width:0"><b>${esc(s.title)}</b><small>${[s.dependsOn.length ? `after ${s.dependsOn.join(', ')}` : 'no dependencies', s.criteria.length ? s.criteria.join(', ') : '', s.checklist.total ? `${s.checklist.done}/${s.checklist.total} steps` : '', s.files.slice(0, 3).join(', ')].filter(Boolean).map(esc).join(' · ')}</small></div>
      <div class="acts"><button class="btn sm ghost" data-act="open-artifact" data-file="subtasks/${esc(s.file)}" title="Read ${esc(s.file)}">${icon('file')}</button>
        <select class="select" data-change="subtask-status" data-id="${esc(s.id)}" aria-label="Status of subtask ${esc(s.id)}">${t.statuses.map(o => `<option value="${o}" ${o === s.status ? 'selected' : ''}>${o}</option>`).join('')}</select>
        ${s.ready ? `<button class="btn sm primary" data-act="start-subtask" data-id="${esc(s.id)}">${icon('play')}Start</button>` : ''}</div></div>`).join('')}</div></div>`;
}

function gates(t, route) {
  if (!t.flows.length) return '<div class="card empty">No flow is available for this task.</div>';
  const flow = t.flows.find(f => f.name === route.params.get('flow')) || t.flows[0], last = flow.lastRun;
  const [tone, label] = OUTCOME[flow.status] || ['', flow.status];
  const terminal = ['stalled', 'exhausted'].includes(flow.status);
  const result = gate => last?.results.find(r => r.id === gate.id);
  // A recorded decision is the current state of an approval gate, even before the flow runs again.
  const statusOf = gate => { const r = result(gate), approval = flow.approvals[gate.id]; if (gate.type === 'approval' && approval) return approval.decision === 'approve' ? 'pass' : 'fail'; if (!r) return 'idle'; return r.status === 'fail' && gate.severity === 'warn' ? 'warn' : r.status; };
  const mark = { pass: 'check', fail: 'x', warn: 'alert', pending: 'clock', idle: 'clock' };
  const approvals = flow.gates.filter(g => g.type === 'approval'), pending = approvals.filter(g => statusOf(g) !== 'pass');
  // While the flow waits on a human, the decision is the next step, so it comes before the gates.
  const waiting = flow.status === 'awaiting-approval';
  const decision = pending.length ? `<form class="card" style="${waiting ? 'margin-bottom' : 'margin-top'}:16px" data-approval data-flow="${esc(flow.name)}"><div class="card-head"><h3>Record your decision</h3><span class="count">${pending.map(g => esc(g.id)).join(', ')}</span></div><div class="approve-box">
      ${pending.length > 1 ? `<label for="ap-gate">Gate</label><select class="select" id="ap-gate" name="gate" style="height:34px">${pending.map(g => `<option value="${esc(g.id)}">${esc(g.id)}</option>`).join('')}</select>` : `<input type="hidden" name="gate" value="${esc(pending[0].id)}">`}
      <p class="muted" style="margin:0">${esc(pending[0].prompt || '')}</p>
      <label for="ap-by">Reviewed by</label><input id="ap-by" name="by" value="${esc(reviewer())}" autocomplete="name" required placeholder="Your name">
      <label for="ap-why">Note <span class="faint">(required to request changes)</span></label><textarea id="ap-why" name="reason" rows="3" placeholder="What you checked, and anything to follow up"></textarea>
      <div class="row"><button type="button" class="btn ok" data-act="decide" data-decision="approve">${icon('check')}Approve</button><button type="button" class="btn bad" data-act="decide" data-decision="reject">${icon('x')}Request changes</button></div>
      <p class="faint" style="margin:0;font-size:12px">${flow.autoApprove ? `Auto-approve is on: the next run of ${esc(flow.name)} approves this when every blocking check passes.` : `Approving finishes the flow when its blocking checks already pass; otherwise run ${esc(flow.name)} again.`}</p></div></form>` : '';
  return `${waiting ? decision : ''}<div class="card">
    <div class="flowbar">${t.flows.length > 1 ? `<div class="seg" role="tablist">${t.flows.map(f => `<a href="#/tasks/${q(t.id)}/gates?flow=${q(f.name)}" class="${f === flow ? 'on' : ''}" role="tab" aria-selected="${f === flow}" style="height:26px;padding:0 10px;border-radius:6px;display:inline-flex;align-items:center;gap:6px;color:${f === flow ? 'var(--text)' : 'var(--muted)'};background:${f === flow ? 'var(--panel-3)' : 'none'}">${icon('flow')}${esc(f.name)}</a>`).join('')}</div>` : `<b>${icon('flow')} ${esc(flow.name)}</b>`}
      ${pill(label, tone)}
      <small class="muted mono" style="font-size:11.5px">${last ? `iteration ${last.iteration}/${flow.contract.iterationCap} · ${esc(timeAgo(last.at))}` : 'never run'}</small>
      ${flow.history.length ? `<span class="history" title="Last runs">${flow.history.map(h => `<i class="${(OUTCOME[h.outcome] || [''])[0]}" title="${esc(h.outcome)} · ${esc(clock(h.at))}"></i>`).join('')}</span>` : ''}
      <span style="margin-left:auto;display:flex;gap:12px;align-items:center">${approvals.length ? `<label class="switch" title="When every blocking check passes, ${esc(flow.name)} approves its pending approval gates itself, for every task in this repository"><input type="checkbox" data-change="auto-approve" data-flow="${esc(flow.name)}" ${flow.autoApprove ? 'checked' : ''}><i aria-hidden="true"></i><span>Auto-approve</span></label>` : ''}${flow.status === 'revise' ? `<button class="btn sm" data-act="fix-agent" data-flow="${esc(flow.name)}">${icon('agent')}Fix with agent</button>` : ''}${terminal ? `<button class="btn sm" data-act="run-flow" data-flow="${esc(flow.name)}" data-reset="1">${icon('undo')}Reset and run</button>` : `<button class="btn sm primary" data-act="run-flow" data-flow="${esc(flow.name)}">${icon('play')}Run ${esc(flow.name)}</button>`}</span></div>
    <div style="padding:10px 16px;border-bottom:1px solid var(--line-soft);color:var(--muted);font-size:12.5px">${esc(flow.contract.goal.replace(/\{\{\s*task\s*\}\}/g, t.id))}</div>
    ${flow.gates.map(g => { const r = result(g), st = statusOf(g), approval = g.type === 'approval' ? flow.approvals[g.id] : null; return `<div class="gate"><span class="mark ${st === 'idle' ? 'pending' : st}">${icon(mark[st])}</span>
      <div style="min-width:0"><b>${esc(g.id)}</b> <span class="pill" style="margin-left:4px">${esc(g.type === 'maverick' ? g.run : g.type)}</span>${g.severity === 'warn' ? ' <span class="pill">warn only</span>' : ''}
        <p>${esc(g.description || g.prompt || '')}</p>
        ${approval ? `<div class="summary">${approval.auto ? 'auto-approved' : `${approval.decision === 'approve' ? 'approved' : 'changes requested'} by ${esc(approval.by)}`} · ${esc(timeAgo(approval.at))}${approval.reason ? ` — ${esc(approval.reason)}` : ''}</div>` : r?.summary ? `<div class="summary">${esc(r.summary)}</div>` : ''}
        ${r?.issues?.length && !approval && st !== 'pass' ? `<ul class="${st === 'warn' || st === 'pending' ? 'warn' : ''}">${r.issues.map(i => `<li>${esc(i)}</li>`).join('')}</ul>` : ''}</div>
      ${pill(st === 'idle' ? 'not run' : st, st === 'pass' ? 'ok' : st === 'fail' ? 'bad' : st === 'warn' ? 'warn' : st === 'pending' ? 'accent' : '')}</div>`; }).join('')}
  </div>
  ${waiting ? '' : decision}`;
}

function artifacts(t, route) {
  if (!t.artifacts.length) return '<div class="card empty">No artifacts yet.</div>';
  const file = route.params.get('file') || (t.artifacts.find(a => a.file === 'PRD.md') || t.artifacts[0]).file;
  const cached = artifactCache.get(`${t.id}/${file}`);
  const group = kind => t.artifacts.filter(a => a.kind === kind);
  const list = [['plan', 'Plan'], ['review', 'Review'], ['report', 'Reports'], ['subtask', 'Subtasks']].filter(([k]) => group(k).length)
    .map(([k, l]) => `<div class="eyebrow" style="margin:10px 8px 4px">${l}</div>${group(k).map(a => `<a href="#/tasks/${q(t.id)}/artifacts?file=${q(a.file)}" class="${a.file === file ? 'on' : ''}" style="display:flex;align-items:center;gap:8px;padding:7px 8px;border-radius:6px;color:${a.file === file ? 'var(--text)' : 'var(--text-2)'};background:${a.file === file ? 'var(--panel-3)' : 'none'}">${icon('file')}<span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(a.file.replace('subtasks/', ''))}</span></a>`).join('')}`).join('');
  return `<div class="card artifacts"><div class="art-list">${list}</div>
    <article><div class="reader-head"><h2>${esc(file)}</h2><button class="btn sm ghost" data-act="copy-cmd" data-cmd="${esc(`.maverick/tasks/${t.id}/${file}`)}">${icon('copy')}Copy path</button><span class="path">${esc(timeAgo(t.artifacts.find(a => a.file === file)?.updated))}</span></div>
      <div class="md" id="artifact-body">${cached !== undefined ? markdown(cached) : '<div class="skeleton sk-line" style="width:70%"></div><div class="skeleton sk-line"></div><div class="skeleton sk-line" style="width:85%"></div>'}</div></article></div>`;
}

function activity(t) {
  return `<div class="card"><div class="feed" style="padding-top:14px">${t.activity.length ? t.activity.map(a => `<div class="feed-item"><span class="dot ${a.tone}"></span><div><p><b>${esc(a.text)}</b>${a.detail ? ` · ${esc(a.detail)}` : ''}</p><small>${esc(timeAgo(a.at))} · ${esc(new Date(a.at).toLocaleString())}</small></div></div>`).join('') : '<p class="muted">No activity yet.</p>'}</div></div>`;
}

/* ── Page ────────────────────────────────────────────────────────── */
export async function render(ctx) {
  const { route } = ctx, t = await loadDetail(route.id), tab = TABS.some(([k]) => k === route.tab) ? route.tab : 'overview';
  const summary = store.project.tasks.find(x => x.id === t.id) || { ...t, flows: t.flows.map(f => ({ flow: f.name, status: f.status })), subtasks: { problems: t.subtaskProblems.length, ready: t.subtasks.filter(s => s.ready).map(s => s.id) } };
  const state = taskState(summary), next = nextStep(t), idx = t.stages.indexOf(t.stage), done = t.subtasks.filter(s => s.status === 'done').length;
  const counts = { subtasks: t.subtasks.length, gates: t.flows.length, artifacts: t.artifacts.length };
  const body = tab === 'subtasks' ? subtasks(t) : tab === 'gates' ? gates(t, route) : tab === 'artifacts' ? artifacts(t, route) : tab === 'activity' ? activity(t) : overview(t);
  return `<div class="page"><div class="detail"><div style="min-width:0">
    <div class="task-head"><div class="ids"><span>${esc(t.id)}</span><span class="faint">·</span>${pill(t.workflow)}${pill(state.state === 'attention' ? state.reason : STAGE_LABEL[t.stage] || t.stage, state.tone)}</div><h1>${esc(t.title)}</h1></div>
    <div class="stepper" aria-label="Workflow stages">${t.stages.map((s, i) => { const st = i < idx ? 'done' : i === idx ? 'cur' : ''; return `<div class="step ${st}" title="${esc(STAGE_LABEL[s] || s)}${st === 'cur' ? ' (current)' : ''}"><span>${st === 'done' ? icon('check') : ''}${esc(STAGE_LABEL[s] || s)}</span><i></i></div>`; }).join('')}</div>
    <nav class="tabs" aria-label="Task sections">${TABS.map(([k, l]) => `<a href="#/tasks/${q(t.id)}/${k}" class="${tab === k ? 'on' : ''}" ${tab === k ? 'aria-current="page"' : ''}>${l}${counts[k] !== undefined ? `<em>${counts[k]}</em>` : ''}</a>`).join('')}</nav>
    ${body}
  </div>
  <aside class="rail">
    <section class="card next"><div class="card-body"><div class="eyebrow" style="color:var(--accent-ink)">Next step</div><p>${esc(next.text)}</p>
      <div class="cmd"><span title="${esc(next.command)}">${esc(next.command)}</span><button class="icon-btn" style="width:22px;height:22px" data-act="copy-cmd" data-cmd="${esc(next.command)}" aria-label="Copy command">${icon('copy')}</button></div>
      <button class="btn primary" style="width:100%;justify-content:center" data-act="${next.act}" ${next.action ? `data-action="${next.action}"` : ''} ${next.tab ? `data-tab="${next.tab}"` : ''} ${next.id ? `data-id="${esc(next.id)}"` : ''} data-cmd="${esc(next.command)}">${icon(next.act === 'copy-cmd' ? 'copy' : next.act === 'tab' ? 'chev' : 'play')}${esc(next.label)}</button></div></section>
    <section class="card"><div class="card-head"><h3>Details</h3></div><dl class="props">
      <dt>Stage</dt><dd>${pill(STAGE_LABEL[t.stage] || t.stage, 'accent')}<span class="muted">${idx + 1}/${t.stages.length}</span></dd>
      <dt>Workflow</dt><dd>${esc(t.workflow)}</dd>
      <dt>Subtasks</dt><dd>${t.subtasks.length ? `${done} of ${t.subtasks.length} done` : '—'}</dd>
      <dt>Criteria</dt><dd>${t.criteria.length ? `${t.criteria.filter(c => c.tested).length}/${t.criteria.length} tested` : '—'}</dd>
      <dt>Evidence</dt><dd>${t.evidence ? pill('captured', 'ok') : pill('pending')}</dd>
      ${t.created ? `<dt>Created</dt><dd class="mono muted" style="font-size:12px">${esc(new Date(t.created).toLocaleDateString())}</dd>` : ''}
      <dt>Updated</dt><dd class="mono muted" style="font-size:12px">${esc(timeAgo(summary.updated))}</dd></dl></section>
    <section class="card"><div class="card-head"><h3>Run</h3><span class="count">maverick</span></div><div class="card-body" style="display:grid;gap:2px;padding:8px">
      <button class="btn ghost" style="justify-content:flex-start" data-act="run-agent">${icon('agent')}Run an agent<span class="mono faint" style="margin-left:auto;font-size:11px">agent run</span></button>
      ${[['check', 'Validate artifacts', 'validate'], ['shield', 'Verify', 'verify'], ['search', 'Scope guard', 'guard'], ['alert', 'Security scan', 'security'], ['puzzle', 'Dependencies', 'deps'], ['file', 'Review diff', 'review'], ['bolt', 'Readiness', 'readiness'], ['branch', 'Checkpoint', 'checkpoint'], ['pr', 'Draft pull request', 'pr']].map(([ic, l, c]) => `<button class="btn ghost" style="justify-content:flex-start" data-act="run" data-action="${c}">${icon(ic)}${l}<span class="mono faint" style="margin-left:auto;font-size:11px">${c}</span></button>`).join('')}
    </div></section>
  </aside></div></div>`;
}

export async function after({ route }) {
  if (route.tab !== 'artifacts') return;
  const t = store.detail.get(route.id); if (!t?.artifacts.length) return;
  const file = route.params.get('file') || (t.artifacts.find(a => a.file === 'PRD.md') || t.artifacts[0]).file, key = `${t.id}/${file}`;
  if (artifactCache.has(key)) return;
  try { const { content } = await api(`/api/artifact?task=${q(t.id)}&file=${q(file)}`); artifactCache.set(key, content); const el = $('#artifact-body'); if (el) el.innerHTML = markdown(content); }
  catch (error) { const el = $('#artifact-body'); if (el) el.innerHTML = `<div class="banner">${esc(error.message)}</div>`; }
}

/* ── Actions ─────────────────────────────────────────────────────── */
async function refreshTask(id) { artifactCache.clear(); store.detail.delete(id); await loadProject().catch(() => {}); await renderApp({ keepScroll: true }); }

/** Runs a flow on a task and shows its gates; used by the task page, the Inbox and the palette. */
export async function runFlowFor(id, flow, reset = false) {
  const sheet = drawer(`${flow} flow · ${id}`, `maverick flow run ${flow} ${id}${reset ? ' --reset' : ''}`);
  try {
    const result = await api('/api/action', { action: 'flow-run', task: id, flow, reset });
    if (!result.ok) { sheet.done({ ok: false, output: result.error }); return; }
    const [tone, label] = OUTCOME[result.run.outcome] || ['', result.run.outcome];
    sheet.done({ ok: result.run.outcome !== 'revise' && !['stalled', 'exhausted'].includes(result.run.outcome), summary: `<div style="display:flex;gap:8px;align-items:center">${pill(label, tone)}<span class="muted">${esc(result.next)}</span></div>${result.notes.map(n => `<div class="faint">${esc(n)}</div>`).join('')}`,
      output: result.run.results.map(r => `${r.status === 'pass' ? '✓' : r.status === 'fail' ? (r.severity === 'warn' ? '⚠' : '✗') : '…'} ${r.id}${r.summary ? ` — ${r.summary}` : ''}${r.issues.length && r.status !== 'pass' ? `\n${r.issues.map(i => `    ${i}`).join('\n')}` : ''}`).join('\n') });
  } catch (error) { sheet.done({ ok: false, output: error.message }); }
  store.detail.delete(id); store.runs = null; await loadProject().catch(() => {});
  if (location.hash.startsWith(`#/tasks/${q(id)}`) || location.hash.startsWith('#/inbox') || location.hash.startsWith('#/runs')) renderApp({ keepScroll: true });
}

async function runCommand(id, action) {
  const sheet = drawer(`${action} · ${id}`, `maverick ${action} ${id}${action === 'review' ? ' --diff' : ''}`);
  try { const result = await api('/api/action', { action, task: id }); sheet.done({ ok: result.ok, output: [result.output, result.ok ? '' : result.error].filter(Boolean).join('\n') }); }
  catch (error) { sheet.done({ ok: false, output: error.message }); }
  await refreshTask(id);
}

/** The open checklist items named in a refused `subtask set … done`, or null for any other error. */
function openItems(error = '') {
  if (!/item\(s\) unchecked/.test(error)) return null;
  const [head, ...items] = error.split(/\s*- \[ \] /);
  return { file: (head.match(/unchecked in (\S+);/) || [])[1] || 'the task file', items: items.map(item => item.trim()).filter(Boolean) };
}

/**
 * Finishing a subtask with open items: the checklist is the progress record, so Lens shows what
 * is open and offers the two honest ways out: an agent that verifies and checks each item,
 * or marking it done anyway (`--force`) after your own review.
 */
function resolveOpenItems(task, id, { file, items }) {
  return new Promise(resolve => {
    const o = document.createElement('div');
    o.className = 'overlay';
    o.innerHTML = `<div class="modal" role="dialog" aria-modal="true" aria-labelledby="oi-h"><header><h2 id="oi-h">Subtask ${esc(id)} has ${items.length} unchecked item${items.length === 1 ? '' : 's'}</h2><p>The checklist in <code class="mono">${esc(file)}</code> is the progress record: each item is checked (<code class="mono">- [x]</code>) when it is true. Let an agent verify and check them, or mark the subtask done anyway if you reviewed the work yourself.</p></header>
      <div class="body"><ul class="problems" style="max-height:280px;overflow:auto;margin:0;padding-left:18px;color:var(--text-2)">${items.map(item => `<li>${esc(item)}</li>`).join('')}</ul></div>
      <footer><button type="button" class="btn ghost" data-r="cancel">Cancel</button><button type="button" class="btn" data-r="force">Mark done anyway</button><button type="button" class="btn primary" data-r="agent">${icon('play')}Verify with agent</button></footer></div>`;
    const finish = async choice => {
      o.remove();
      if (choice === 'agent') await startAgent({ task, subtask: id, heading: `Verify subtask ${id}`, instruction: `The implementation of subtask ${id} is already in the working tree. Do not redo it. Go through every unchecked item in ${file}: verify it against the code and by running the verification commands, check it (- [x]) when it is true, and fix only what is missing. Leave an item unchecked, with the reason, when it is not true.` });
      if (choice === 'force') {
        try {
          const result = await api('/api/action', { action: 'subtask-set', task, id, status: 'done', force: true });
          toast(result.ok ? `Subtask ${id} → done (${items.length} item${items.length === 1 ? '' : 's'} left unchecked)` : result.error, result.ok ? 'warn' : 'bad');
        } catch (error) { toast(error.message, 'bad'); }
        await refreshTask(task);
      }
      resolve(choice);
    };
    o.addEventListener('mousedown', event => { if (event.target === o) finish('cancel'); });
    o.querySelectorAll('[data-r]').forEach(button => button.addEventListener('click', () => finish(button.dataset.r)));
    document.body.append(o);
    o.querySelector('[data-r=agent]').focus();
  });
}

export const actions = {
  tab: (el, { route }) => { location.hash = `#/tasks/${q(route.id)}/${el.dataset.tab}`; },
  'copy-cmd': el => copy(el.dataset.cmd, 'Copied to clipboard'),
  run: (el, { route }) => runCommand(route.id, el.dataset.action),
  'run-flow': (el, { route }) => runFlowFor(route.id, el.dataset.flow, el.dataset.reset === '1'),
  'open-artifact': (el, { route }) => { location.hash = `#/tasks/${q(route.id)}/artifacts?file=${q(el.dataset.file)}`; },
  'start-subtask': (el, { route }) => startAgent({ task: route.id, subtask: el.dataset.id, heading: `Start subtask ${el.dataset.id}` }),
  'run-agent': (el, { route }) => startAgent({ task: route.id, heading: 'Run an agent on this task' }),
  'fix-agent': (el, { route }) => fixWithAgent(route.id, el.dataset.flow),
  'subtask-status': async (el, { route }) => {
    const previous = [...el.options].find(o => o.defaultSelected)?.value;
    el.disabled = true;
    try {
      const result = await api('/api/action', { action: 'subtask-set', task: route.id, id: el.dataset.id, status: el.value });
      const open = !result.ok && el.value === 'done' && openItems(result.error);
      if (open) { el.value = previous; await resolveOpenItems(route.id, el.dataset.id, open); }
      else if (!result.ok) { toast(result.error || 'Could not change the status', 'bad'); el.value = previous; }
      else toast(`Subtask ${el.dataset.id} → ${el.value}`);
    } catch (error) { toast(error.message, 'bad'); el.value = previous; }
    await refreshTask(route.id);
  },
  decide: async (el, { route }) => {
    const form = el.closest('form'), data = Object.fromEntries(new FormData(form)), decision = el.dataset.decision;
    if (!data.by?.trim()) { form.querySelector('[name=by]').focus(); toast('Enter your name to record the decision', 'warn'); return; }
    if (decision === 'reject' && !data.reason?.trim()) { form.querySelector('[name=reason]').focus(); toast('Explain what needs to change', 'warn'); return; }
    try { localStorage.setItem('lens.reviewer', data.by.trim()); } catch { /* private mode */ }
    form.querySelectorAll('button').forEach(b => { b.disabled = true; });
    try {
      const { outcome } = await api('/api/task-flow/approval', { task: route.id, flow: form.dataset.flow, gate: data.gate, decision, by: data.by.trim(), reason: data.reason });
      const now = outcome && `${form.dataset.flow} ${(OUTCOME[outcome] || ['', outcome])[1].toLowerCase()}`;
      toast(decision === 'approve' ? `Approved · ${now || `run ${form.dataset.flow} again to finalize`}` : `Changes requested${now ? ` · ${now}` : ''}`, decision === 'approve' ? 'ok' : 'warn');
    } catch (error) { toast(error.message, 'bad'); }
    await refreshTask(route.id);
  },
  'auto-approve': async (el, { route }) => {
    const flow = el.dataset.flow, enabled = el.checked;
    if (enabled && !await dialog({ title: `Auto-approve the ${flow} flow?`, text: `When every blocking check passes, a run of <b>${esc(flow)}</b> approves its pending approval gates itself instead of waiting for a human, for every task in this repository. Auto-approved gates say so. This is written to <code class="mono">.maverick/config.json</code>.`, confirm: 'Turn on auto-approve' })) { el.checked = false; return; }
    el.disabled = true;
    try {
      const result = await api('/api/task-flow/auto-approve', { flow, enabled });
      if (!result.ok) toast(result.error || 'Nothing changed', 'bad');
      else toast(enabled ? `${flow} approves itself once every blocking check passes` : `${flow} waits for a human approval again`, enabled ? 'warn' : 'ok');
    } catch (error) { toast(error.message, 'bad'); }
    await refreshTask(route.id);
  }
};
