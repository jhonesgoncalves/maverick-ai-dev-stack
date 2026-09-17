const detailStyle = document.createElement('style');
detailStyle.textContent = `.metrics .card,.interactive-row,.table tbody tr{cursor:pointer}.metrics .card{transition:transform 180ms ease,border-color 180ms ease}.metrics .card:hover{transform:translateY(-2px);border-color:#ff6a00}.interactive-row:hover,.table tbody tr:hover{background:#1e1e1e}.table tbody tr{transition:background 160ms ease}.lens-overlay{position:fixed;inset:0;z-index:20;display:grid;place-items:center;padding:24px;background:#090909b8;backdrop-filter:blur(8px)}.lens-detail{width:min(760px,100%);max-height:calc(100vh - 48px);overflow:auto;padding:28px;border:1px solid #3d3d3d;border-radius:14px;background:#121212;box-shadow:0 24px 80px #000}.lens-detail header{display:flex;justify-content:space-between;gap:16px;align-items:start;margin-bottom:24px}.lens-detail h2{margin:8px 0 0;font-size:30px;letter-spacing:-.04em}.lens-detail h3{margin:0 0 9px;color:#ff6a00;font-size:11px;letter-spacing:.1em;text-transform:uppercase}.lens-detail section{padding:15px;border:1px solid #2a2a2a;border-radius:10px;background:#171717}.lens-detail p,.lens-detail ul{margin:0;color:#d0d0d0;line-height:1.55}.lens-detail ul{padding-left:18px}.detail-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}.lens-close{padding:8px 11px;border:1px solid #3d3d3d;border-radius:8px;background:#171717;color:#f5f5f5;cursor:pointer}.lens-close:hover{border-color:#ff6a00}@media(max-width:620px){.lens-overlay{padding:12px}.lens-detail{padding:20px}.detail-grid{grid-template-columns:1fr}.lens-detail h2{font-size:25px}}`;
document.head.append(detailStyle);

const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[char]));
const detailList = values => values?.length ? `<ul>${values.map(value => `<li>${escapeHtml(value)}</li>`).join('')}</ul>` : '<p>None recorded.</p>';

function openTaskDetail(task) {
  const overlay = document.createElement('div');
  overlay.className = 'lens-overlay';
  overlay.innerHTML = `<article class="lens-detail" role="dialog" aria-modal="true" aria-label="Task details"><header><div><span class="label">${escapeHtml(task.preset)} / task detail</span><h2>${escapeHtml(task.title || task.id)}</h2></div><button class="lens-close" aria-label="Close task details">Close</button></header><div class="detail-grid"><section><h3>Goal</h3><p>${escapeHtml(task.goal || 'Not recorded.')}</p></section><section><h3>Verification</h3><p>${escapeHtml(task.verification || 'Not recorded.')}</p></section><section><h3>In scope</h3><p>${escapeHtml(task.scope || 'Not recorded.')}</p></section><section><h3>Out of scope</h3><p>${escapeHtml(task.outOfScope || 'Not recorded.')}</p></section><section><h3>Artifacts</h3>${detailList(task.artifacts)}</section><section><h3>Reports</h3>${detailList(task.reports)}</section></div></article>`;
  const close = () => overlay.remove();
  overlay.addEventListener('click', event => { if (event.target === overlay || event.target.closest('.lens-close')) close(); });
  document.addEventListener('keydown', function closeOnEscape(event) { if (event.key === 'Escape') { close(); document.removeEventListener('keydown', closeOnEscape); } });
  document.body.append(overlay);
  overlay.querySelector('.lens-close').focus();
}

document.addEventListener('click', event => {
  const metric = event.target.closest('.metrics .card');
  if (metric) { const index = [...document.querySelectorAll('.metrics .card')].indexOf(metric); route = ['Tasks', 'Tasks', 'Tasks', 'Architecture'][index] || 'Overview'; render(); return; }
  const row = event.target.closest('.dashboard .row');
  if (row && d?.tasks) { const task = d.tasks.find(item => row.textContent.includes(item.id)); if (task) openTaskDetail(task); }
  const tableRow = event.target.closest('.table tbody tr');
  if (tableRow && d?.tasks) { const task = d.tasks.find(item => tableRow.textContent.includes(item.id)); if (task) openTaskDetail(task); }
  if (event.target.closest('.signal')) { route = 'Tasks'; render(); }
});

