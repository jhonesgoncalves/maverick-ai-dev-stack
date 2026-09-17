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
