import { $, api, copy, esc, icon, pill, plural, timeAgo, toast } from '../lib.js';
import { bus, store } from '../app.js';

// Loops: the harness-decided agent loops of every task. The list shows where each stands; a
// loop's page shows its ratchet (the measured state of every iteration against the checkpoint
// it had to beat), its budget burn, every decision with its evidence, the escalation and the
// ledger. Loops started in a terminal show up live; Stop works for them too.

const ui = { filter: 'all' };
let unsubscribe = null;
export const STATUS = { running: ['accent', 'Running'], done: ['ok', 'Done'], 'budget-exceeded': ['warn', 'Budget reached'], 'stalled-escalated': ['bad', 'Stalled'], disputed: ['warn', 'Disputed'], 'needs-human': ['warn', 'Needs you'], 'holdout-gap': ['bad', 'Holdout gap'], aborted: ['', 'Stopped'], 'integrity-violation': ['bad', 'Integrity violation'] };
export const HUMAN = ['stalled-escalated', 'disputed', 'needs-human', 'holdout-gap', 'integrity-violation'];
const DECISION = { accepted: ['ok', 'kept'], rejected: ['bad', 'rolled back'], aborted: ['warn', 'aborted'] };
const money = value => (typeof value === 'number' ? `$${value.toFixed(value < 1 ? 4 : 2)}` : '—');
const minutes = ms => `${Math.round((ms || 0) / 60000)} min`;
const tokens = value => { const n = Math.round(value || 0); return n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}k` : String(n); };
const pct = value => (value === null || value === undefined ? '—' : `${Math.round(value * 100)}%`);
const duration = ms => (ms == null ? '' : ms < 60000 ? `${Math.round(ms / 1000)}s` : `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`);

export async function loadLoops(force = false) { if (!store.loops || force) store.loops = (await api('/api/loops')).loops; return store.loops; }

export const title = ({ route }) => (route.id ? `Loop · ${route.id}` : 'Loops');
export const crumbs = ({ route }) => (route.id ? ['<a href="#/loops">Loops</a>', `<b>${esc(route.id)}</b>`] : ['<b>Loops</b>']);
export const loading = () => '<div class="page"><div class="skeleton" style="height:28px;width:200px;margin-bottom:24px"></div><div class="kpis">' + '<div class="card kpi"><div class="skeleton sk-line" style="width:60%"></div><div class="skeleton" style="height:26px;width:40%"></div></div>'.repeat(4) + '</div><div class="skeleton" style="height:260px"></div></div>';
export const followsLive = route => Boolean(route.id);
export function leave() { unsubscribe?.(); unsubscribe = null; }

const statusPill = status => { const [tone, label] = STATUS[status] || ['', status]; return pill(label, tone); };

function row(loop) {
  const [tone] = STATUS[loop.status] || [''];
  const score = loop.score ? `${loop.score.passed}/${loop.score.blocking} gates · ${plural(loop.score.failing, 'failing check')}` : 'not measured';
  return `<a class="run-row" href="#/loops/${encodeURIComponent(loop.task)}/${encodeURIComponent(loop.id)}">${loop.live ? '<span class="spin"></span>' : `<span class="dot ${tone}"></span>`}
    <div class="t"><b>${esc(loop.task)} <span class="faint mono" style="font-weight:400">${esc(loop.id)}</span></b><small>iteration ${loop.iteration}${loop.maxIterations ? `/${loop.maxIterations}` : ''} · ${loop.accepted} kept · ${esc(score)}${loop.score?.subtasksTotal ? ` · ${loop.score.subtasksDone}/${loop.score.subtasksTotal} subtasks` : ''}${loop.rung ? ` · ${esc(loop.rung)}` : ''}</small></div>
    <span class="muted mono" style="font-size:11.5px">${money(loop.spent?.costUsd)} · ${esc(timeAgo(loop.updatedAt))}</span>${statusPill(loop.status)}</a>`;
}

async function list() {
  const loops = await loadLoops(true);
  const groups = { all: loops, running: loops.filter(loop => loop.live), human: loops.filter(loop => HUMAN.includes(loop.status)), finished: loops.filter(loop => !loop.live && !HUMAN.includes(loop.status)) };
  const shown = groups[ui.filter] || loops;
  const head = `<div class="page-head"><div><h1>Loops</h1><p>Agent loops the harness decides: every iteration is checked, kept as a checkpoint or rolled back.</p></div>
    <div class="actions"><div class="seg" role="group" aria-label="Filter">${[['all', 'All'], ['running', 'Running'], ['human', 'Needs you'], ['finished', 'Finished']].map(([key, label]) => `<button class="${ui.filter === key ? 'on' : ''}" data-act="filter" data-filter="${key}">${label} <span class="faint">${groups[key].length}</span></button>`).join('')}</div></div></div>`;
  if (!loops.length) return `<div class="page">${head}<div class="card empty-state"><div class="glyph">${icon('loop')}</div><h3>No loop has run yet</h3><p>A loop builds a planned task subtask by subtask. Maverick runs the checks itself, keeps what makes nothing worse and rolls back the rest, within a budget you set.</p><button class="btn" data-act="copy" data-text="maverick loop run &lt;task&gt; --dry-run">${icon('copy')}maverick loop run &lt;task&gt; --dry-run</button></div></div>`;
  return `<div class="page">${head}<section class="card">${shown.map(row).join('') || '<div class="empty">No loop matches this filter.</div>'}</section></div>`;
}

/**
 * The ratchet as an inline chart: failing checks per iteration (lower is better). The step line is
 * the checkpoint each iteration had to beat; dots are what the harness measured.
 */
function ratchet(state) {
  const items = state.iterations, base = state.baseline?.failingCount ?? items[0]?.score?.failingCount ?? 0;
  const measured = items.map(item => item.score?.failingCount ?? null);
  const max = Math.max(1, base, ...measured.filter(value => value !== null));
  const width = 640, height = 200, left = 34, right = 14, top = 26, bottom = 28;
  const x = index => left + (items.length ? (index / items.length) * (width - left - right) : 0), y = value => top + (1 - value / max) * (height - top - bottom);
  let line = `M${x(0)},${y(base)}`, point = base;
  items.forEach((item, index) => { if (item.decision === 'accepted' && item.score) point = item.score.failingCount; line += ` H${x(index + 1)} V${y(point)}`; });
  const marks = items.map((item, index) => {
    const cx = x(index + 1), value = measured[index] ?? max, cy = y(value), tip = `#${item.n} ${item.subtask ? `subtask ${item.subtask.id}` : 'goal'} · ${item.provider} · ${(DECISION[item.decision] || [, item.decision])[1]}${measured[index] === null ? ' before the gates ran' : ` · ${value} failing`}${item.reasons?.[0] ? ` · ${item.reasons[0]}` : ''}`;
    const shape = item.decision === 'accepted' ? `<circle class="pt ok" cx="${cx}" cy="${cy}" r="4.5"/>` : item.decision === 'rejected' ? `<path class="pt bad" d="M${cx - 4},${cy - 4}L${cx + 4},${cy + 4}M${cx + 4},${cy - 4}L${cx - 4},${cy + 4}"/>` : `<circle class="pt warn" cx="${cx}" cy="${cy}" r="4" fill="none"/>`;
    const escalated = item.escalation ? `<path class="pt esc" d="M${cx},2 l5,6 -5,6 -5,-6z"/>` : '';
    return `<g><title>${esc(tip)}</title>${shape}${escalated}</g>`;
  }).join('');
  const ticks = [0, Math.round(max / 2), max].filter((value, index, all) => all.indexOf(value) === index).map(value => `<text x="${left - 8}" y="${y(value) + 4}" text-anchor="end">${value}</text><line class="grid" x1="${left}" x2="${width - right}" y1="${y(value)}" y2="${y(value)}"/>`).join('');
  const labels = items.length ? [0, ...items.map((_, index) => index + 1)].filter(index => items.length <= 12 || index % Math.ceil(items.length / 12) === 0).map(index => `<text x="${x(index)}" y="${height - 8}" text-anchor="middle">${index === 0 ? 'base' : `#${index}`}</text>`).join('') : '';
  const kept = items.filter(item => item.decision === 'accepted').length;
  return `<svg class="ratchet" viewBox="0 0 ${width} ${height}" role="img" aria-label="Failing checks per iteration: ${base} at the baseline, ${point} at the latest checkpoint; ${kept} of ${items.length} iterations kept">${ticks}${labels}<path class="line" d="${line}"/>${marks}</svg>
    <div class="legend"><span><i class="sw line"></i>checkpoint</span><span><i class="sw ok"></i>kept</span><span><i class="sw bad"></i>rolled back</span><span><i class="sw warn"></i>aborted</span><span><i class="sw esc"></i>escalated</span><span class="faint">failing checks, lower is better</span></div>`;
}