const explorerStyle = document.createElement('style');
explorerStyle.textContent = `.lens-launch{position:fixed;right:24px;bottom:24px;z-index:12;display:flex;align-items:center;gap:9px;padding:12px 15px;border:1px solid #914a18;border-radius:10px;background:#17110d;color:#fff;box-shadow:0 14px 45px #0009;font:600 12px Geist,system-ui;cursor:pointer}.lens-launch b{color:#ff6a00;font-family:ui-monospace,monospace}.lens-launch:hover{border-color:#ff6a00;transform:translateY(-1px)}.lens-explorer{width:min(1060px,100%);max-height:calc(100vh - 48px);overflow:auto;padding:28px;border:1px solid #3d3d3d;border-radius:14px;background:#101010;box-shadow:0 24px 80px #000}.lens-explorer header{display:flex;justify-content:space-between;align-items:start;gap:18px;margin-bottom:24px}.lens-explorer h2{margin:7px 0 0;font-size:30px;letter-spacing:-.05em}.explorer-grid{display:grid;grid-template-columns:1.15fr .85fr;gap:18px}.explorer-card{padding:18px;border:1px solid #2a2a2a;border-radius:11px;background:#151515}.explorer-card h3{margin:0 0 5px;font-size:15px}.explorer-card p{margin:0;color:#a3a3a3;font-size:12px;line-height:1.5}.map-canvas{position:relative;min-height:230px;margin-top:16px;border:1px solid #30271f;border-radius:9px;background:radial-gradient(circle at 60% 30%,#2d1b0f,transparent 45%),#0d0d0d;overflow:hidden}.map-node{position:absolute;z-index:1;padding:8px 10px;border:1px solid #4a321e;border-radius:7px;background:#1d1711;color:#f5f5f5;font:10px ui-monospace,monospace;box-shadow:0 7px 18px #0006}.map-node:nth-child(1){left:9%;top:20%}.map-node:nth-child(2){right:9%;top:16%}.map-node:nth-child(3){left:36%;bottom:16%}.map-node:nth-child(4){right:25%;bottom:19%}.map-lines{position:absolute;inset:0;width:100%;height:100%;stroke:#a84d13;stroke-width:1.5;stroke-dasharray:4 5;opacity:.9}.coupling{display:flex;justify-content:space-between;gap:12px;padding:11px 0;border-top:1px solid #292929;font-size:11px}.coupling:first-of-type{border-top:0}.coupling code{color:#e1b48f;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.improvement{margin-top:10px;padding:13px;border:1px solid #34281e;border-radius:9px;background:#181512}.improvement-head{display:flex;justify-content:space-between;gap:12px;align-items:start}.improvement h4{margin:0;font-size:12px}.improvement p{margin:5px 0 10px;color:#a3a3a3;font-size:11px;line-height:1.45}.create-flow{padding:7px 9px;border:1px solid #794017;border-radius:7px;background:#25170d;color:#ffb16c;font:600 10px ui-monospace,monospace;cursor:pointer}.create-flow:hover{border-color:#ff6a00;color:#fff}.markdown{color:#ddd;line-height:1.7}.markdown h1,.markdown h2,.markdown h3{color:#f5f5f5;letter-spacing:-.03em}.markdown h1{font-size:28px}.markdown h2{margin-top:28px;font-size:20px}.markdown h3{margin-top:22px;font-size:16px}.markdown p{margin:12px 0}.markdown ul,.markdown ol{padding-left:22px}.markdown code{padding:2px 5px;border-radius:4px;background:#252525;color:#ffb16c;font:12px ui-monospace,monospace}.markdown pre{overflow:auto;padding:15px;border:1px solid #302a25;border-radius:8px;background:#0b0b0b}.markdown pre code{padding:0;background:none;color:#ddd}.document-meta{margin-bottom:22px;color:#a3a3a3;font:11px ui-monospace,monospace}@media(max-width:760px){.lens-launch{right:12px;bottom:74px}.lens-explorer{padding:20px}.explorer-grid{grid-template-columns:1fr}.lens-explorer h2{font-size:25px}}`;
document.head.append(explorerStyle);

