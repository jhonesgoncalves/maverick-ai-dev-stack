import { esc, icon, LANES, OUTCOME, pill, plural, STAGE_LABEL, taskState, timeAgo } from '../lib.js';
import { loadAgentRuns, loadRuns, store } from '../app.js';
import { runFlowFor } from './task.js';
import { fixWithAgent, startAgent } from './agents.js';

export const title = () => 'Inbox';
export const crumbs = () => ['<b>Inbox</b>'];
export const loading = () => '<div class="page"><div class="skeleton" style="height:28px;width:260px;margin-bottom:24px"></div><div class="kpis">' + '<div class="card kpi"><div class="skeleton sk-line" style="width:60%"></div><div class="skeleton" style="height:26px;width:40%"></div></div>'.repeat(4) + '</div></div>';

function greeting() { const h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'; }

// Each item is something only a human can move forward, with the action right there.
function decisions(tasks) {
  const items = [];
  for (const task of tasks) {
    const s = taskState(task), open = `#/tasks/${encodeURIComponent(task.id)}`;
    if (s.kind === 'approval') items.push({ tone: 'warn', ic: 'shield', rank: 0, title: `Approve ${task.title}`, text: `Every automated gate of the ${s.flow} flow passed. A human decision is the last step.`, task, actions: `<a class="btn sm primary" href="${open}/gates?flow=${encodeURIComponent(s.flow)}">${icon('shield')}Review</a>` });
    else if (s.kind === 'failing') items.push({ tone: 'bad', ic: 'alert', rank: 1, title: `${s.flow} flow needs fixes on ${task.title}`, text: 'Blocking gates failed. Fix them without widening scope, then run the flow again.', task, actions: `<button class="btn sm" data-act="fix" data-task="${esc(task.id)}" data-flow="${esc(s.flow)}">${icon('agent')}Fix with agent</button><a class="btn sm" href="${open}/gates?flow=${encodeURIComponent(s.flow)}">Gates</a>` });
    else if (s.kind === 'graph') items.push({ tone: 'bad', ic: 'alert', rank: 1, title: `Subtask graph is broken on ${task.title}`, text: s.reason, task, actions: `<a class="btn sm" href="${open}/subtasks">Open subtasks</a>` });
    else if (s.kind === 'build') items.push({ tone: 'accent', ic: 'play', rank: 2, title: `${s.reason}`, text: task.title, task, actions: `<button class="btn sm primary" data-act="start" data-task="${esc(task.id)}" data-id="${esc(task.subtasks.ready[0])}">${icon('play')}Start agent</button><a class="btn sm" href="${open}/subtasks">Open</a>` });
    else if (s.kind === 'ship') items.push({ tone: 'ok', ic: 'pr', rank: 3, title: `${task.title} is ready to ship`, text: 'Every gate passed and review is recorded. Draft the pull request.', task, actions: `<a class="btn sm" href="${open}">Open</a>` });
  }
  return items.sort((a, b) => a.rank - b.rank);
}

function passRate(runs) {
  const results = runs.slice(0, 20).flatMap(run => run.results.filter(r => r.severity === 'block' && r.type !== 'approval'));
  return results.length ? Math.round(results.filter(r => r.status === 'pass').length / results.length * 100) : null;
}

export async function render() {
  const p = store.project, tasks = p.tasks || [];
  const [runs, agentRuns] = await Promise.all([loadRuns().catch(() => []), loadAgentRuns().catch(() => ({ live: [] }))]);
  const liveAgents = agentRuns.live.filter(r => r.status === 'running');
  const items = decisions(tasks), needs = items.filter(i => i.rank < 2).length;
  const moving = tasks.filter(t => taskState(t).state === 'active').length, shipping = tasks.filter(t => t.stage === 'pr').length, rate = passRate(runs);
  const lanes = LANES.map(l => ({ ...l, n: tasks.filter(t => l.stages.includes(t.stage)).length }));
  const upNext = tasks.filter(t => ['queued', 'active'].includes(taskState(t).state) && !items.some(i => i.task === t)).slice(0, 5);
  const activity = [
    ...runs.slice(0, 12).map(run => ({ at: run.at, tone: (OUTCOME[run.outcome] || [''])[0] || 'info', html: `<b>${esc(run.flow)} flow</b> · ${esc(run.outcome.replace(/-/g, ' '))} on ${esc(run.task)}` })),
    ...(p.git?.commits || []).map(c => ({ at: null, tone: 'info', html: `<b>${esc(c.split(' ')[0])}</b> ${esc(c.split(' ').slice(1).join(' '))}` }))
  ].slice(0, 10);
  const today = new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });

  if (!tasks.length) return `<div class="page"><div class="page-head"><div><div class="eyebrow">${esc(today)}</div><h1>${greeting()}</h1><p>This project has no tasks yet.</p></div></div>
    <div class="card empty-state"><div class="glyph">${icon('plus')}</div><h3>Start your first task</h3><p>Describe a change. Your AI agent writes the PRD, the technical spec and the subtasks; Lens tracks every gate until it ships.</p><button class="btn primary" data-act="new-task">${icon('plus')}New task</button></div></div>`;

  return `<div class="page">
    <div class="page-head"><div><div class="eyebrow">${esc(today)}</div><h1>${greeting()}</h1><p>${needs ? `${plural(needs, 'decision')} waiting on you.` : 'Nothing is blocked on you.'} ${moving ? `${plural(moving, 'task')} moving.` : ''} ${liveAgents.length ? `${plural(liveAgents.length, 'agent')} working.` : ''}</p></div>
      <div class="actions"><button class="btn" data-act="palette">${icon('bolt')}Quick action<kbd style="margin-left:4px">⌘K</kbd></button></div></div>
    <div class="kpis">
      <a class="card kpi" href="#/tasks?filter=attention"><div class="label"><span class="dot warn"></span>Needs you</div><div class="value">${needs}</div><div class="sub">${items.filter(i => i.tone === 'warn').length} approvals · ${items.filter(i => i.tone === 'bad').length} failures</div></a>
      <a class="card kpi" href="#/tasks?filter=active"><div class="label"><span class="dot accent"></span>In progress</div><div class="value">${moving}</div><div class="sub">of ${plural(tasks.length, 'task')}</div></a>
      <a class="card kpi" href="#/runs"><div class="label"><span class="dot ok"></span>Gate pass rate</div><div class="value">${rate === null ? '—' : `${rate}%`}</div><div class="sub">${runs.length ? `blocking gates · last ${Math.min(runs.length, 20)} runs` : 'no flow runs yet'}</div></a>
      <a class="card kpi" href="#/tasks?filter=ready"><div class="label"><span class="dot info"></span>Ready to ship</div><div class="value">${shipping}</div><div class="sub">at the PR stage</div></a>
    </div>
    <div class="grid-2">
      <div class="stack">
        <section class="card"><div class="card-head"><h3>Your queue</h3><span class="count">${items.length}</span><div class="right"><a class="btn ghost sm" href="#/tasks">All tasks ${icon('chev')}</a></div></div>
          ${items.length ? items.map(i => `<div class="attn"><div class="ic ${i.tone}">${icon(i.ic)}</div><div class="body"><b>${esc(i.title)}</b><p>${esc(i.text)}</p><div class="meta"><span class="pill">${esc(i.task.preset)}</span><span class="pill accent">${esc(STAGE_LABEL[i.task.stage] || i.task.stage)}</span><a class="faint mono" style="font-size:11.5px" href="#/tasks/${encodeURIComponent(i.task.id)}">${esc(i.task.id)}</a></div></div><div class="go">${i.actions}</div></div>`).join('')
            : `<div class="empty-state" style="padding:32px"><div class="glyph">${icon('check')}</div><h3>You're clear</h3><p>No approvals, failures or ready subtasks right now.</p></div>`}
        </section>
        <section class="card"><div class="card-head"><h3>Delivery pipeline</h3><span class="count">${plural(tasks.length, 'task')}</span><div class="right"><a class="btn ghost sm" href="#/tasks?view=board">Board ${icon('chev')}</a></div></div>
          <div class="pipeline" style="grid-template-columns:repeat(${lanes.length},minmax(0,1fr))">${lanes.map(l => `<div><small>${l.label}</small><strong>${l.n}</strong><div class="bar"><i style="width:${tasks.length ? Math.round(l.n / tasks.length * 100) : 0}%;${l.id === 'ship' ? 'background:var(--ok)' : ''}"></i></div></div>`).join('')}</div>
        </section>
        ${upNext.length ? `<section class="card"><div class="card-head"><h3>Up next</h3></div>${upNext.map(t => `<div class="run-row" data-go="#/tasks/${encodeURIComponent(t.id)}" style="cursor:pointer"><span class="dot ${taskState(t).tone}"></span><div class="t"><b>${esc(t.title)}</b><small>${esc(t.next || '')}</small></div>${pill(STAGE_LABEL[t.stage] || t.stage, 'info')}</div>`).join('')}</section>` : ''}
      </div>
      <div class="stack">
        ${liveAgents.length ? `<section class="card"><div class="card-head"><h3>Agents working</h3><span class="count">${liveAgents.length}</span></div>${liveAgents.map(r => `<a class="run-row" href="#/runs/agent/${esc(r.id)}"><span class="spin"></span><div class="t"><b>${esc(r.providerName)} · ${esc(r.task)}</b><small>${r.subtask ? `subtask ${esc(r.subtask)} · ` : ''}started ${esc(timeAgo(r.startedAt))}</small></div>${pill('live', 'accent')}</a>`).join('')}</section>` : ''}
        <section class="card"><div class="card-head"><h3>Recent runs</h3><div class="right"><a class="btn ghost sm" href="#/runs">History ${icon('chev')}</a></div></div>
          ${runs.length ? runs.slice(0, 5).map((run, i) => { const [tone] = OUTCOME[run.outcome] || ['']; return `<a class="run-row" href="#/runs/flow/${i}"><span class="dot ${tone}"></span><div class="t"><b>${esc(run.flow)} flow · ${esc(run.task)}</b><small>${esc(run.outcome.replace(/-/g, ' '))} · ${esc(timeAgo(run.at))}</small></div></a>`; }).join('') : '<div class="empty">No flow has run yet. Open a task and run its ship flow.</div>'}
        </section>
        <section class="card"><div class="card-head"><h3>Activity</h3><span class="count">${esc(p.git?.branch || '')}</span></div><div class="feed">
          ${activity.length ? activity.map(a => `<div class="feed-item"><span class="dot ${a.tone}"></span><div><p>${a.html}</p>${a.at ? `<small>${esc(timeAgo(a.at))}</small>` : '<small>commit</small>'}</div></div>`).join('') : '<p class="muted" style="padding:10px 0">No activity yet.</p>'}
        </div></section>
      </div>
    </div>
  </div>`;
}

export const actions = {
  rerun: el => runFlowFor(el.dataset.task, el.dataset.flow),
  fix: el => fixWithAgent(el.dataset.task, el.dataset.flow),
  start: el => startAgent({ task: el.dataset.task, subtask: el.dataset.id, heading: `Start subtask ${el.dataset.id}` })
};