function burn(label, spent, limit, forecast, format) {
  if (!limit) return `<div class="burn"><div class="lbl"><span>${label}</span><span class="mono">${format(spent)} · no limit</span></div><div class="bar"><i style="width:0"></i></div></div>`;
  const pct = Math.min(100, (spent / limit) * 100), next = forecast != null ? Math.min(100, ((spent + forecast) / limit) * 100) : null;
  return `<div class="burn ${next !== null && next >= 100 ? 'over' : ''}"><div class="lbl"><span>${label}</span><span class="mono">${format(spent)} / ${format(limit)}</span></div><div class="bar"><i style="width:${pct}%"></i>${next !== null ? `<b style="left:${next}%" title="forecast after the next iteration: ${format(spent + forecast)}"></b>` : ''}</div></div>`;
}

function iteration(item, task) {
  const [tone, label] = DECISION[item.decision] || ['', item.decision];
  const blocks = item.findings.filter(finding => finding.severity === 'block').length, warns = item.findings.length - blocks;
  const file = item.agent?.transcript?.split('/').pop();
  const details = [
    item.reasons?.length && `<div><h6>Why it was ${item.decision === 'accepted' ? 'kept with notes' : 'rolled back'}</h6><ul>${item.reasons.map(reason => `<li>${esc(reason)}</li>`).join('')}</ul></div>`,
    item.findings?.length && `<div><h6>Integrity and guardrails</h6><ul>${item.findings.map(finding => `<li><span class="pill ${finding.severity === 'block' ? 'bad' : 'warn'}">${esc(finding.kind)}</span> ${finding.file ? `<code>${esc(finding.file)}</code> ` : ''}${esc(finding.message)}${finding.excerpt ? `<br><code class="faint">${esc(finding.excerpt)}</code>` : ''}</li>`).join('')}</ul></div>`,
    item.gates?.length && `<div><h6>Gates</h6><div class="chip-row">${item.gates.map(gate => pill(`${gate.id} ${gate.status}`, gate.status === 'pass' ? 'ok' : gate.status === 'fail' ? (gate.severity === 'warn' ? 'warn' : 'bad') : '')).join('')}</div></div>`,
    item.judge && `<div><h6>Judge</h6><p>${esc(item.judge.status)}${item.judge.summary ? ` · ${esc(item.judge.summary)}` : ''}</p>${item.judge.issues?.length ? `<ul>${item.judge.issues.map(issue => `<li>${esc(issue)}</li>`).join('')}</ul>` : ''}</div>`,
    item.agent?.disputes?.length && `<div><h6>Disputes</h6><ul>${item.agent.disputes.map(dispute => `<li><code>${esc(dispute.target)}</code>: ${esc(dispute.reason)}</li>`).join('')}</ul></div>`,
    item.agent && `<div><h6>The agent said</h6><p>${esc(item.agent.status)}${item.agent.summary ? ` · ${esc(item.agent.summary)}` : ''}</p><p class="faint">Its summary is advisory: the decision above comes from the harness.</p></div>`
  ].filter(Boolean).join('');
  return `<details class="iter"><summary>
      <span class="n mono">#${item.n}</span><span class="scope mono" title="${item.subtask ? `subtask ${esc(item.subtask.id)}: ${esc(item.subtask.title)}` : 'the goal'}">${item.subtask ? `${icon('tasks')}${esc(item.subtask.id)}` : 'goal'}</span>
      <span class="who">${esc(item.provider)}${item.effort ? ` <span class="faint">${esc(item.effort)}</span>` : ''}${item.rung ? ` ${pill(item.rung, 'accent')}` : ''}</span>
      ${pill(label, tone)}
      <span class="mono muted">${item.score ? `${item.score.passed}/${item.score.blocking} · ${item.score.failingCount} failing` : 'not measured'}</span>
      <span>${blocks ? pill(`${blocks} blocking`, 'bad') : ''}${warns ? pill(`${warns} warn`, 'warn') : ''}${item.judge ? pill(`judge ${item.judge.status}`, item.judge.status === 'pass' ? 'ok' : item.judge.status === 'fail' ? 'bad' : 'warn') : ''}${item.subtaskDone ? pill(`${item.subtaskDone} done`, 'ok') : ''}</span>
      <span class="mono muted">${money(item.costUsd)} · ${duration(item.durationMs)}</span>
      ${file ? `<a class="link" href="#/runs/transcript/${encodeURIComponent(task)}/${encodeURIComponent(file)}" title="Transcript">${icon('terminal')}</a>` : '<span></span>'}
    </summary><div class="iter-body">${details || '<p class="faint">No details recorded.</p>'}</div></details>`;
}