function markdown(source) {
  const escape = value => escapeHtml(value);
  const lines = String(source || '').replace(/\r/g, '').split('\n'); let html = '', inCode = false, code = [], list = false;
  const closeList = () => { if (list) { html += '</ul>'; list = false; } };
  for (const line of lines) {
    if (line.startsWith('```')) { closeList(); if (inCode) { html += `<pre><code>${escape(code.join('\n'))}</code></pre>`; code = []; } inCode = !inCode; continue; }
    if (inCode) { code.push(line); continue; }
    const heading = line.match(/^(#{1,3})\s+(.+)$/); if (heading) { closeList(); html += `<h${heading[1].length}>${escape(heading[2])}</h${heading[1].length}>`; continue; }
    const item = line.match(/^[-*]\s+(.+)$/); if (item) { if (!list) { html += '<ul>'; list = true; } html += `<li>${inlineMarkdown(item[1])}</li>`; continue; }
    closeList(); if (!line.trim()) continue; html += `<p>${inlineMarkdown(line)}</p>`;
  }
  closeList(); return html || '<p>No renderable Markdown content was found.</p>';
}
function inlineMarkdown(value) { return escapeHtml(value).replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>'); }
function openDocument(documentItem) {
  const overlay = document.createElement('div'); overlay.className = 'lens-overlay';
  overlay.innerHTML = `<article class="lens-detail" role="dialog" aria-modal="true" aria-label="Document preview"><header><div><span class="label">${escapeHtml(documentItem.type || 'document')} / local preview</span><h2>${escapeHtml(documentItem.title)}</h2></div><button class="lens-close" aria-label="Close document">Close</button></header><div class="document-meta">${escapeHtml(documentItem.path)}</div><section class="markdown">${markdown(documentItem.content)}</section></article>`;
  overlay.addEventListener('click', event => { if (event.target === overlay || event.target.closest('.lens-close')) overlay.remove(); }); document.body.append(overlay); overlay.querySelector('.lens-close').focus();
}
function openDevtools() {
  const modules = d?.modules || [], couplings = d?.couplings || [], improvements = d?.improvements || [];
  const names = modules.slice(0, 4).map(item => item.path.split('/').pop()).concat(['local index']).slice(0, 4);
  const overlay = document.createElement('div'); overlay.className = 'lens-overlay';
  overlay.innerHTML = `<article class="lens-explorer" role="dialog" aria-modal="true" aria-label="Maverick Devtools Hub"><header><div><span class="label">Maverick Lens / engineering intelligence</span><h2>Devtools Hub</h2><p class="muted">Maps, coupling signals and improvements generated from the local index.</p></div><button class="lens-close" aria-label="Close Devtools Hub">Close</button></header><div class="explorer-grid"><div class="explorer-card"><h3>Application map</h3><p>${modules.length} source modules · ${couplings.length} static local import relationships</p><div class="map-canvas"><svg class="map-lines" viewBox="0 0 600 230" preserveAspectRatio="none"><path d="M110 58 L465 58 L290 178 L435 170 M110 58 L290 178"/></svg>${names.map(name => `<span class="map-node">${escapeHtml(name)}</span>`).join('')}</div></div><div class="explorer-card"><h3>Suggested improvements</h3><p>Each action creates a local task using a spec-first workflow.</p>${improvements.length ? improvements.map(item => `<div class="improvement"><div class="improvement-head"><h4>${escapeHtml(item.title)}</h4><button class="create-flow" data-slug="${escapeHtml(item.id)}" data-preset="${escapeHtml(item.preset)}">Create spec + task</button></div><p>${escapeHtml(item.detail)}</p></div>`).join('') : '<div class="empty">No high-signal improvements found.</div>'}</div><div class="explorer-card"><h3>Coupling ledger</h3><p>Static relative imports discovered locally. Use this to identify areas to review together.</p>${couplings.length ? couplings.slice(0,8).map(link => `<div class="coupling"><code>${escapeHtml(link.from)}</code><span>→</span><code>${escapeHtml(link.to)}</code></div>`).join('') : '<div class="empty">No relative imports were detected.</div>'}</div><div class="explorer-card"><h3>Integrated tools</h3><p>Use the existing local CLI capabilities as an engineering workbench: map, impact, guard, verify, security, dependencies, readiness and handoff.</p><div class="workflow" style="margin-top:16px"><div class="bar"><span>Map</span><div class="track"><div class="fill" style="width:100%"></div></div><b>✓</b></div><div class="bar"><span>Review</span><div class="track"><div class="fill" style="width:100%"></div></div><b>✓</b></div><div class="bar"><span>Evidence</span><div class="track"><div class="fill alt" style="width:${d?.tasks?.length ? Math.round(d.tasks.filter(task => task.validation === 'evidence captured').length / d.tasks.length * 100) : 0}%"></div></div><b>${d?.tasks?.length || 0}</b></div></div></div></div></article>`;
  overlay.addEventListener('click', event => { if (event.target === overlay || event.target.closest('.lens-close')) overlay.remove(); }); document.body.append(overlay); overlay.querySelector('.lens-close').focus();
}
async function createFlow(button) {
  button.disabled = true; button.textContent = 'Creating…';
  const response = await fetch('/api/improvements', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ slug: button.dataset.slug, preset: button.dataset.preset }) }); const result = await response.json();
  if (!response.ok) { button.textContent = result.error || 'Could not create'; button.disabled = false; return; }
  button.textContent = `Created ${result.slug}`; setTimeout(() => location.reload(), 750);
}
const launcher = document.createElement('button'); launcher.className = 'lens-launch'; launcher.innerHTML = '<b>✦</b> Open Devtools Hub'; launcher.addEventListener('click', openDevtools); document.body.append(launcher);
document.addEventListener('click', event => {
  const createButton = event.target.closest('.create-flow'); if (createButton) { createFlow(createButton); return; }
  const candidate = event.target.closest('.table tbody tr,.panel .row'); if (!candidate || !d?.docs) return;
  const documentItem = d.docs.find(item => candidate.textContent.includes(item.path)); if (documentItem) openDocument(documentItem);
});