async function detail(task, id) {
  const data = await api(`/api/loop?task=${encodeURIComponent(task)}&id=${encodeURIComponent(id)}`), { state } = data;
  const score = state.checkpoint?.score, spent = state.spent, budgets = state.budgets, items = state.iterations;
  const kept = items.filter(item => item.decision === 'accepted').length, rolled = items.filter(item => item.decision === 'rejected').length;
  const commands = [`maverick loop status ${task}`, ...(HUMAN.includes(state.status) ? [`maverick loop run ${task} --resume --note "<your decision>"`] : state.status === 'budget-exceeded' ? [`maverick loop run ${task} --max-iterations ${(budgets.maxIterations || 10) + 5}`] : state.status === 'aborted' ? [`maverick loop run ${task}`] : []), `maverick loop verify ${task}`];
  const human = HUMAN.includes(state.status);
  const escalation = state.escalation || {};
  return `<div class="page wide" style="max-width:1400px">
    <div class="page-head"><div><div class="eyebrow">${esc(state.mode)} · flow ${esc(state.flow?.name)} · ${esc(id)}</div><h1>Loop · <a class="link" href="#/tasks/${encodeURIComponent(task)}">${esc(task)}</a></h1><p>${esc(state.reason || data.next)}</p></div>
      <div class="actions">${statusPill(state.status)}${data.live ? `<button class="btn sm bad" data-act="stop" data-task="${esc(task)}" data-id="${esc(id)}" ${data.stopPending ? 'disabled' : ''}>${icon('x')}${data.stopPending ? 'Stop requested' : 'Stop'}</button>` : ''}</div></div>
    ${human ? `<div class="banner ${state.status === 'integrity-violation' ? '' : 'warn'}">${icon('alert')}<div><b>${esc((STATUS[state.status] || [])[1] || state.status)}.</b> ${esc(data.next)}</div></div>` : ''}
    <div class="kpis">
      <div class="card kpi"><div class="label"><span class="dot accent"></span>Iterations</div><div class="value">${items.length}${budgets.maxIterations ? `<span class="faint" style="font-size:14px"> / ${budgets.maxIterations}</span>` : ''}</div><div class="sub">${kept} kept · ${rolled} rolled back</div></div>
      <div class="card kpi"><div class="label"><span class="dot ${score && score.passed === score.blocking ? 'ok' : 'warn'}"></span>Checkpoint #${state.checkpoint?.n ?? 0}</div><div class="value">${score ? `${score.passed}/${score.blocking}` : '—'}</div><div class="sub">gates pass · ${score ? plural(score.failingCount, 'failing check') : 'not measured'}</div></div>
      <div class="card kpi"><div class="label"><span class="dot info"></span>Spent</div><div class="value">${money(spent.costUsd)}</div><div class="sub">${minutes(spent.activeMs)}${spent.costUnknown ? ` · ${spent.costUnknown} run(s) without a cost` : ''}</div></div>
      <div class="card kpi"><div class="label"><span class="dot ok"></span>Subtasks</div><div class="value">${score?.subtasksTotal ? `${score.subtasksDone}/${score.subtasksTotal}` : '—'}</div><div class="sub">${score?.subtasksTotal ? 'done and checked' : 'goal mode'}</div></div>
    </div>
    <div class="grid-2">
      <div class="stack">
        <section class="card"><div class="card-head"><h3>Ratchet</h3><span class="count">a gate that passed never fails again</span></div><div class="card-body">${items.length ? ratchet(state) : '<p class="muted">The first iteration has not finished yet.</p>'}</div></section>
        <section class="card"><div class="card-head"><h3>Iterations</h3><span class="count">${items.length}</span></div>${items.length ? [...items].reverse().map(item => iteration(item, task)).join('') : '<div class="empty">No iteration yet.</div>'}</section>
      </div>
      <div class="stack">
        <section class="card"><div class="card-head"><h3>Budget</h3><span class="count">forecast ${esc(budgets.forecast || 'p90')}</span></div><div class="card-body">
          ${burn('Iterations', spent.iterations, budgets.maxIterations, items.length ? 1 : null, value => String(value))}
          ${burn('Time', Math.round(spent.activeMs / 60000), budgets.maxMinutes, data.forecast?.time != null ? data.forecast.time / 60000 : null, value => `${Math.round(value)} min`)}
          ${burn('Cost', spent.costUsd, budgets.maxCostUsd, data.forecast?.cost ?? null, money)}
          ${spent.tokens || budgets.maxTokens ? burn('Tokens', spent.tokens || 0, budgets.maxTokens, data.forecast?.tokens ?? null, tokens) : ''}
          ${spent.costEstimated ? `<p class="faint">${plural(spent.costEstimated, 'run')} priced from tokens (runtime.prices)</p>` : ''}
          ${data.forecast?.stop ? `<p class="warn-text">${esc(data.forecast.detail)}</p>` : ''}
        </div></section>
        ${escalation.rung || escalation.diagnosis || human ? `<section class="card"><div class="card-head"><h3>Escalation</h3>${escalation.rung ? pill(escalation.rung, 'accent') : ''}</div><div class="kv">
          ${escalation.diagnosis ? `<dt>Diagnosis</dt><dd>${esc(escalation.diagnosis)}</dd>` : ''}<dt>Agents tried</dt><dd>${esc((escalation.tried || []).join(', ') || '—')}</dd><dt>Ladder</dt><dd>${esc((state.settings?.escalation || []).join(' → '))}</dd>
        </div></section>` : ''}
        ${holdout(state, task)}
        ${state.checkpoint?.tainted || state.quarantine?.length ? `<section class="card"><div class="card-head"><h3>Integrity warnings kept</h3></div><div class="kv">
          ${state.checkpoint?.tainted ? `<dt>Tainted</dt><dd>since #${esc(state.checkpoint.tainted.since)} · ${esc(state.checkpoint.tainted.kinds.join(', '))}${state.checkpoint.tainted.acknowledged ? ` · acknowledged by ${esc(state.checkpoint.tainted.acknowledged.by)}` : ''}</dd>` : ''}
          ${state.quarantine?.length ? `<dt>Quarantined notes</dt><dd>${plural(state.quarantine.reduce((sum, item) => sum + (item.count ?? item.notes?.length ?? 0), 0), 'note')} from ${state.quarantine.map(item => `#${esc(item.n)}`).join(', ')}, kept from the next agent · <code>maverick loop release ${esc(task)}</code></dd>` : ''}
        </div></section>` : ''}
        <section class="card"><div class="card-head"><h3>Next commands</h3></div><div class="card-body cmds">${commands.map(command => `<button class="cmd" data-act="copy" data-text="${esc(command)}">${icon('copy')}<code>${esc(command)}</code></button>`).join('')}</div></section>
        <section class="card"><div class="card-head"><h3>Ledger</h3><div class="right"><button class="btn sm" data-act="verify" data-task="${esc(task)}" data-id="${esc(id)}">${icon('shield')}Verify again</button></div></div><div class="card-body" id="ledger-status"><span class="spin"></span> Checking the hash chain and checkpoints…</div></section>
        <section class="card"><div class="card-head"><h3>Guardrails</h3></div><div class="kv">
          <dt>Integrity</dt><dd>${esc(state.settings?.integrity || 'standard')}</dd><dt>Blast radius</dt><dd>${esc(state.settings?.blastRadius ? `${state.settings.blastRadius.maxFiles} files · ${state.settings.blastRadius.maxLines} lines per iteration` : '—')}</dd>
          <dt>Protected</dt><dd class="chip-row">${(state.settings?.protectedPaths || []).map(path => `<code class="pill">${esc(path)}</code>`).join('') || '—'}</dd><dt>Judge</dt><dd>${state.settings?.judge ? 'another model family accepts each subtask' : 'off'}</dd>
          <dt>Feedback</dt><dd>${esc(state.settings?.feedback || 'detailed')} <span class="faint">what the next agent learns from a rejection</span></dd>
          ${state.worktree ? `<dt>Branch</dt><dd class="mono">${esc(state.worktree.branch)}</dd>` : ''}<dt>Oracle</dt><dd class="mono faint">${esc(state.oracle?.digest?.slice(0, 16) || '—')}</dd>
        </div></section>
      </div>
    </div></div>`;
}

/** The holdout card: the seal, every query, and once the loop stopped the counts and the overfitting index. Never a test. */
function holdout(state, task) {
  const s = state.sealed;
  if (!s) return '';
  const final = state.status !== 'running' ? s.final : null;
  return `<section class="card"><div class="card-head"><h3>Holdout</h3><span class="count">sealed tests · feedback ${esc(s.feedback)}</span></div><div class="kv">
    <dt>Seal</dt><dd class="mono">${esc(s.sealId)} · ${esc(s.sealer?.human ? `${s.sealer.human} (human)` : `${s.sealer?.provider} (${s.sealer?.family})`)}</dd>
    <dt>Queries</dt><dd>${esc(s.queries)} / ${esc(s.maxQueries)} · threshold ${pct(s.threshold)}</dd>
    ${final ? `<dt>At done</dt><dd>${esc(final.passed)}/${esc(final.total)} sealed pass · criteria delivered ${pct(final.Sac)} · claimed ${pct(final.Vac)}</dd><dt>Overfitting index</dt><dd><b>${final.OI === null ? '—' : `${final.OI >= 0 ? '+' : ''}${esc(final.OI)} pp`}</b> <span class="faint">claimed minus delivered</span></dd>` : '<dt>Results</dt><dd class="faint">withheld while the loop runs</dd>'}
    <dt>Details</dt><dd><code>maverick seal status ${esc(task)} --reveal</code> <span class="faint">in your terminal</span></dd>
  </div></section>`;
}

export async function render({ route }) {
  if (route.id && route.tab) return detail(route.id, route.tab);
  return list();
}

async function verify(task, id) {
  const box = $('#ledger-status');
  if (!box) return;
  try {
    const result = await api(`/api/loop/ledger?task=${encodeURIComponent(task)}&id=${encodeURIComponent(id)}`);
    box.innerHTML = result.ok ? `<p class="ok-text">${icon('check')} ${result.entries} entries chained, ${result.checkpoints} checkpoint(s) match their refs.</p>${result.warnings.map(warning => `<p class="faint">${esc(warning)}</p>`).join('')}` : `<p class="bad-text">${icon('x')} The record fails verification:</p><ul>${result.problems.map(problem => `<li>${esc(problem)}</li>`).join('')}</ul>`;
  } catch (error) { box.innerHTML = `<p class="bad-text">${esc(error.message)}</p>`; }
}

export function after({ route, rerender }) {
  leave();
  if (route.id && route.tab) verify(route.id, route.tab);
  let timer = null;
  const mine = event => !route.id || (event.detail.task === route.id && event.detail.id === route.tab);
  const onLoop = event => { if (!mine(event)) return; clearTimeout(timer); timer = setTimeout(() => { if (!document.querySelector('.iter[open]')) rerender(); }, 250); };
  const onEnd = async event => { if (!mine(event)) return; await loadLoops(true).catch(() => {}); rerender(); };
  bus.addEventListener('loop', onLoop); bus.addEventListener('loop-end', onEnd);
  unsubscribe = () => { bus.removeEventListener('loop', onLoop); bus.removeEventListener('loop-end', onEnd); clearTimeout(timer); };
}

export const actions = {
  filter: (el, ctx) => { ui.filter = el.dataset.filter; ctx.rerender(); },
  copy: el => copy(el.dataset.text, 'Command copied'),
  verify: el => { $('#ledger-status').innerHTML = '<span class="spin"></span> Checking…'; verify(el.dataset.task, el.dataset.id); },
  stop: async el => {
    el.disabled = true; el.innerHTML = '<span class="spin"></span>Stopping…';
    try { await api('/api/loops/stop', { task: el.dataset.task, id: el.dataset.id }); toast('Stop requested: the agent run is aborted and its changes rolled back', 'warn'); } catch (error) { toast(error.message, 'bad'); el.disabled = false; el.innerHTML = `${icon('x')}Stop`; }
  }
};
