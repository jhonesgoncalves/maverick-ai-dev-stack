// Maverick AI Lens · Devtools. A dependency-free client for /api/devtools: an application
// map, entry points, coupling, cycles, hotspots, impact, integrations, team knowledge,
// debt and findings, for any language the analyzers understand. Everything is local.
(() => {
  const VIEWS = [
    ['overview', 'Overview', '◎'], ['map', 'Map', '⌗'], ['routes', 'Entry points', '⇢'], ['coupling', 'Coupling', '⋈'], ['cycles', 'Cycles', '↻'], ['hotspots', 'Hotspots', '▲'],
    ['impact', 'Impact', '◉'], ['integrations', 'Integrations', '⇄'], ['team', 'Team', '☺'], ['debt', 'Debt', '✎'], ['findings', 'Findings', '!']
  ];
  const LANG = { TypeScript: '#3178c6', JavaScript: '#e8d44d', Python: '#4b8bbe', Go: '#00add8', Rust: '#dea584', Java: '#e76f00', Kotlin: '#a97bff', 'C#': '#68217a', 'F#': '#378bba', Ruby: '#cc342d', PHP: '#777bb3', Elixir: '#8e6bbf', Dart: '#00b4ab', Swift: '#f05138', 'C/C++': '#f34b7d' };
  const METHOD = { GET: 'get', POST: 'post', PUT: 'put', PATCH: 'put', DELETE: 'del', ANY: 'any', PAGE: 'page', EVENT: 'evt', CRON: 'job', TASK: 'job', WS: 'evt', RPC: 'rpc', QUERY: 'rpc', MUTATION: 'post', SUBSCRIPTION: 'evt', OPTIONS: 'any', HEAD: 'any' };
  const KIND_LABEL = { http: 'HTTP', page: 'Pages', graphql: 'GraphQL', rpc: 'gRPC', event: 'Events', job: 'Jobs', websocket: 'WebSocket' };
  const SEV = { high: 'High', medium: 'Medium', low: 'Low' };

  const S = {
    r: null, x: null, view: 'overview', error: null, loading: false, updated: 0,
    map: { level: 'components', color: 'instability', component: '', focus: null, selected: null, isolated: false, externals: true, tests: false, search: '', z: 1, tx: 40, ty: 30 },
    routes: { q: '', kind: '', method: '', framework: '', group: 'prefix', unguarded: false, selected: null },
    coupling: { sort: 'files', dir: -1, q: '' }, findings: { severity: '', category: '' }, impact: { files: [] }, ints: { q: '' }, debt: { tag: '' }, files: { q: '' }
  };
  let root = null, sse = null, inputTimer = null;
  // The Lens index (tasks, Git state) lives in the shell's global `d`.
  const lens = () => { try { return d; } catch { return null; } };

  // ------------------------------------------------------------------------ utilities
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const num = value => (value ?? 0).toLocaleString('en-US');
  const short = (id, parts = 2) => { const segments = String(id).split('/'); return segments.length > parts ? `…/${segments.slice(-parts).join('/')}` : id; };
  const base = id => String(id).split('/').pop();
  const pct = (value, total) => (total ? Math.round((value / total) * 100) : 0);
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const token = () => document.querySelector('meta[name="lens-token"]')?.content || '';
  const store = { get: (key, fallback) => { try { return window.localStorage.getItem(`lens.${key}`) ?? fallback; } catch { return fallback; } }, set: (key, value) => { try { window.localStorage.setItem(`lens.${key}`, value); } catch { /* storage unavailable */ } } };
  const mix = (a, b, t) => { const pa = a.match(/\w\w/g).map(x => parseInt(x, 16)), pb = b.match(/\w\w/g).map(x => parseInt(x, 16)); return `#${pa.map((v, i) => Math.round(v + (pb[i] - v) * t).toString(16).padStart(2, '0')).join('')}`; };
  const scale = (t, stops) => { t = clamp(Number(t) || 0, 0, 1); const step = 1 / (stops.length - 1), i = Math.min(stops.length - 2, Math.floor(t / step)); return mix(stops[i], stops[i + 1], (t - i * step) / step); };
  const instabilityColor = value => scale(value, ['#4aa3ff', '#9b8cff', '#ff6b00']);
  const distanceColor = value => (value === null || value === undefined ? '#555555' : scale(value, ['#38c172', '#f6ad55', '#ef5350']));
  const healthColor = score => (score >= 80 ? '#38c172' : score >= 60 ? '#f6ad55' : '#ef5350');
  const method = m => `<span class="dt-m dt-m-${METHOD[m] || 'any'}">${esc(m)}</span>`;
  const pathHtml = path => esc(path).replace(/(:\w+\??|\{[^}]*\}|\[[^\]]*\]|&lt;[^&]*&gt;|\*\w*)/g, '<i class="dt-param">$1</i>');
  const sev = s => `<span class="dt-sev dt-sev-${s}">${SEV[s] || s}</span>`;
  const bar = (value, max, color = 'var(--dt-accent)') => `<span class="dt-bar"><i style="width:${clamp(max ? (value / max) * 100 : 0, 0, 100)}%;background:${color}"></i></span>`;
  const fileLink = (file, line, label) => `<button class="dt-link" data-act="source" data-file="${esc(file)}" data-line="${line || ''}" title="${esc(file)}${line ? `:${line}` : ''}">${esc(label ?? `${short(file, 3)}${line ? `:${line}` : ''}`)}</button>`;
  const empty = (title, hint = '') => `<div class="dt-empty"><b>${esc(title)}</b>${hint ? `<p>${hint}</p>` : ''}</div>`;
  const card = (title, body, extra = '', sub = '') => `<section class="dt-card"><header><div><h3>${title}</h3>${sub ? `<p>${sub}</p>` : ''}</div>${extra}</header>${body}</section>`;
  const more = (view, label = 'Open') => `<button class="dt-more" data-act="go" data-view="${view}">${label} →</button>`;
  const slug = text => String(text).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60).replace(/-$/, '');
  function toast(text, kind = 'ok') { const el = document.createElement('div'); el.className = `dt-toast dt-toast-${kind}`; el.textContent = text; document.body.append(el); setTimeout(() => el.classList.add('out'), 2600); setTimeout(() => el.remove(), 3100); }
  async function copy(text, label = 'Copied') { try { await window.navigator.clipboard.writeText(text); toast(label); } catch { toast('Clipboard unavailable', 'warn'); } }
  function download(name, text, type = 'text/plain') { const url = window.URL.createObjectURL(new window.Blob([text], { type })); const a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(() => window.URL.revokeObjectURL(url), 1000); }

  // ------------------------------------------------------------------------ data
  function indexReport(r) {
    const files = new Map(r.files.map(file => [file.id, file])), out = new Map(), inc = new Map(), outStatic = new Map();
    for (const [from, to, dynamic] of r.edges) { (out.get(from) || out.set(from, []).get(from)).push(to); (inc.get(to) || inc.set(to, []).get(to)).push(from); if (!dynamic) (outStatic.get(from) || outStatic.set(from, []).get(from)).push(to); }
    const routesByFile = new Map();
    for (const route of r.routes.items) (routesByFile.get(route.file) || routesByFile.set(route.file, []).get(route.file)).push(route);
    const components = new Map(r.architecture.components.map(item => [item.id, item]));
    const externals = new Map([...r.integrations.integrations.map(item => [item.id, { ...item, kind: 'integration' }]), ...r.integrations.services.map(item => [item.id, { ...item, category: item.via === 'literal URL' ? 'host' : 'service', kind: 'service' }])]);
    const cycleFiles = new Set(r.graph.cycles.flatMap(cycle => cycle.members));
    return { files, out, inc, outStatic, routesByFile, components, externals, cycleFiles };
  }
  async function load(force = false) {
    S.loading = true; S.error = null; paintShell();
    try {
      const response = await fetch(`/api/devtools${force ? '?refresh=1' : ''}`);
      const report = await response.json();
      if (!response.ok) throw new Error(report.error || `HTTP ${response.status}`);
      S.r = report; S.x = indexReport(report); S.updated = Date.now();
    } catch (error) { S.error = error.message; }
    S.loading = false; paintShell();
  }

  // ------------------------------------------------------------------------ shell
  function readHash() {
    const [path, query = ''] = location.hash.replace(/^#/, '').split('?');
    const view = path.split('/')[1];
    if (VIEWS.some(([id]) => id === view)) S.view = view;
    const params = new window.URLSearchParams(query);
    if (params.get('file')) S.impact.files = params.get('file').split(',');
    if (params.get('component')) { S.map.component = params.get('component'); S.map.level = 'files'; }
  }
  function writeHash(params = '') { window.history.replaceState(null, '', `#devtools/${S.view}${params ? `?${params}` : ''}`); }
  function go(view, params) { S.view = view; writeHash(params); paintBody(); root.querySelectorAll('.dt-tab').forEach(tab => tab.classList.toggle('on', tab.dataset.view === view)); root.querySelector('.dt-body')?.scrollTo?.(0, 0); }

  function paintShell() {
    if (!root) return;
    const r = S.r;
    const counts = r ? { routes: r.routes.items.length, cycles: r.graph.cycles.length + r.architecture.cycles.length, integrations: r.integrations.integrations.length, findings: r.findings.length, hotspots: r.hotspots.length, debt: r.files.reduce((sum, file) => sum + file.debt.length, 0) } : {};
    const score = r?.health.score ?? 0;
    root.innerHTML = `<div class="dt">
      <header class="dt-head">
        <div class="dt-title"><span class="dt-eyebrow">Maverick AI / Lens / devtools</span><h1>${esc(r ? base(r.root) : 'Devtools')}</h1>
          <p>${r ? `${num(r.summary.sourceFiles)} source files · ${num(r.summary.loc)} lines · ${Object.keys(r.summary.languages).length} language${Object.keys(r.summary.languages).length === 1 ? '' : 's'} · analyzed in ${num(r.durationMs)} ms` : 'Architecture intelligence for any stack.'}</p></div>
        <div class="dt-head-side">
          ${r ? `<button class="dt-health" data-act="go" data-view="overview" style="--c:${healthColor(score)};--p:${score}" title="${esc(r.health.formula)}"><span class="dt-ring"><b>${score}</b></span><span><small>HEALTH</small><strong>${score >= 80 ? 'Healthy' : score >= 60 ? 'Watch' : 'At risk'}</strong></span></button>` : ''}
          <button class="dt-btn" data-act="palette" title="Search everything (⌘K or /)">⌕ Search <kbd>⌘K</kbd></button>
          <button class="dt-btn" data-act="refresh" title="Re-analyze the repository">${S.loading ? '<span class="dt-spin"></span> Analyzing' : '↻ Re-analyze'}</button>
        </div>
      </header>
      <nav class="dt-tabs" role="tablist">${VIEWS.map(([id, label, icon]) => `<button class="dt-tab ${S.view === id ? 'on' : ''}" data-act="go" data-view="${id}" role="tab"><span>${icon}</span>${label}${counts[id] ? `<em>${num(counts[id])}</em>` : ''}</button>`).join('')}</nav>
      <div class="dt-body">${S.error ? empty('The analysis failed', esc(S.error)) : !r ? loadingView() : ''}</div>
    </div>`;
    if (r && !S.error) paintBody();
  }
  const loadingView = () => `<div class="dt-loading"><span class="dt-spin big"></span><b>Mapping the repository…</b><p>Resolving imports, entry points, integrations and Git history. Nothing leaves this machine.</p><div class="dt-skel">${'<i></i>'.repeat(6)}</div></div>`;
  function paintBody() {
    const body = root?.querySelector('.dt-body');
    if (!body || !S.r) return;
    body.innerHTML = `<div class="dt-view dt-view-${S.view}">${VIEW_RENDER[S.view]()}</div>`;
    VIEW_AFTER[S.view]?.();
  }
  function paintSlot(name) { const slot = root?.querySelector(`[data-slot="${name}"]`); if (slot) slot.innerHTML = SLOTS[name](); }

  // ------------------------------------------------------------------------ overview
  function overview() {
    const r = S.r, h = r.health, langs = Object.entries(r.summary.languages), totalLoc = langs.reduce((sum, [, value]) => sum + value, 0) || 1;
    const kinds = Object.entries(r.routes.insights.byKind), top = r.findings.filter(item => item.severity !== 'low').slice(0, 6);
    const depended = [...r.files].filter(file => !file.test).sort((a, b) => b.fanIn - a.fanIn).slice(0, 6);
    const weeks = r.activity, maxWeek = Math.max(1, ...weeks.map(week => week.commits));
    const sevCount = level => r.findings.filter(item => item.severity === level).length;
    return `<div class="dt-grid dt-grid-over">
      ${card('Architecture health', `<div class="dt-healthbox"><div class="dt-gauge" style="--c:${healthColor(h.score)};--p:${h.score}"><b>${h.score}</b><small>/ 100</small></div>
        <div class="dt-deduct">${h.deductions.length ? h.deductions.map(item => `<div class="dt-deduct-row" title="${esc(item.why || '')}"><span class="dt-minus">−${item.points}</span><div><b>${esc(item.rule)}</b><small>${esc(item.detail)}</small></div></div>`).join('') : '<div class="dt-ok">✓ No cycles, hubs or boundary violations. Keep it that way.</div>'}
        <p class="dt-formula"><code>${esc(h.formula)}</code><br>Deductions scale with the share of source files affected, so the score means the same in a 50-file service and a 5,000-file monolith.</p></div></div>`, more('findings', 'Findings'), 'Size-normalised: every point traces to files.')}
      ${card('At a glance', `<div class="dt-kpis">${[['Source files', num(r.summary.sourceFiles), `${num(r.summary.testFiles)} tests`], ['Components', num(r.summary.components), r.architecture.inferred ? 'inferred from layout' : 'from configuration'], ['Entry points', num(r.summary.routes), kinds.map(([kind, value]) => `${value} ${KIND_LABEL[kind] || kind}`).slice(0, 2).join(' · ') || 'none found'], ['Integrations', num(r.summary.integrations), `${r.integrations.variables.length} env vars read`], ['Import edges', num(r.summary.edges), `${r.graph.cycles.length} cycle${r.graph.cycles.length === 1 ? '' : 's'}`], ['Commits (12 mo)', num(r.summary.commits), `${r.summary.contributors} contributor${r.summary.contributors === 1 ? '' : 's'}`]].map(([label, value, sub]) => `<div class="dt-kpi"><small>${label}</small><b>${value}</b><span>${esc(sub)}</span></div>`).join('')}</div>
        <div class="dt-langbar">${langs.map(([name, value]) => `<i style="width:${(value / totalLoc) * 100}%;background:${LANG[name] || '#777'}" title="${esc(name)} ${pct(value, totalLoc)}%"></i>`).join('')}</div>
        <div class="dt-legend">${langs.slice(0, 6).map(([name, value]) => `<span><i style="background:${LANG[name] || '#777'}"></i>${esc(name)} <em>${pct(value, totalLoc)}%</em></span>`).join('')}</div>`)}
      ${card('Needs attention', top.length ? top.map(item => `<button class="dt-finding-mini" data-act="finding" data-id="${esc(item.id)}">${sev(item.severity)}<b>${esc(item.title)}</b><small>${esc(item.detail).slice(0, 140)}</small></button>`).join('') : '<div class="dt-ok">✓ Nothing high or medium severity. Look at the low ones in Findings.</div>', more('findings', `All ${r.findings.length}`), `${sevCount('high')} high · ${sevCount('medium')} medium · ${sevCount('low')} low`)}
      ${card('Entry points', kinds.length ? `<div class="dt-kinds">${kinds.map(([kind, value]) => `<button class="dt-kind" data-act="route-kind" data-kind="${kind}"><b>${num(value)}</b><span>${KIND_LABEL[kind] || kind}</span></button>`).join('')}</div><div class="dt-chips">${Object.entries(r.routes.insights.byFramework).slice(0, 10).map(([name, value]) => `<span class="dt-chip">${esc(name)} <em>${value}</em></span>`).join('')}</div>` : empty('No entry points detected', 'Routes come from decorators, router calls, file-system routing and OpenAPI, GraphQL or protobuf contracts.'), more('routes'))}
      ${card('Most depended on', depended.filter(file => file.fanIn).map(file => `<div class="dt-rank">${fileLink(file.id)}<span>${bar(file.fanIn, depended[0].fanIn || 1)}<em>${file.fanIn}</em></span></div>`).join('') || empty('No local imports resolved'), more('coupling'), 'Change these with the most care.')}
      ${card('Hotspots', r.hotspots.slice(0, 6).map(item => `<div class="dt-rank">${fileLink(item.id)}<span>${bar(item.score, r.hotspots[0].score, '#ff8a1a')}<em>${item.commits}×</em></span></div>`).join('') || empty('No Git history', 'Hotspots need commits: change frequency × dependents × size.'), more('hotspots'), 'Where change, size and coupling meet.')}
      ${card('Activity', weeks.some(week => week.commits) ? `<div class="dt-spark">${weeks.map(week => `<i style="height:${Math.max(3, (week.commits / maxWeek) * 100)}%" title="Week of ${week.week}: ${week.commits} commits"></i>`).join('')}</div><div class="dt-spark-axis"><span>${weeks[0].week}</span><span>this week</span></div>` : empty('No commits in the last 26 weeks'), more('team'), 'Commits per week, last 26 weeks.')}
      ${card('Components', `<table class="dt-table dt-compact"><thead><tr><th>Component</th><th>Files</th><th>I</th><th>D</th></tr></thead><tbody>${r.architecture.components.slice(0, 7).map(item => `<tr data-act="map-select" data-id="${esc(item.id)}"><td title="${esc(item.id)}">${esc(short(item.id, 3))}</td><td>${item.files}</td><td>${bar(item.instability, 1, instabilityColor(item.instability))}<em>${item.instability}</em></td><td>${item.distance ?? '—'}</td></tr>`).join('')}</tbody></table>`, more('map', 'Map'), 'I = instability, D = distance from the main sequence.')}
    </div>`;
  }

  // ------------------------------------------------------------------------ map
  const NODE_W = 212, NODE_H = 54, COL_GAP = 120, ROW_GAP = 16, ROWS = 12;
  function componentModel() {
    const r = S.r, x = S.x, nodes = new Map(), edges = [];
    const entry = new Map();
    for (const route of r.routes.items) if (route.source !== 'contract' && route.component) { const item = entry.get(route.component) || { total: 0, http: 0 }; item.total++; if (route.kind === 'http' || route.kind === 'page') item.http++; entry.set(route.component, item); }
    if ([...entry.values()].some(item => item.http)) nodes.set('@clients', { id: '@clients', kind: 'clients', name: 'Clients', sub: 'HTTP & page traffic' });
    for (const item of r.architecture.components) if (item.files || S.map.tests) nodes.set(item.id, { id: item.id, kind: 'component', name: short(item.id, 2), sub: `${item.files} files · I ${item.instability}${item.distance !== null ? ` · D ${item.distance}` : ''}`, data: item, entries: entry.get(item.id)?.total || 0 });
    for (const link of r.architecture.links) if (nodes.has(link.from) && nodes.has(link.to)) edges.push({ from: link.from, to: link.to, weight: link.weight, kind: 'imports' });
    for (const [id, item] of entry) if (item.http && nodes.has(id)) edges.push({ from: '@clients', to: id, weight: item.http, kind: 'request' });
    if (S.map.externals) {
      for (const ext of [...x.externals.values()].filter(item => item.files?.length).slice(0, 18)) {
        const users = new Map();
        for (const file of ext.files) { const component = x.files.get(file)?.component; if (component && nodes.has(component)) users.set(component, (users.get(component) || 0) + 1); }
        if (!users.size) continue;
        nodes.set(`ext:${ext.id}`, { id: `ext:${ext.id}`, kind: 'external', name: ext.name, sub: `${ext.category} · ${ext.files.length} file${ext.files.length === 1 ? '' : 's'}`, data: ext });
        for (const [component, weight] of users) edges.push({ from: component, to: `ext:${ext.id}`, weight, kind: 'uses' });
      }
    }
    return { nodes, edges };
  }
  function fileModel(componentId) {
    const r = S.r, x = S.x, nodes = new Map(), edges = [], inside = r.files.filter(file => file.component === componentId && (S.map.tests || !file.test));
    const ids = new Set(inside.map(file => file.id));
    const hasRoutes = inside.some(file => (x.routesByFile.get(file.id) || []).some(route => route.kind === 'http' || route.kind === 'page'));
    if (hasRoutes) nodes.set('@clients', { id: '@clients', kind: 'clients', name: 'Clients', sub: 'HTTP & page traffic' });
    for (const file of inside) nodes.set(file.id, { id: file.id, kind: 'file', name: base(file.id), sub: `${file.loc} loc · in ${file.fanIn} · out ${file.fanOut}`, data: file, entries: (x.routesByFile.get(file.id) || []).length });
    const neighbour = (id, weight, forward, from) => {
      const component = x.files.get(id)?.component;
      if (!component || component === componentId) return;
      const key = `c:${component}`;
      if (!nodes.has(key)) nodes.set(key, { id: key, kind: 'component', name: short(component, 2), sub: 'neighbour component', data: x.components.get(component), ghost: true });
      edges.push(forward ? { from, to: key, weight, kind: 'imports' } : { from: key, to: from, weight, kind: 'imports' });
    };
    for (const file of inside) {
      const outCounts = new Map(), inCounts = new Map();
      for (const to of x.out.get(file.id) || []) { if (ids.has(to)) edges.push({ from: file.id, to, weight: 1, kind: 'imports' }); else { const c = x.files.get(to)?.component; if (c) outCounts.set(to, c); } }
      const groupedOut = new Map(); for (const [, c] of outCounts) groupedOut.set(c, (groupedOut.get(c) || 0) + 1);
      for (const [c, weight] of groupedOut) neighbour([...outCounts].find(([, other]) => other === c)[0], weight, true, file.id);
      for (const from of x.inc.get(file.id) || []) if (!ids.has(from)) { const c = x.files.get(from)?.component; if (c) inCounts.set(c, (inCounts.get(c) || 0) + 1); }
      for (const [c, weight] of inCounts) neighbour(r.files.find(item => item.component === c)?.id, weight, false, file.id);
      if (hasRoutes && (x.routesByFile.get(file.id) || []).some(route => route.kind === 'http' || route.kind === 'page')) edges.push({ from: '@clients', to: file.id, weight: (x.routesByFile.get(file.id) || []).length, kind: 'request' });
      if (S.map.externals) for (const ext of file.integrations) { const item = x.externals.get(ext); if (!item) continue; const key = `ext:${ext}`; if (!nodes.has(key)) nodes.set(key, { id: key, kind: 'external', name: item.name, sub: item.category, data: item }); edges.push({ from: file.id, to: key, weight: 1, kind: 'uses' }); }
    }
    return { nodes, edges };
  }
  function mapModel() {
    const model = S.map.level === 'files' && S.map.component ? fileModel(S.map.component) : componentModel();
    const degree = new Map();
    for (const edge of model.edges) { degree.set(edge.from, (degree.get(edge.from) || 0) + 1); degree.set(edge.to, (degree.get(edge.to) || 0) + 1); }
    if (!S.map.isolated) for (const id of [...model.nodes.keys()]) if (!degree.get(id)) model.nodes.delete(id);
    if (S.map.focus && model.nodes.has(S.map.focus)) {
      const keep = pathOf(model, S.map.focus);
      for (const id of [...model.nodes.keys()]) if (!keep.has(id)) model.nodes.delete(id);
    }
    model.edges = model.edges.filter(edge => model.nodes.has(edge.from) && model.nodes.has(edge.to));
    return model;
  }
  /** Everything upstream and downstream of `id`. */
  function pathOf(model, id) {
    const forward = new Map(), backward = new Map(), seen = new Set([id]);
    for (const edge of model.edges) { (forward.get(edge.from) || forward.set(edge.from, []).get(edge.from)).push(edge.to); (backward.get(edge.to) || backward.set(edge.to, []).get(edge.to)).push(edge.from); }
    for (const graph of [forward, backward]) { const queue = [id]; const local = new Set([id]); while (queue.length) { const current = queue.shift(); for (const next of graph.get(current) || []) if (!local.has(next)) { local.add(next); seen.add(next); queue.push(next); } } }
    return seen;
  }
  function layout(model) {
    const preds = new Map(), succs = new Map();
    for (const edge of model.edges) { (preds.get(edge.to) || preds.set(edge.to, []).get(edge.to)).push(edge.from); (succs.get(edge.from) || succs.set(edge.from, []).get(edge.from)).push(edge.to); }
    const column = new Map(), visiting = new Set();
    const rank = id => {
      if (column.has(id)) return column.get(id);
      const node = model.nodes.get(id);
      if (node.kind === 'clients') { column.set(id, 0); return 0; }
      if (visiting.has(id)) return 1;
      visiting.add(id);
      let best = node.entries ? 1 : 1;
      for (const from of preds.get(id) || []) { const other = model.nodes.get(from); if (!other || other.kind === 'external') continue; best = Math.max(best, rank(from) + 1); }
      visiting.delete(id);
      const value = Math.min(best, 9);
      column.set(id, value); return value;
    };
    for (const [id, node] of model.nodes) if (node.kind !== 'external') rank(id);
    const last = Math.max(1, ...column.values()) + 1;
    for (const [id, node] of model.nodes) if (node.kind === 'external') column.set(id, last);
    const columns = [];
    for (const [id, col] of column) (columns[col] ||= []).push(id);
    const cols = columns.filter(Boolean);
    const weightOf = id => (model.nodes.get(id)?.data?.files ?? model.nodes.get(id)?.data?.loc ?? 0);
    cols.forEach(list => list.sort((a, b) => weightOf(b) - weightOf(a) || a.localeCompare(b)));
    const row = new Map(); const setRows = () => cols.forEach(list => list.forEach((id, index) => row.set(id, index)));
    setRows();
    for (let sweep = 0; sweep < 3; sweep++) {
      for (let c = 1; c < cols.length; c++) { cols[c].sort((a, b) => bary(a, preds) - bary(b, preds)); setRows(); }
      for (let c = cols.length - 2; c >= 0; c--) { cols[c].sort((a, b) => bary(a, succs) - bary(b, succs)); setRows(); }
    }
    function bary(id, neighbours) { const list = (neighbours.get(id) || []).filter(other => row.has(other)); return list.length ? list.reduce((sum, other) => sum + row.get(other), 0) / list.length : row.get(id); }
    const pos = new Map();
    let x = 0, height = 0;
    for (const list of cols) {
      const sub = Math.ceil(list.length / ROWS);
      list.forEach((id, index) => { const s = Math.floor(index / ROWS), r = index % ROWS; pos.set(id, { x: x + s * (NODE_W + 28), y: r * (NODE_H + ROW_GAP) }); height = Math.max(height, (r + 1) * (NODE_H + ROW_GAP)); });
      x += sub * (NODE_W + 28) - 28 + COL_GAP;
    }
    return { pos, width: Math.max(0, x - COL_GAP), height };
  }
  function nodeColor(node) {
    const c = S.map.color, data = node.data || {};
    if (node.kind === 'clients') return '#ff6b00';
    if (node.kind === 'external') return '#b69cff';
    if (c === 'language') { const langs = node.kind === 'file' ? { [data.language]: 1 } : data.languages || {}; const top = Object.entries(langs).sort((a, b) => b[1] - a[1])[0]?.[0]; return LANG[top] || '#777'; }
    if (c === 'distance') return distanceColor(data.distance);
    if (c === 'churn') { const max = Math.max(1, ...S.r.files.map(file => file.commits)); const commits = node.kind === 'file' ? data.commits : S.r.files.filter(file => file.component === data.id).reduce((sum, file) => sum + file.commits, 0); return scale(Math.sqrt(commits / (node.kind === 'file' ? max : Math.max(1, S.r.summary.commits))), ['#2d3b2d', '#f6ad55', '#ef5350']); }
    if (c === 'complexity') { const value = node.kind === 'file' ? data.complexity / 120 : (data.complexity || 0) / Math.max(1, data.loc || 1) * 6; return scale(value, ['#38c172', '#f6ad55', '#ef5350']); }
    return instabilityColor(data.instability ?? 0);
  }
  function mapView() {
    const r = S.r, m = S.map;
    const components = r.architecture.components.filter(item => item.files);
    return `<div class="dt-map-wrap">
      <div class="dt-toolbar">
        <div class="dt-seg">${[['components', 'Components'], ['files', 'Files']].map(([id, label]) => `<button class="${m.level === id ? 'on' : ''}" data-act="map-level" data-level="${id}">${label}</button>`).join('')}</div>
        ${m.level === 'files' ? `<select class="dt-select" data-model="map.component"><option value="">Choose a component…</option>${components.map(item => `<option value="${esc(item.id)}" ${item.id === m.component ? 'selected' : ''}>${esc(item.id)} (${item.files})</option>`).join('')}</select>` : ''}
        <label class="dt-field">Color <select class="dt-select" data-model="map.color">${[['instability', 'Instability'], ['distance', 'Main-sequence distance'], ['language', 'Language'], ['churn', 'Churn'], ['complexity', 'Complexity']].map(([id, label]) => `<option value="${id}" ${m.color === id ? 'selected' : ''}>${label}</option>`).join('')}</select></label>
        <label class="dt-check"><input type="checkbox" data-model="map.externals" ${m.externals ? 'checked' : ''}> Integrations</label>
        <label class="dt-check"><input type="checkbox" data-model="map.isolated" ${m.isolated ? 'checked' : ''}> Unlinked</label>
        <label class="dt-check"><input type="checkbox" data-model="map.tests" ${m.tests ? 'checked' : ''}> Tests</label>
        <input class="dt-input dt-map-search" placeholder="Highlight…" value="${esc(m.search)}" data-model="map.search">
        <span class="dt-grow"></span>
        ${m.focus ? `<button class="dt-btn warm" data-act="map-unfocus">✕ Focus: ${esc(short(m.focus.replace(/^c:|^ext:/, ''), 2))}</button>` : ''}
        <button class="dt-btn" data-act="map-fit" title="Fit to screen">⤢ Fit</button>
        <button class="dt-btn" data-act="map-svg" title="Download SVG">⇩ SVG</button>
      </div>
      <div class="dt-map-main"><div class="dt-canvas" tabindex="0"></div><aside class="dt-inspector"></aside></div>
      <div class="dt-map-legend"><span><i class="l-req"></i>request</span><span><i class="l-imp"></i>imports</span><span><i class="l-cyc"></i>cyclic</span><span><i class="l-use"></i>uses integration</span><span class="dt-hint">Click to trace a path · double-click a component to open its files · drag to pan · ⌘/Ctrl + wheel or pinch to zoom</span></div>
    </div>`;
  }
  let mapState = null;
  function drawMap(fit = false) {
    const canvas = root.querySelector('.dt-canvas');
    if (!canvas) return;
    const m = S.map;
    if (m.level === 'files' && !m.component) { canvas.innerHTML = empty('Choose a component', 'The file map shows one component at a time, with its neighbours collapsed. Pick one above or double-click a component on the component map.'); paintInspector(); return; }
    const model = mapModel(), { pos, width, height } = layout(model);
    if (!model.nodes.size) { canvas.innerHTML = empty('Nothing to draw', 'No resolved imports between these nodes. Enable “Unlinked” to show isolated nodes.'); paintInspector(); return; }
    const cyclic = new Set();
    const pairs = new Set(model.edges.filter(edge => edge.kind === 'imports').map(edge => `${edge.from}\0${edge.to}`));
    for (const edge of model.edges) if (pairs.has(`${edge.to}\0${edge.from}`)) cyclic.add(`${edge.from}\0${edge.to}`);
    for (const cycle of S.r.architecture.cycles) for (let i = 0; i < cycle.loop.length - 1; i++) cyclic.add(`${cycle.loop[i]}\0${cycle.loop[i + 1]}`);
    if (m.level === 'files') for (const cycle of S.r.graph.cycles) for (let i = 0; i < cycle.loop.length - 1; i++) cyclic.add(`${cycle.loop[i]}\0${cycle.loop[i + 1]}`);
    const edgeSvg = model.edges.map((edge, index) => {
      const a = pos.get(edge.from), b = pos.get(edge.to);
      if (!a || !b) return '';
      const x1 = a.x + NODE_W, y1 = a.y + NODE_H / 2, x2 = b.x, y2 = b.y + NODE_H / 2, back = x2 <= x1;
      const d = back ? `M${x1} ${y1} C${x1 + 70} ${y1 + 90}, ${x2 - 70} ${y2 + 90}, ${x2} ${y2}` : `M${x1} ${y1} C${x1 + (x2 - x1) / 2} ${y1}, ${x1 + (x2 - x1) / 2} ${y2}, ${x2} ${y2}`;
      const cls = edge.kind === 'request' ? 'e-req' : edge.kind === 'uses' ? 'e-use' : cyclic.has(`${edge.from}\0${edge.to}`) ? 'e-cyc' : 'e-imp';
      const width = clamp(1 + Math.log2(1 + edge.weight) * 0.9, 1, 6);
      return `<path class="dt-edge ${cls}" data-i="${index}" data-from="${esc(edge.from)}" data-to="${esc(edge.to)}" d="${d}" stroke-width="${width.toFixed(1)}" marker-end="url(#dt-arrow-${cls})"><title>${esc(edge.from)} → ${esc(edge.to)} · ${edge.weight} ${edge.kind === 'request' ? 'entry point(s)' : edge.kind === 'uses' ? 'file(s)' : 'import(s)'}</title></path>`;
    }).join('');
    const nodeSvg = [...model.nodes.values()].map(node => {
      const p = pos.get(node.id); if (!p) return '';
      const color = nodeColor(node), label = node.name.length > 26 ? `${node.name.slice(0, 25)}…` : node.name;
      const badge = node.entries ? `<g class="dt-badge"><rect x="${NODE_W - 44}" y="8" width="36" height="16" rx="8"/><text x="${NODE_W - 26}" y="19.5">⇢${node.entries}</text></g>` : '';
      return `<g class="dt-node k-${node.kind}${node.ghost ? ' ghost' : ''}" data-id="${esc(node.id)}" transform="translate(${p.x},${p.y})"><rect class="dt-node-bg" width="${NODE_W}" height="${NODE_H}" rx="9"/><rect class="dt-node-bar" width="5" height="${NODE_H - 16}" x="8" y="8" rx="2.5" fill="${color}"/><text class="dt-node-title" x="22" y="23">${esc(label)}</text><text class="dt-node-sub" x="22" y="40">${esc(node.sub || '')}</text>${badge}<title>${esc(node.id.replace(/^c:|^ext:/, ''))}</title></g>`;
    }).join('');
    const markers = ['e-req', 'e-imp', 'e-cyc', 'e-use'].map(cls => `<marker id="dt-arrow-${cls}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path class="m-${cls}" d="M0 0 L10 5 L0 10 z"/></marker>`).join('');
    canvas.innerHTML = `<svg class="dt-svg" xmlns="http://www.w3.org/2000/svg"><defs>${markers}</defs><g class="dt-viewport"><g class="dt-edges">${edgeSvg}</g><g class="dt-nodes">${nodeSvg}</g></g></svg>`;
    mapState = { model, pos, width, height };
    if (fit || !mapState.fitted) fitMap();
    applyTransform(); paintSelection(); paintInspector();
  }
  function fitMap() {
    const canvas = root.querySelector('.dt-canvas'); if (!canvas || !mapState) return;
    const { width, height } = mapState, box = canvas.getBoundingClientRect();
    // Readable first: never shrink below 0.55; a wide map starts at the entry side and pans.
    const z = clamp(Math.min((box.width - 60) / Math.max(1, width), (box.height - 60) / Math.max(1, height + 90)), 0.55, 1.15);
    Object.assign(S.map, { z, tx: width * z < box.width - 40 ? (box.width - width * z) / 2 : 28, ty: Math.max(24, (box.height - height * z) / 2 - 20) });
    mapState.fitted = true; applyTransform();
  }
  function applyTransform() { root.querySelector('.dt-viewport')?.setAttribute('transform', `translate(${S.map.tx.toFixed(1)},${S.map.ty.toFixed(1)}) scale(${S.map.z.toFixed(3)})`); }
  function paintSelection() {
    if (!mapState) return;
    const svg = root.querySelector('.dt-svg'); if (!svg) return;
    const selected = S.map.selected && mapState.model.nodes.has(S.map.selected) ? S.map.selected : null;
    const lit = selected ? pathOf(mapState.model, selected) : null, q = S.map.search.trim().toLowerCase();
    svg.classList.toggle('has-sel', Boolean(lit)); svg.classList.toggle('has-q', Boolean(q));
    svg.querySelectorAll('.dt-node').forEach(node => { const id = node.dataset.id; node.classList.toggle('lit', Boolean(lit?.has(id))); node.classList.toggle('sel', id === selected); node.classList.toggle('match', Boolean(q) && id.toLowerCase().includes(q)); });
    svg.querySelectorAll('.dt-edge').forEach(edge => edge.classList.toggle('lit', Boolean(lit?.has(edge.dataset.from) && lit?.has(edge.dataset.to))));
  }
  function paintInspector() {
    const panel = root.querySelector('.dt-inspector'); if (!panel) return;
    const id = S.map.selected, node = id && mapState?.model.nodes.get(id);
    panel.innerHTML = node ? inspectorFor(node) : `<div class="dt-insp-empty"><span class="dt-eyebrow">Inspector</span><h3>${S.map.level === 'files' && S.map.component ? esc(S.map.component) : 'Application map'}</h3><p>${S.map.level === 'files' ? 'Files of one component, with neighbour components collapsed and the integrations they reach.' : 'Clients on the left, then components by dependency depth, then the integrations they use. Edges are resolved static imports.'}</p><p class="dt-muted">Select any node to see its metrics, what it depends on, who depends on it, its entry points and integrations.</p>${S.map.level === 'files' && S.map.component ? `<button class="dt-btn" data-act="map-level" data-level="components">← Back to components</button>` : ''}</div>`;
  }
  function inspectorFor(node) {
    const r = S.r, x = S.x;
    const actions = extra => `<div class="dt-insp-actions">${extra}<button class="dt-btn" data-act="map-focus" data-id="${esc(node.id)}">◎ Focus path</button></div>`;
    if (node.kind === 'clients') return `<span class="dt-eyebrow">Entry</span><h3>Clients</h3><p>External callers reach the application through ${num(r.routes.items.filter(route => route.kind === 'http' || route.kind === 'page').length)} HTTP routes and pages.</p>${actions(`<button class="dt-btn" data-act="go" data-view="routes">Entry points →</button>`)}`;
    if (node.kind === 'external') { const ext = node.data, byComponent = new Map(); for (const file of ext.files || []) { const c = x.files.get(file)?.component || '—'; byComponent.set(c, [...(byComponent.get(c) || []), file]); } return `<span class="dt-eyebrow">${esc(ext.category)}</span><h3>${esc(ext.name)}</h3>${ext.packages?.length ? `<div class="dt-chips">${ext.packages.slice(0, 8).map(item => `<span class="dt-chip">${esc(item)}</span>`).join('')}</div>` : ext.via ? `<p>Found via <code>${esc(ext.via)}</code></p>` : ''}<h4>Used by ${ext.files?.length || 0} file(s)</h4>${[...byComponent].map(([component, files]) => `<div class="dt-insp-group"><b>${esc(short(component, 3))}</b>${files.slice(0, 6).map(file => fileLink(file)).join('')}</div>`).join('')}${actions(`<button class="dt-btn" data-act="go" data-view="integrations">Integrations →</button>`)}`; }
    if (node.kind === 'file') {
      const file = node.data, routes = x.routesByFile.get(file.id) || [];
      return `<span class="dt-eyebrow">${esc(file.language)} file</span><h3 title="${esc(file.id)}">${esc(base(file.id))}</h3><p class="dt-path">${esc(file.id)}</p>${metricGrid([['LOC', file.loc], ['Complexity', file.complexity], ['Fan-in', file.fanIn], ['Fan-out', file.fanOut], ['Instability', file.instability], ['Depth', file.depth], ['Commits', file.commits], ['Nesting', file.maxNesting]])}
        ${file.owner ? `<p class="dt-muted">Mostly ${esc(file.owner.name)} (${Math.round(file.owner.share * 100)}%, ${file.owner.authors} author${file.owner.authors === 1 ? '' : 's'})</p>` : ''}
        ${routes.length ? `<h4>Entry points</h4>${routes.slice(0, 8).map(route => `<div class="dt-insp-route">${method(route.method)}<span>${pathHtml(route.path)}</span></div>`).join('')}` : ''}
        ${list('Imports', x.out.get(file.id) || [])}${list('Imported by', x.inc.get(file.id) || [])}
        ${actions(`<button class="dt-btn warm" data-act="source" data-file="${esc(file.id)}">Open source</button><button class="dt-btn" data-act="impact" data-file="${esc(file.id)}">Impact</button><button class="dt-btn" data-act="context" data-kind="file" data-id="${esc(file.id)}">⧉ AI context</button>`)}`;
    }
    const c = node.data || x.components.get(node.id.replace(/^c:/, ''));
    if (!c) return '';
    const id = c.id, deps = r.architecture.links.filter(link => link.from === id), users = r.architecture.links.filter(link => link.to === id);
    const files = r.files.filter(file => file.component === id && !file.test).sort((a, b) => b.fanIn - a.fanIn), routes = r.routes.items.filter(route => route.component === id), owners = r.ownership.groups[id];
    const ints = [...new Set(files.flatMap(file => file.integrations))].map(ext => x.externals.get(ext)).filter(Boolean);
    return `<span class="dt-eyebrow">Component${c.zone ? ` · <b class="dt-zone">zone of ${c.zone}</b>` : ''}</span><h3 title="${esc(id)}">${esc(short(id, 2))}</h3><p class="dt-path">${esc(id)}</p>
      ${metricGrid([['Files', c.files], ['LOC', num(c.loc)], ['Ca', c.ca], ['Ce', c.ce], ['I', c.instability], ['A', c.abstractness ?? '—'], ['D', c.distance ?? '—'], ['Tests', c.tests]])}
      ${owners ? `<p class="dt-muted">Owner ${esc(owners.owner)} · ${Math.round(owners.ownerShare * 100)}% of ${owners.commits} commits · bus factor <b class="${owners.busFactor === 1 ? 'dt-bad' : ''}">${owners.busFactor}</b></p>` : ''}
      ${deps.length ? `<h4>Depends on</h4>${deps.slice(0, 8).map(link => `<button class="dt-insp-link" data-act="map-select" data-id="${esc(link.to)}"><span>${esc(short(link.to, 3))}</span><em>${link.weight}</em></button>`).join('')}` : ''}
      ${users.length ? `<h4>Used by</h4>${users.slice(0, 8).map(link => `<button class="dt-insp-link" data-act="map-select" data-id="${esc(link.from)}"><span>${esc(short(link.from, 3))}</span><em>${link.weight}</em></button>`).join('')}` : ''}
      ${routes.length ? `<h4>Entry points (${routes.length})</h4>${routes.slice(0, 6).map(route => `<div class="dt-insp-route">${method(route.method)}<span>${pathHtml(route.path)}</span></div>`).join('')}` : ''}
      ${ints.length ? `<h4>Integrations</h4><div class="dt-chips">${ints.map(item => `<span class="dt-chip v">${esc(item.name)}</span>`).join('')}</div>` : ''}
      ${files.length ? `<h4>Most depended-on files</h4>${files.slice(0, 5).map(file => fileLink(file.id)).join('')}` : ''}
      ${actions(`${node.ghost || S.map.level !== 'files' ? `<button class="dt-btn warm" data-act="map-drill" data-id="${esc(id)}">Open files</button>` : ''}<button class="dt-btn" data-act="context" data-kind="component" data-id="${esc(id)}">⧉ AI context</button>`)}`;
  }
  const metricGrid = items => `<div class="dt-mgrid">${items.map(([label, value]) => `<div><small>${label}</small><b>${esc(value ?? '—')}</b></div>`).join('')}</div>`;
  const list = (title, ids) => (ids.length ? `<h4>${title} (${ids.length})</h4>${ids.slice(0, 8).map(id => fileLink(id)).join('')}${ids.length > 8 ? `<small class="dt-muted">+${ids.length - 8} more</small>` : ''}` : '');
  function bindMap() {
    const canvas = root.querySelector('.dt-canvas'); if (!canvas) return;
    const pointers = new Map(); let drag = null, moved = false, pinch = null;
    canvas.addEventListener('pointerdown', event => { pointers.set(event.pointerId, { x: event.clientX, y: event.clientY }); moved = false; if (pointers.size === 2) { const [a, b] = [...pointers.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), z: S.map.z }; drag = null; } else drag = { x: event.clientX, y: event.clientY, tx: S.map.tx, ty: S.map.ty }; });
    canvas.addEventListener('pointermove', event => {
      if (!pointers.has(event.pointerId)) return;
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (pinch && pointers.size === 2) { const [a, b] = [...pointers.values()]; zoomAt(canvas, (a.x + b.x) / 2, (a.y + b.y) / 2, (pinch.z * Math.hypot(a.x - b.x, a.y - b.y)) / pinch.d); return; }
      if (!drag) return;
      const dx = event.clientX - drag.x, dy = event.clientY - drag.y;
      if (Math.abs(dx) + Math.abs(dy) > 3) { moved = true; canvas.classList.add('panning'); try { canvas.setPointerCapture(event.pointerId); } catch { /* capture unsupported */ } }
      S.map.tx = drag.tx + dx; S.map.ty = drag.ty + dy; applyTransform();
    });
    const end = event => { pointers.delete(event.pointerId); if (pointers.size < 2) pinch = null; drag = null; canvas.classList.remove('panning'); };
    canvas.addEventListener('pointerup', end); canvas.addEventListener('pointercancel', end);
    canvas.addEventListener('wheel', event => { event.preventDefault(); if (event.ctrlKey || event.metaKey) zoomAt(canvas, event.clientX, event.clientY, S.map.z * Math.exp(-event.deltaY * 0.0022)); else { S.map.tx -= event.deltaX; S.map.ty -= event.deltaY; applyTransform(); } }, { passive: false });
    canvas.addEventListener('click', event => { if (moved) return; const node = event.target.closest('.dt-node'); S.map.selected = node ? node.dataset.id : null; paintSelection(); paintInspector(); });
    canvas.addEventListener('dblclick', event => { const node = event.target.closest('.dt-node'); if (!node) return; const id = node.dataset.id.replace(/^c:/, ''); if (S.x.components.has(id)) drill(id); else if (S.x.files.has(id)) openSource(id); });
    canvas.addEventListener('keydown', event => { if (event.key === 'Escape') { S.map.selected = null; paintSelection(); paintInspector(); } if (event.key === 'f') fitMap(); });
  }
  function zoomAt(canvas, clientX, clientY, z) {
    const box = canvas.getBoundingClientRect(), next = clamp(z, 0.2, 3), px = clientX - box.left, py = clientY - box.top;
    S.map.tx = px - ((px - S.map.tx) * next) / S.map.z; S.map.ty = py - ((py - S.map.ty) * next) / S.map.z; S.map.z = next; applyTransform();
  }
  function drill(id) { Object.assign(S.map, { level: 'files', component: id, focus: null, selected: null }); if (mapState) mapState.fitted = false; S.view = 'map'; writeHash(`component=${encodeURIComponent(id)}`); paintBody(); root.querySelectorAll('.dt-tab').forEach(tab => tab.classList.toggle('on', tab.dataset.view === 'map')); }

  // ------------------------------------------------------------------------ routes
  function filteredRoutes() {
    const f = S.routes, q = f.q.trim().toLowerCase();
    const unguarded = new Set(S.r.routes.insights.unguardedWrites.map(route => `${route.method} ${route.path} ${route.file}:${route.line}`));
    return S.r.routes.items.filter(route => (!f.kind || route.kind === f.kind) && (!f.method || route.method === f.method) && (!f.framework || route.framework === f.framework) && (!f.unguarded || unguarded.has(`${route.method} ${route.path} ${route.file}:${route.line}`)) && (!q || `${route.method} ${route.path} ${route.handler || ''} ${route.file} ${route.framework}`.toLowerCase().includes(q)));
  }
  function routesView() {
    const r = S.r, ins = r.routes.insights, f = S.routes;
    if (!r.routes.items.length) return card('Entry points', empty('No entry points detected', 'Maverick reads decorators and annotations (NestJS, Spring, JAX-RS, ASP.NET, FastAPI, Flask, Actix, Symfony…), router calls (Express, Fastify, Hono, Gin, Echo, Fiber, chi, net/http, Laravel, Rails, Phoenix, Ktor, Vapor…), file-system routing (Next.js, Nuxt, SvelteKit, Remix, Astro) and contracts (OpenAPI, GraphQL SDL, protobuf).'));
    const opts = (values, current, all) => `<option value="">${all}</option>${values.map(value => `<option value="${esc(value)}" ${value === current ? 'selected' : ''}>${esc(value)}</option>`).join('')}`;
    const drift = ins.contract.unimplemented.length + ins.contract.undocumented.length;
    return `<div class="dt-routes">
      <div class="dt-kinds wide">${Object.entries(ins.byKind).map(([kind, value]) => `<button class="dt-kind ${f.kind === kind ? 'on' : ''}" data-act="route-kind" data-kind="${kind}"><b>${num(value)}</b><span>${KIND_LABEL[kind] || kind}</span></button>`).join('')}
        <div class="dt-kind-note">${ins.duplicates.length ? `<span class="dt-sev dt-sev-high">${ins.duplicates.length} duplicate</span>` : ''}${ins.unguardedWrites.length ? `<button class="dt-sev dt-sev-medium" data-act="route-unguarded">${ins.unguardedWrites.length} unguarded write${ins.unguardedWrites.length === 1 ? '' : 's'}</button>` : ''}${ins.contract.documented ? `<span class="dt-sev ${drift ? 'dt-sev-low' : 'dt-sev-ok'}">contract ${drift ? `drift ${drift}` : 'in sync'}</span>` : ''}</div></div>
      <div class="dt-toolbar">
        <input class="dt-input grow" placeholder="Filter by path, handler, file or framework…" value="${esc(f.q)}" data-model="routes.q" data-slot-target="routes">
        <select class="dt-select" data-model="routes.method">${opts(Object.keys(ins.byMethod), f.method, 'Any method')}</select>
        <select class="dt-select" data-model="routes.framework">${opts(Object.keys(ins.byFramework), f.framework, 'Any framework')}</select>
        <label class="dt-field">Group <select class="dt-select" data-model="routes.group">${[['prefix', 'Path prefix'], ['file', 'File'], ['component', 'Component'], ['framework', 'Framework'], ['none', 'None']].map(([id, label]) => `<option value="${id}" ${f.group === id ? 'selected' : ''}>${label}</option>`).join('')}</select></label>
        <div class="dt-menu"><button class="dt-btn">⇩ Export</button><div><button data-act="routes-export" data-format="json">JSON</button><button data-act="routes-export" data-format="csv">CSV</button><button data-act="routes-export" data-format="md">Markdown</button><button data-act="routes-export" data-format="http">.http requests</button></div></div>
      </div>
      <div class="dt-split"><div data-slot="routes">${SLOTS.routes()}</div><aside class="dt-drawer" data-slot="route-detail">${SLOTS['route-detail']()}</aside></div>
      ${ins.duplicates.length || drift || ins.unguardedWrites.length ? `<div class="dt-grid dt-grid-3">
        ${ins.duplicates.length ? card('Defined twice', ins.duplicates.map(item => `<div class="dt-row">${method(item.method)}<span class="dt-path-code">${pathHtml(item.path)}</span><small>${item.locations.map(location => fileLink(location.replace(/:\d+$/, ''), location.split(':').pop())).join(' ')}</small></div>`).join(''), '', 'Same framework, method and path in more than one place.') : ''}
        ${drift ? card('Contract drift', `${ins.contract.unimplemented.slice(0, 12).map(item => `<div class="dt-row">${method(item.method)}<span class="dt-path-code">${pathHtml(item.path)}</span><small>documented, not found in code · ${fileLink(item.file, item.line)}</small></div>`).join('')}${ins.contract.undocumented.slice(0, 12).map(item => `<div class="dt-row">${method(item.method)}<span class="dt-path-code">${pathHtml(item.path)}</span><small>in code, missing from contract · ${fileLink(item.file, item.line)}</small></div>`).join('')}`, '', `${ins.contract.documented} operation(s) declared in API contracts.`) : ''}
        ${ins.unguardedWrites.length ? card('Writes without a route-level guard', ins.unguardedWrites.slice(0, 15).map(item => `<div class="dt-row">${method(item.method)}<span class="dt-path-code">${pathHtml(item.path)}</span><small>${fileLink(item.file, item.line)}</small></div>`).join(''), '', 'No guard/authorize annotation on the handler or controller and no global guard detected. Often intentional — verify.') : ''}
      </div>` : ''}
    </div>`;
  }
  function groupKey(route) {
    const g = S.routes.group;
    if (g === 'file') return route.file;
    if (g === 'component') return route.component || '(outside the import graph)';
    if (g === 'framework') return route.framework;
    if (g === 'none') return '';
    if (route.kind !== 'http' && route.kind !== 'page') return KIND_LABEL[route.kind] || route.kind;
    const parts = route.path.split('/').filter(Boolean).filter(part => !/^[:{[<*]/.test(part));
    const versioned = /^v\d+$/.test(parts[1] || '') || /^v\d+$/.test(parts[0] || '');
    return `/${parts.slice(0, versioned ? 3 : 2).join('/')}`;
  }
  function routesSlot() {
    const routes = filteredRoutes(), groups = new Map();
    for (const route of routes) { const key = groupKey(route); (groups.get(key) || groups.set(key, []).get(key)).push(route); }
    if (!routes.length) return empty('No entry point matches these filters');
    const sel = S.routes.selected;
    return `<div class="dt-count">${num(routes.length)} of ${num(S.r.routes.items.length)} entry points</div>${[...groups].sort((a, b) => a[0].localeCompare(b[0])).map(([key, items]) => `<section class="dt-rgroup">${key ? `<h4><span>${esc(key)}</span><em>${items.length}</em></h4>` : ''}${items.slice(0, 400).map(route => `<button class="dt-route ${sel === route.id ? 'on' : ''}" data-act="route" data-id="${esc(route.id)}">${method(route.method)}<span class="dt-route-path">${pathHtml(route.path)}</span><span class="dt-route-meta">${route.guards?.length || route.globalGuard ? '<i class="dt-lock" title="Guarded">🔒</i>' : ''}${route.reaches?.length ? `<i class="dt-reach" title="Reaches ${esc(route.reaches.map(ext => S.x.externals.get(ext)?.name || ext).join(', '))}">⇄ ${route.reaches.length}</i>` : ''}<small>${esc(route.handler || '')}</small><code>${esc(short(route.file, 2))}:${route.line}</code></span></button>`).join('')}</section>`).join('')}`;
  }
  function routeDetailSlot() {
    const route = S.r.routes.items.find(item => item.id === S.routes.selected);
    if (!route) return `<div class="dt-insp-empty"><span class="dt-eyebrow">Entry point</span><h3>Select a route</h3><p>See its handler, the guards in front of it, what it reaches through imports, a ready-to-run request and the source around it.</p></div>`;
    const baseUrl = store.get('baseUrl', 'http://localhost:3000'), http = route.kind === 'http' && !route.path.includes('*');
    const curl = `curl -X ${route.method === 'ANY' ? 'GET' : route.method} '${baseUrl.replace(/\/$/, '')}${route.path.replace(/:(\w+)\??|\{(\w+)[^}]*\}|\[(\w+)\]|<(?:\w+:)?(\w+)>/g, (_m, a, b, c, d) => `{${a || b || c || d}}`)}'${['POST', 'PUT', 'PATCH'].includes(route.method) ? " -H 'content-type: application/json' -d '{}'" : ''}`;
    const reach = (route.reaches || []).map(id => S.x.externals.get(id)).filter(Boolean);
    return `<span class="dt-eyebrow">${esc(route.framework)} · ${esc(KIND_LABEL[route.kind] || route.kind)}${route.source === 'contract' ? ' · contract' : route.source === 'filesystem' ? ' · file-system route' : ''}</span>
      <h3 class="dt-route-title">${method(route.method)} <span>${pathHtml(route.path)}</span></h3>
      ${route.handler ? `<p class="dt-muted">Handler <code>${esc(route.handler)}</code></p>` : ''}${route.version ? `<p class="dt-muted">Version <code>${esc(route.version)}</code></p>` : ''}${route.mountedAt ? `<p class="dt-muted">Mounted at <code>${esc(route.mountedAt)}</code></p>` : ''}
      <div class="dt-pipe"><span class="dt-pipe-step">Request</span>${(route.guards || []).map(guard => `<span class="dt-pipe-step g" title="${esc(guard)}">${esc(guard.replace(/\(.*$/, '').replace(/^Use/, ''))}</span>`).join('')}${route.globalGuard ? '<span class="dt-pipe-step g">global guard</span>' : ''}<span class="dt-pipe-step h">${esc(route.handler ? base(route.handler.replace(/\./g, '/')) : 'handler')}</span>${reach.map(item => `<span class="dt-pipe-step x">${esc(item.name)}</span>`).join('')}</div>
      ${route.reachFiles ? `<p class="dt-muted">Reaches ${num(route.reachFiles)} file(s) through imports${reach.length ? ` and ${reach.length} integration(s)` : ''}.</p>` : ''}
      ${http ? `<div class="dt-curl"><div><small>Base URL</small><input class="dt-input" value="${esc(baseUrl)}" data-act-input="base-url"></div><pre>${esc(curl)}</pre><button class="dt-btn" data-act="copy" data-text="${esc(curl)}">⧉ Copy curl</button></div>` : ''}
      <div class="dt-insp-actions"><button class="dt-btn warm" data-act="source" data-file="${esc(route.file)}" data-line="${route.line}">Open source</button>${S.x.files.has(route.file) ? `<button class="dt-btn" data-act="impact" data-file="${esc(route.file)}">Impact</button>` : ''}${editorLink(route.file, route.line)}</div>
      <div class="dt-snippet" data-snippet="${esc(route.file)}" data-line="${route.line}"><span class="dt-spin"></span></div>`;
  }
  const exportRoutes = format => {
    const routes = filteredRoutes().map(({ kind, method: m, path, framework, handler, file, line, guards }) => ({ kind, method: m, path, framework, handler: handler || '', file, line, guards: (guards || []).join(' ') }));
    if (format === 'json') return copy(JSON.stringify(routes, null, 2), `Copied ${routes.length} routes as JSON`);
    if (format === 'md') return copy(`| Method | Path | Handler | Source |\n|---|---|---|---|\n${routes.map(route => `| ${route.method} | \`${route.path}\` | ${route.handler} | ${route.file}:${route.line} |`).join('\n')}`, 'Copied Markdown table');
    if (format === 'http') { const baseUrl = store.get('baseUrl', 'http://localhost:3000').replace(/\/$/, ''); return download('routes.http', routes.filter(route => route.kind === 'http' && route.method !== 'ANY').map(route => `### ${route.handler || route.path}\n${route.method} ${baseUrl}${route.path}\n`).join('\n')); }
    download('routes.csv', `kind,method,path,framework,handler,file,line,guards\n${routes.map(route => Object.values(route).map(value => `"${String(value).replace(/"/g, '""')}"`).join(',')).join('\n')}`, 'text/csv');
  };

  // ------------------------------------------------------------------------ coupling
  function couplingView() {
    const a = S.r.architecture;
    return `<div class="dt-grid dt-grid-coupling">
      ${card('Components', `<div data-slot="components">${SLOTS.components()}</div>`, `<button class="dt-btn" data-act="copy-mermaid">⧉ Mermaid</button>`, `Martin metrics per component${a.inferred ? ' (inferred from the folder layout — declare <code>architecture.components</code> to choose them)' : ''}. Ca/Ce count components.`)}
      ${card('Main sequence', mainSequence(a.components), '', 'Abstractness vs instability. Good components sit near the diagonal A + I = 1.')}
      ${card('Dependency structure matrix', dsm(a), '', 'Row depends on column (number of imports). Stable components first; red cells are mutual dependencies.')}
      ${card('Stable Dependencies Principle', a.sdp.length ? a.sdp.map(link => `<div class="dt-row"><span class="dt-path-code">${esc(short(link.from, 3))} → ${esc(short(link.to, 3))}</span><small>I ${link.fromInstability} → ${link.toInstability} · ${link.weight} import(s) · e.g. ${fileLink(link.examples[0].from)}</small></div>`).join('') : '<div class="dt-ok">✓ Components depend in the direction of stability.</div>', '', 'A component should only depend on components more stable than itself.')}
      ${card('Boundary rules', boundaries(a), '', 'Architecture rules declared in configuration, checked on every import.')}
      ${card('Files', `<input class="dt-input grow" placeholder="Filter files…" value="${esc(S.files.q)}" data-model="files.q" data-slot-target="files"><div data-slot="files">${SLOTS.files()}</div>`, '', 'Per-file coupling. Depth is the longest import chain out of the file.')}
    </div>`;
  }
  function componentsSlot() {
    const { sort, dir } = S.coupling, cols = [['id', 'Component'], ['files', 'Files'], ['loc', 'LOC'], ['ca', 'Ca'], ['ce', 'Ce'], ['instability', 'I'], ['abstractness', 'A'], ['distance', 'D'], ['zone', 'Zone']];
    const rows = [...S.r.architecture.components].sort((a, b) => { const x = a[sort] ?? -1, y = b[sort] ?? -1; return (typeof x === 'string' ? x.localeCompare(y) : x - y) * dir; });
    return `<div class="dt-scroll"><table class="dt-table"><thead><tr>${cols.map(([id, label]) => `<th data-act="sort" data-key="${id}" class="${sort === id ? (dir > 0 ? 'asc' : 'desc') : ''}">${label}</th>`).join('')}</tr></thead><tbody>${rows.map(c => `<tr data-act="map-select" data-id="${esc(c.id)}"><td title="${esc(c.id)}"><b>${esc(short(c.id, 3))}</b></td><td>${c.files}</td><td>${num(c.loc)}</td><td>${c.ca}</td><td>${c.ce}</td><td>${bar(c.instability, 1, instabilityColor(c.instability))}<em>${c.instability}</em></td><td>${c.abstractness ?? '—'}</td><td>${c.distance === null ? '—' : `${bar(c.distance, 1, distanceColor(c.distance))}<em>${c.distance}</em>`}</td><td>${c.zone ? `<span class="dt-zone">${c.zone}</span>` : ''}</td></tr>`).join('')}</tbody></table></div>`;
  }
  function mainSequence(components) {
    const size = 300, pad = 34, items = components.filter(c => c.abstractness !== null && c.files);
    if (!items.length) return empty('No declared types found', 'Abstractness needs classes, interfaces, traits or protocols. Functional code has no main sequence to measure.');
    const max = Math.max(...items.map(c => c.files));
    const px = v => pad + v * (size - pad * 1.5), py = v => size - pad - v * (size - pad * 1.5);
    return `<svg class="dt-chart" viewBox="0 0 ${size} ${size}"><rect x="${px(0)}" y="${py(0.45)}" width="${px(0.45) - px(0)}" height="${py(0) - py(0.45)}" class="dt-zone-pain"/><rect x="${px(0.55)}" y="${py(1)}" width="${px(1) - px(0.55)}" height="${py(0.55) - py(1)}" class="dt-zone-use"/>
      <line x1="${px(0)}" y1="${py(1)}" x2="${px(1)}" y2="${py(0)}" class="dt-diag"/><line x1="${px(0)}" y1="${py(0)}" x2="${px(1)}" y2="${py(0)}" class="dt-axis"/><line x1="${px(0)}" y1="${py(0)}" x2="${px(0)}" y2="${py(1)}" class="dt-axis"/>
      <text x="${px(0.02)}" y="${py(0.05)}" class="dt-zone-label">zone of pain</text><text x="${px(0.6)}" y="${py(0.93)}" class="dt-zone-label">zone of uselessness</text>
      <text x="${px(0.5)}" y="${size - 8}" class="dt-axis-label">Instability →</text><text x="12" y="${py(0.5)}" class="dt-axis-label" transform="rotate(-90 12 ${py(0.5)})">Abstractness →</text>
      ${items.map(c => `<circle cx="${px(c.instability)}" cy="${py(c.abstractness)}" r="${4 + Math.sqrt(c.files / max) * 12}" fill="${distanceColor(c.distance)}" class="dt-dot" data-act="map-select" data-id="${esc(c.id)}"><title>${esc(c.id)}\nI ${c.instability} · A ${c.abstractness} · D ${c.distance} · ${c.files} files</title></circle>`).join('')}</svg>`;
  }
  function dsm(a) {
    const order = a.dsm.order.filter(id => S.x.components.get(id)?.files), n = order.length;
    if (n < 2) return empty('One component', 'The matrix compares components; this repository has only one.');
    const index = new Map(a.dsm.order.map((id, i) => [id, i])), max = Math.max(1, ...a.dsm.matrix.flat());
    return `<div class="dt-scroll"><table class="dt-dsm"><thead><tr><th></th>${order.map((id, i) => `<th title="${esc(id)}"><span>${i + 1}</span></th>`).join('')}</tr></thead><tbody>${order.map((row, i) => `<tr><th title="${esc(row)}"><span>${i + 1}</span>${esc(short(row, 2))}</th>${order.map((col, j) => { const v = a.dsm.matrix[index.get(row)][index.get(col)], back = a.dsm.matrix[index.get(col)][index.get(row)]; return `<td class="${i === j ? 'self' : v && back ? 'mutual' : ''}" style="${v ? `--a:${(0.18 + (v / max) * 0.82).toFixed(2)}` : ''}" title="${esc(row)} → ${esc(col)}: ${v} import(s)">${v || ''}</td>`; }).join('')}</tr>`).join('')}</tbody></table></div>`;
  }
  function boundaries(a) {
    if (!a.rules.length) return `<p class="dt-muted">No rules yet. Declare which parts must not import which, and every violation becomes a high-severity finding and a health deduction:</p><pre class="dt-pre">// .maverick/config.json
{
  "architecture": {
    "rules": [
      { "from": "src/domain/**", "disallow": ["src/infra/**", "src/http/**"],
        "reason": "The domain stays framework-free" }
    ]
  }
}</pre>`;
    return `${a.rules.map(rule => `<div class="dt-row"><span class="dt-path-code">${esc(rule.from)} ↛ ${esc((rule.disallow || []).join(', '))}</span><small>${esc(rule.reason || '')}</small></div>`).join('')}<h4>${a.violations.length ? `${a.violations.length} violation(s)` : '✓ No violations'}</h4>${a.violations.slice(0, 30).map(v => `<div class="dt-row">${fileLink(v.from)} <span class="dt-muted">imports</span> ${fileLink(v.to)}</div>`).join('')}`;
  }
  function filesSlot() {
    const q = S.files.q.trim().toLowerCase();
    const rows = S.r.files.filter(file => !file.test && (!q || file.id.toLowerCase().includes(q))).sort((a, b) => b.fanIn + b.fanOut - (a.fanIn + a.fanOut)).slice(0, 60);
    return `<div class="dt-scroll"><table class="dt-table"><thead><tr><th>File</th><th>Fan-in</th><th>Fan-out</th><th>I</th><th>Depth</th><th>Complexity</th></tr></thead><tbody>${rows.map(file => `<tr><td>${fileLink(file.id)}${S.x.cycleFiles.has(file.id) ? ' <span class="dt-sev dt-sev-high">cycle</span>' : ''}</td><td>${file.fanIn}</td><td>${file.fanOut}</td><td>${bar(file.instability, 1, instabilityColor(file.instability))}<em>${file.instability}</em></td><td>${file.depth}</td><td>${file.complexity}</td></tr>`).join('')}</tbody></table></div>`;
  }

  // ------------------------------------------------------------------------ cycles
  function cyclesView() {
    const r = S.r, files = r.graph.cycles, comps = r.architecture.cycles;
    const loop = items => `<div class="dt-loop">${items.map((id, i) => `${i ? '<span class="dt-arrow">→</span>' : ''}<button class="dt-loop-node" data-act="source" data-file="${esc(id)}" title="${esc(id)}">${esc(id.split('/').slice(-2).join('/'))}</button>`).join('')}</div>`;
    return `<div class="dt-grid dt-grid-2">
      ${card(`File cycles <em class="dt-count-badge">${files.length}</em>`, files.length ? files.map((cycle, i) => `<div class="dt-cycle"><header><b>#${i + 1}</b><span>${cycle.members.length} files · shortest loop ${cycle.loop.length - 1} step(s)</span>${cycle.members.length > 5 ? sev('high') : sev('medium')}</header>${loop(cycle.loop)}${cycle.members.length > cycle.loop.length - 1 ? `<details><summary>All ${cycle.members.length} members</summary>${cycle.members.map(id => fileLink(id)).join('')}</details>` : ''}<button class="dt-btn" data-act="impact" data-file="${esc(cycle.members.join(','))}">Impact of the whole cycle</button></div>`).join('') : '<div class="dt-ok">✓ No import cycles. Lazy imports are ignored on purpose: they are deliberate runtime boundaries.</div>', '', 'Strongly connected components of static imports (Tarjan), each shown once with its shortest loop.')}
      ${card(`Component cycles <em class="dt-count-badge">${comps.length}</em>`, comps.length ? comps.map(cycle => `<div class="dt-cycle"><header><span>${cycle.members.length} components</span></header><div class="dt-loop">${cycle.loop.map((id, i) => `${i ? '<span class="dt-arrow">→</span>' : ''}<button class="dt-loop-node" data-act="map-select" data-id="${esc(id)}">${esc(short(id, 2))}</button>`).join('')}</div></div>`).join('') : '<div class="dt-ok">✓ Components form a directed acyclic graph.</div>', '', 'Components that depend on each other even when no single file cycle exists.')}
      ${card('How to break a cycle', `<ol class="dt-steps"><li><b>Find the weakest edge.</b> Open each file of the loop: usually one import exists for a single helper or type.</li><li><b>Move shared code down.</b> Extract what both sides need into a module neither side owns.</li><li><b>Invert the dependency.</b> Let the inner side declare an interface the outer side implements.</li><li><b>Use events or lazy imports</b> for genuine runtime-only relationships.</li><li><b>Guard it.</b> Add a boundary rule so it does not come back.</li></ol>`)}
    </div>`;
  }

  // ------------------------------------------------------------------------ hotspots
  function hotspotsView() {
    const r = S.r, list = r.hotspots;
    if (!list.length) return card('Hotspots', empty('No Git history in the last 12 months', 'Hotspots rank files by commits × (1 + fan-in) × log10(10 + lines).'));
    const w = 640, h = 320, pad = 42, maxC = Math.max(...list.map(item => item.complexity), 2), maxCommits = Math.max(...list.map(item => item.commits)), maxLoc = Math.max(...list.map(item => item.loc), 1);
    const px = v => pad + (Math.log(1 + v) / Math.log(1 + maxC)) * (w - pad * 1.6), py = v => h - pad - (v / maxCommits) * (h - pad * 1.6);
    const chart = `<svg class="dt-chart wide" viewBox="0 0 ${w} ${h}"><rect x="${px(maxC ** 0.5)}" y="${py(maxCommits)}" width="${px(maxC) - px(maxC ** 0.5)}" height="${py(maxCommits / 2) - py(maxCommits)}" class="dt-zone-pain"/><text x="${px(maxC) - 4}" y="${py(maxCommits) + 14}" class="dt-zone-label end">refactor first</text>
      <line x1="${pad}" y1="${h - pad}" x2="${w - pad * 0.6}" y2="${h - pad}" class="dt-axis"/><line x1="${pad}" y1="${h - pad}" x2="${pad}" y2="${pad * 0.6}" class="dt-axis"/>
      <text x="${w / 2}" y="${h - 10}" class="dt-axis-label">Complexity (log) →</text><text x="14" y="${h / 2}" class="dt-axis-label" transform="rotate(-90 14 ${h / 2})">Commits →</text>
      ${list.map((item, i) => `<g class="dt-dot-g" data-act="source" data-file="${esc(item.id)}"><circle cx="${px(item.complexity)}" cy="${py(item.commits)}" r="${4 + Math.sqrt(item.loc / maxLoc) * 16}" fill="${scale(Math.min(1, item.fanIn / 10), ['#4aa3ff', '#ff6b00'])}" class="dt-dot"><title>${esc(item.id)}\n${item.commits} commits · complexity ${item.complexity} · ${item.loc} loc · fan-in ${item.fanIn}</title></circle>${i < 6 ? `<text x="${px(item.complexity) + 8}" y="${py(item.commits) - 8}" class="dt-dot-label">${esc(base(item.id))}</text>` : ''}</g>`).join('')}</svg>`;
    return `<div class="dt-grid dt-grid-2">
      ${card('Change × complexity', chart, '', 'Bubble size = lines of code, colour = dependents. Top-right files change often and are hard to change.')}
      ${card('Ranking', `<div class="dt-scroll"><table class="dt-table"><thead><tr><th>#</th><th>File</th><th>Commits</th><th>Complexity</th><th>Fan-in</th><th>Owner</th><th>Score</th></tr></thead><tbody>${list.slice(0, 25).map((item, i) => `<tr><td>${i + 1}</td><td>${fileLink(item.id)}</td><td>${item.commits}</td><td>${item.complexity}</td><td>${item.fanIn}</td><td>${esc(item.owner || '—')}</td><td>${bar(item.score, list[0].score, '#ff8a1a')}<em>${num(item.score)}</em></td></tr>`).join('')}</tbody></table></div>`, '', 'score = commits × (1 + fan-in) × log10(10 + lines)')}
      ${card('Change coupling', r.cochange.length ? `<div class="dt-scroll"><table class="dt-table"><thead><tr><th>Files that change together</th><th>Shared</th><th>Degree</th><th></th></tr></thead><tbody>${r.cochange.slice(0, 30).map(pair => `<tr><td>${fileLink(pair.a)}<br>${fileLink(pair.b)}</td><td>${pair.shared}</td><td>${bar(pair.degree, 1, pair.hidden ? '#ef5350' : '#9b8cff')}<em>${pair.degree}</em></td><td>${pair.hidden ? '<span class="dt-sev dt-sev-medium" title="No import links these files">hidden</span>' : pair.components[0] !== pair.components[1] ? '<span class="dt-sev dt-sev-low">cross-component</span>' : ''}</td></tr>`).join('')}</tbody></table></div>` : empty('No pairs change together often enough', 'Pairs need at least 3 shared commits and a degree of 0.3.'), '', 'Temporal coupling from Git: degree 1.0 = they always change together. “Hidden” = no import between them.')}
    </div>`;
  }

  // ------------------------------------------------------------------------ impact
  function impactCompute(targets) {
    const x = S.x, depth = new Map(targets.map(id => [id, 0])), queue = [...targets];
    while (queue.length) { const current = queue.shift(); for (const parent of x.inc.get(current) || []) if (!depth.has(parent)) { depth.set(parent, depth.get(current) + 1); queue.push(parent); } }
    for (const id of targets) depth.delete(id);
    const touched = new Set([...targets, ...depth.keys()]);
    const routes = S.r.routes.items.filter(route => touched.has(route.file));
    const tests = [...depth.keys()].filter(id => x.files.get(id)?.test).concat(targets.filter(id => x.files.get(id)?.test));
    const forward = new Set(), fq = [...targets];
    while (fq.length && forward.size < 800) { const current = fq.shift(); for (const next of x.out.get(current) || []) if (!forward.has(next) && !targets.includes(next)) { forward.add(next); fq.push(next); } }
    const reaches = new Set([...targets, ...forward].flatMap(id => x.files.get(id)?.integrations || []));
    return { depth, routes, tests: [...new Set(tests)], components: new Set([...touched].map(id => x.files.get(id)?.component).filter(Boolean)), forward, reaches };
  }
  function impactView() {
    const r = S.r, targets = S.impact.files.filter(id => S.x.files.has(id)), changes = (lens()?.git?.changes || []).map(line => line.slice(3).trim().split(' -> ').pop()).filter(file => S.x.files.has(file));
    const picker = `<div class="dt-toolbar"><input class="dt-input grow" list="dt-file-list" placeholder="Type a file path and press Enter…" data-act-input="impact-add"><datalist id="dt-file-list">${r.files.slice(0, 3000).map(file => `<option value="${esc(file.id)}">`).join('')}</datalist>${changes.length ? `<button class="dt-btn warm" data-act="impact-changes">Use my ${changes.length} uncommitted change(s)</button>` : ''}${targets.length ? '<button class="dt-btn" data-act="impact-clear">Clear</button>' : ''}</div><div class="dt-chips">${targets.map(id => `<span class="dt-chip on">${esc(short(id, 3))}<button data-act="impact-remove" data-file="${esc(id)}" aria-label="Remove">×</button></span>`).join('')}</div>`;
    if (!targets.length) {
      const risky = [...r.files].filter(file => !file.test).sort((a, b) => b.fanIn - a.fanIn).slice(0, 8);
      return `${card('Blast radius', `${picker}<p class="dt-muted">Choose files you plan to change. Lens walks the import graph backwards to find every dependent, the entry points they serve, the tests to run and the integrations reached.</p><h4>Try one of the most depended-on files</h4><div class="dt-chips">${risky.map(file => `<button class="dt-chip" data-act="impact" data-file="${esc(file.id)}">${esc(short(file.id, 3))} <em>${file.fanIn}</em></button>`).join('')}</div>`)}`;
    }
    const result = impactCompute(targets), source = r.summary.sourceFiles || 1, byDepth = new Map();
    for (const [id, d] of result.depth) (byDepth.get(d) || byDepth.set(d, []).get(d)).push(id);
    const share = pct([...result.depth.keys()].filter(id => !S.x.files.get(id)?.test).length, source);
    const risk = share >= 25 || result.routes.length >= 20 ? ['high', 'Wide blast radius — prefer the strict workflow'] : share >= 8 || result.routes.length >= 5 ? ['medium', 'Moderate blast radius'] : ['low', 'Contained change'];
    return `${card('Blast radius', `${picker}<div class="dt-kpis">${[['Dependents', num(result.depth.size), `${share}% of source files`], ['Entry points', num(result.routes.length), 'served by affected files'], ['Tests to run', num(result.tests.length), 'import the change'], ['Components', num(result.components.size), 'touched'], ['Reaches', num(result.reaches.size), 'integrations downstream']].map(([label, value, sub]) => `<div class="dt-kpi"><small>${label}</small><b>${value}</b><span>${sub}</span></div>`).join('')}</div><p>${sev(risk[0])} ${risk[1]}.</p>`, `<button class="dt-btn" data-act="copy" data-text="${esc(`Files to change: ${targets.join(', ')}\nDependents: ${result.depth.size}\nTests to run:\n${result.tests.map(test => `- ${test}`).join('\n')}\nEntry points affected:\n${result.routes.map(route => `- ${route.method} ${route.path}`).join('\n')}`)}">⧉ Copy summary</button>`)}
      <div class="dt-grid dt-grid-3">
        ${card('Dependents by distance', [...byDepth].sort((a, b) => a[0] - b[0]).map(([d, ids]) => `<h4>${d === 1 ? 'Direct' : `${d} steps away`} <em>${ids.length}</em></h4>${ids.slice(0, 30).map(id => fileLink(id)).join('')}${ids.length > 30 ? `<small class="dt-muted">+${ids.length - 30} more</small>` : ''}`).join('') || '<div class="dt-ok">Nothing imports these files.</div>')}
        ${card('Entry points affected', result.routes.length ? result.routes.slice(0, 60).map(route => `<button class="dt-route slim" data-act="route-open" data-id="${esc(route.id)}">${method(route.method)}<span class="dt-route-path">${pathHtml(route.path)}</span></button>`).join('') : '<div class="dt-ok">No entry point depends on these files.</div>')}
        ${card('Tests to run', result.tests.length ? result.tests.map(id => fileLink(id)).join('') : `<p class="dt-muted">No test imports these files${targets.some(id => !S.x.files.get(id)?.test) ? ' — consider adding one before changing them' : ''}.</p>`, result.tests.length ? `<button class="dt-btn" data-act="copy" data-text="${esc(result.tests.join(' '))}">⧉ Copy</button>` : '')}
      </div>`;
  }

  // ------------------------------------------------------------------------ integrations
  function integrationsView() {
    const ints = S.r.integrations;
    const byCat = new Map(); for (const item of ints.integrations) (byCat.get(item.category) || byCat.set(item.category, []).get(item.category)).push(item);
    return `<div class="dt-grid dt-grid-2">
      ${card('What this application talks to', ints.integrations.length ? `<div class="dt-int-grid">${ints.integrations.map(item => `<article class="dt-int"><header><span class="dt-int-icon c-${esc(item.category)}">${esc(item.name[0])}</span><div><b>${esc(item.name)}</b><small>${esc(item.category)}</small></div>${item.declaredOnly ? '<span class="dt-sev dt-sev-low" title="Declared in a manifest but no import found">declared only</span>' : `<em>${item.files.length} file${item.files.length === 1 ? '' : 's'}</em>`}</header><div class="dt-chips">${item.packages.slice(0, 5).map(pkg => `<span class="dt-chip">${esc(pkg)}</span>`).join('')}</div>${item.files.length ? `<details><summary>Used in ${[...new Set(item.files.map(file => S.x.files.get(file)?.component).filter(Boolean))].length} component(s)</summary>${item.files.slice(0, 20).map(file => fileLink(file)).join('')}</details>` : ''}</article>`).join('')}</div>` : empty('No known integrations', 'Detected from dependency manifests of every ecosystem and from import specifiers.'), '', `${ints.manifests.length} manifest(s) read · ${[...byCat.keys()].join(' · ')}`)}
      ${card('Configuration', ints.variables.length ? `<input class="dt-input grow" placeholder="Filter variables…" value="${esc(S.ints.q)}" data-model="ints.q" data-slot-target="vars"><div data-slot="vars">${SLOTS.vars()}</div>` : empty('No environment variables read'), '', ints.exampleFiles.length ? `Compared with ${ints.exampleFiles.join(', ')}. Values are never read.` : 'No .env.example found — add one so new developers know what to set. Values are never read.')}
      ${card('Outbound services', ints.services.length ? ints.services.map(item => `<div class="dt-row"><b>${esc(item.name)}</b><small>via <code>${esc(item.via)}</code> · ${item.files.slice(0, 3).map(file => fileLink(file)).join(' ')}${item.files.length > 3 ? ` +${item.files.length - 3}` : ''}</small></div>`).join('') : empty('No outbound service addresses found'), '', 'From *_URL / *_HOST style variables and literal URLs in code.')}
    </div>`;
  }
  function varsSlot() {
    const q = S.ints.q.trim().toLowerCase(), rows = S.r.integrations.variables.filter(item => !q || item.name.toLowerCase().includes(q));
    return `<div class="dt-scroll"><table class="dt-table"><thead><tr><th>Variable</th><th>Kind</th><th>Documented</th><th>Read in</th></tr></thead><tbody>${rows.slice(0, 200).map(item => `<tr><td><code>${esc(item.name)}</code></td><td>${item.secret ? '<span class="dt-sev dt-sev-medium">secret</span>' : item.address ? '<span class="dt-chip v">address</span>' : ''}</td><td>${item.documented === null ? '—' : item.documented ? '<span class="dt-okc">✓</span>' : '<span class="dt-bad">missing</span>'}</td><td>${fileLink(item.files[0].file, item.files[0].line)}${item.files.length > 1 ? ` <small class="dt-muted">+${item.files.length - 1}</small>` : ''}</td></tr>`).join('')}</tbody></table></div>`;
  }

  // ------------------------------------------------------------------------ team
  function teamView() {
    const r = S.r, o = r.ownership, weeks = r.activity, max = Math.max(1, ...weeks.map(week => week.commits));
    if (!o.contributors.length) return card('Team', empty('No Git history', 'Ownership, bus factor and activity come from Git commits of the last 12 months.'));
    const groups = Object.entries(o.groups).sort((a, b) => b[1].commits - a[1].commits), top = o.contributors[0].commits;
    const silos = r.hotspots.filter(item => { const file = S.x.files.get(item.id); return file?.owner && file.owner.share >= 0.9 && item.commits >= 3; }).slice(0, 10);
    return `<div class="dt-grid dt-grid-2">
      ${card('Activity', `<div class="dt-spark tall">${weeks.map(week => `<i style="height:${Math.max(2, (week.commits / max) * 100)}%" title="Week of ${week.week}: ${week.commits} commits, ${week.files} file changes"></i>`).join('')}</div><div class="dt-spark-axis"><span>${weeks[0].week}</span><span>this week</span></div>`, '', `${num(r.summary.commits)} commits since ${esc(r.since)}.`)}
      ${card('Contributors', o.contributors.slice(0, 12).map(item => `<div class="dt-rank"><span class="dt-person">${esc(item.name)}</span><span>${bar(item.commits, top, '#9b8cff')}<em>${item.commits}</em></span></div>`).join(''), '', 'Local only: author names never leave this machine.')}
      ${card('Knowledge map', `<div class="dt-scroll"><table class="dt-table"><thead><tr><th>Component</th><th>Commits</th><th>Authors</th><th>Main owner</th><th>Bus factor</th></tr></thead><tbody>${groups.map(([id, g]) => `<tr data-act="map-select" data-id="${esc(id)}"><td title="${esc(id)}">${esc(short(id, 3))}</td><td>${g.commits}</td><td>${g.authors}</td><td>${esc(g.owner)} <em>${Math.round(g.ownerShare * 100)}%</em></td><td><b class="${g.busFactor === 1 && g.authors > 1 ? 'dt-bad' : ''}">${g.busFactor}</b></td></tr>`).join('')}</tbody></table></div>`, '', 'Bus factor = fewest people who authored over half of the commits.')}
      ${card('Knowledge silos', silos.length ? silos.map(item => `<div class="dt-row">${fileLink(item.id)}<small>${esc(item.owner)} wrote ${Math.round(S.x.files.get(item.id).owner.share * 100)}% of ${item.commits} commits</small></div>`).join('') : '<div class="dt-ok">✓ No frequently changed file depends on a single person.</div>', '', 'Hotspots where one person holds 90%+ of the history.')}
    </div>`;
  }

  // ------------------------------------------------------------------------ debt
  function debtView() {
    const r = S.r, markers = r.files.flatMap(file => file.debt.map(item => ({ ...item, file: file.id }))), tags = [...new Set(markers.map(item => item.tag))];
    const shown = markers.filter(item => !S.debt.tag || item.tag === S.debt.tag);
    const complex = r.files.filter(file => !file.test).sort((a, b) => b.complexity - a.complexity).slice(0, 12), large = r.files.filter(file => !file.test).sort((a, b) => b.loc - a.loc).slice(0, 12);
    return `<div class="dt-grid dt-grid-2">
      ${card(`Markers <em class="dt-count-badge">${markers.length}</em>`, markers.length ? `<div class="dt-seg small"><button class="${!S.debt.tag ? 'on' : ''}" data-act="debt-tag" data-tag="">All</button>${tags.map(tag => `<button class="${S.debt.tag === tag ? 'on' : ''}" data-act="debt-tag" data-tag="${tag}">${tag} ${markers.filter(item => item.tag === tag).length}</button>`).join('')}</div><div class="dt-scroll tall">${shown.slice(0, 300).map(item => `<div class="dt-row"><span class="dt-tag t-${item.tag.toLowerCase()}">${item.tag}</span><span class="dt-debt-text">${esc(item.text || '—')}</span><small>${fileLink(item.file, item.line)}</small></div>`).join('')}</div>` : '<div class="dt-ok">✓ No TODO, FIXME or HACK markers.</div>', '', 'TODO · FIXME · HACK · XXX · BUG · DEPRECATED in comments.')}
      ${card('Most complex', complex.map(file => `<div class="dt-rank">${fileLink(file.id)}<span>${bar(file.complexity, complex[0]?.complexity || 1, '#f6ad55')}<em>${file.complexity}</em></span></div>`).join(''), '', 'Decision points (if, loops, case, catch, && and ||), comparable across languages.')}
      ${card('Largest', large.map(file => `<div class="dt-rank">${fileLink(file.id)}<span>${bar(file.loc, large[0]?.loc || 1, '#9b8cff')}<em>${num(file.loc)}</em></span></div>`).join(''), '', 'Lines of code, excluding blanks and comments.')}
      ${card(`Possibly unused <em class="dt-count-badge">${r.unused.length}</em>`, r.unused.length ? r.unused.map(id => fileLink(id)).join('') : '<div class="dt-ok">✓ Every module has a static importer or looks like an entry point.</div>', '', 'No static importer and not entry-point-like. Check for framework or dynamic loading before deleting.')}
    </div>`;
  }

  // ------------------------------------------------------------------------ findings
  function findingsView() {
    const r = S.r, f = S.findings, cats = [...new Set(r.findings.map(item => item.category))];
    return `<div class="dt-toolbar"><div class="dt-seg">${['', 'high', 'medium', 'low'].map(level => `<button class="${f.severity === level ? 'on' : ''}" data-act="findings-sev" data-sev="${level}">${level ? `${SEV[level]} ${r.findings.filter(item => item.severity === level).length}` : `All ${r.findings.length}`}</button>`).join('')}</div><select class="dt-select" data-model="findings.category"><option value="">Every category</option>${cats.map(cat => `<option ${f.category === cat ? 'selected' : ''}>${esc(cat)}</option>`).join('')}</select><span class="dt-grow"></span><button class="dt-btn" data-act="findings-export">⧉ Copy as Markdown</button></div><div data-slot="findings">${SLOTS.findings()}</div>`;
  }
  function findingsSlot() {
    const f = S.findings, rows = S.r.findings.filter(item => (!f.severity || item.severity === f.severity) && (!f.category || item.category === f.category));
    if (!rows.length) return '<div class="dt-ok">✓ Nothing to report here.</div>';
    return rows.map(item => `<article class="dt-finding" id="finding-${esc(item.id)}"><header>${sev(item.severity)}<span class="dt-cat">${esc(item.category)}</span><h3>${esc(item.title)}</h3></header><p>${esc(item.detail)}</p>${item.files?.length ? `<div class="dt-chips">${item.files.slice(0, 8).map(file => (S.x.files.has(file) || /\./.test(file) ? `<button class="dt-chip" data-act="source" data-file="${esc(file)}">${esc(short(file, 3))}</button>` : `<button class="dt-chip" data-act="map-select" data-id="${esc(file)}">${esc(short(file, 3))}</button>`)).join('')}${item.files.length > 8 ? `<span class="dt-muted">+${item.files.length - 8}</span>` : ''}</div>` : ''}<footer><span class="dt-action">→ ${esc(item.action || '')}</span><button class="dt-btn" data-act="task" data-id="${esc(item.id)}">＋ Create task</button></footer></article>`).join('');
  }

  // ------------------------------------------------------------------------ source drawer
  const KEYWORDS = /\b(import|export|from|as|const|let|var|function|return|if|else|elif|for|while|do|switch|case|break|continue|new|class|interface|extends|implements|public|private|protected|static|async|await|def|func|fn|pub|impl|struct|enum|trait|type|package|use|mod|module|namespace|using|try|catch|except|finally|throw|raise|with|yield|lambda|match|when|end|val|fun|object|override|abstract|final|void|null|nil|None|true|false|True|False|self|this|super|in|of|is|not|and|or)\b/g;
  function highlight(line, hash) {
    const pattern = new RegExp(`(${hash ? '#.*$|' : ''}\\/\\/.*$|\\/\\*.*?\\*\\/|"(?:\\\\.|[^"\\\\])*"|'(?:\\\\.|[^'\\\\])*'|\`(?:\\\\.|[^\`\\\\])*\`|\\b\\d[\\d_.]*\\b|@[A-Za-z_][\\w.]*)`, 'g');
    let out = '', last = 0;
    for (const match of line.matchAll(pattern)) {
      out += esc(line.slice(last, match.index)).replace(KEYWORDS, '<b class="k">$1</b>');
      const token = match[0], cls = /^(#|\/\/|\/\*)/.test(token) ? 'c' : /^["'`]/.test(token) ? 's' : token.startsWith('@') ? 'a' : 'n';
      out += `<i class="${cls}">${esc(token)}</i>`; last = match.index + token.length;
    }
    return out + esc(line.slice(last)).replace(KEYWORDS, '<b class="k">$1</b>');
  }
  function editorLink(file, line) {
    const editor = store.get('editor', 'vscode'), abs = `${S.r.root}/${file}`;
    const href = editor === 'idea' ? `idea://open?file=${encodeURIComponent(abs)}&line=${line || 1}` : editor === 'zed' ? `zed://file${abs}:${line || 1}` : `${editor}://file${abs}:${line || 1}`;
    return `<a class="dt-btn" href="${esc(href)}" title="Open in ${editor}">↗ ${esc({ vscode: 'VS Code', cursor: 'Cursor', windsurf: 'Windsurf', idea: 'JetBrains', zed: 'Zed' }[editor] || editor)}</a>`;
  }
  async function snippetInto(el) {
    const file = el.dataset.snippet, line = Number(el.dataset.line) || 1;
    try {
      const data = await (await fetch(`/api/source?file=${encodeURIComponent(file)}`)).json();
      if (!data.lines) throw new Error(data.error);
      const from = Math.max(0, line - 6), to = Math.min(data.lines.length, line + 18), hash = /\.(py|rb|ex|exs|ya?ml|toml|sh|properties)$/.test(file);
      el.innerHTML = `<pre class="dt-code">${data.lines.slice(from, to).map((text, i) => `<span class="${from + i + 1 === line ? 'hl' : ''}"><em>${from + i + 1}</em>${highlight(text, hash) || ' '}</span>`).join('')}</pre>`;
    } catch { el.innerHTML = '<p class="dt-muted">Source unavailable.</p>'; }
  }
  async function openSource(file, line) {
    const overlay = document.createElement('div');
    overlay.className = 'dt-overlay';
    overlay.innerHTML = `<article class="dt-sheet" role="dialog" aria-modal="true" aria-label="Source"><header><div><span class="dt-eyebrow">Source</span><h3>${esc(file)}${line ? `<em>:${line}</em>` : ''}</h3></div><div class="dt-sheet-actions"><select class="dt-select" data-editor>${['vscode', 'cursor', 'windsurf', 'idea', 'zed'].map(id => `<option value="${id}" ${store.get('editor', 'vscode') === id ? 'selected' : ''}>${{ vscode: 'VS Code', cursor: 'Cursor', windsurf: 'Windsurf', idea: 'JetBrains', zed: 'Zed' }[id]}</option>`).join('')}</select><span data-editor-link>${editorLink(file, line)}</span>${S.x.files.has(file) ? `<button class="dt-btn" data-act="impact" data-file="${esc(file)}">Impact</button><button class="dt-btn" data-act="context" data-kind="file" data-id="${esc(file)}">⧉ AI context</button>` : ''}<button class="dt-btn" data-close>Close</button></div></header><div class="dt-sheet-meta"></div><div class="dt-sheet-body"><span class="dt-spin"></span></div></article>`;
    const close = () => { overlay.remove(); document.removeEventListener('keydown', onKey); };
    const onKey = event => { if (event.key === 'Escape') close(); };
    overlay.addEventListener('click', event => { if (event.target === overlay || event.target.closest('[data-close]')) close(); else if (event.target.closest('[data-act]')) { close(); onAction(event); } });
    overlay.querySelector('[data-editor]').addEventListener('change', event => { store.set('editor', event.target.value); overlay.querySelector('[data-editor-link]').innerHTML = editorLink(file, line); });
    document.addEventListener('keydown', onKey); document.body.append(overlay);
    const meta = S.x.files.get(file);
    if (meta) overlay.querySelector('.dt-sheet-meta').innerHTML = `${metricGrid([['Language', meta.language], ['LOC', meta.loc], ['Complexity', meta.complexity], ['Fan-in', meta.fanIn], ['Fan-out', meta.fanOut], ['Depth', meta.depth], ['Commits', meta.commits], ['Component', short(meta.component || '—', 2)]])}`;
    try {
      const data = await (await fetch(`/api/source?file=${encodeURIComponent(file)}`)).json();
      if (!data.lines) throw new Error(data.error || 'unavailable');
      const hash = /\.(py|rb|ex|exs|ya?ml|toml|sh|properties)$/.test(file);
      overlay.querySelector('.dt-sheet-body').innerHTML = `<div class="dt-sheet-cols"><pre class="dt-code full">${data.lines.map((text, i) => `<span id="L${i + 1}" class="${i + 1 === Number(line) ? 'hl' : ''}"><em>${i + 1}</em>${highlight(text, hash) || ' '}</span>`).join('')}</pre><aside>${list('Imports', data.imports || [])}${list('Imported by', data.importedBy || [])}${(S.x.routesByFile.get(file) || []).length ? `<h4>Entry points</h4>${S.x.routesByFile.get(file).map(route => `<button class="dt-route slim" data-act="route-open" data-id="${esc(route.id)}">${method(route.method)}<span class="dt-route-path">${pathHtml(route.path)}</span></button>`).join('')}` : ''}${meta?.debt?.length ? `<h4>Markers</h4>${meta.debt.map(item => `<div class="dt-row"><span class="dt-tag t-${item.tag.toLowerCase()}">${item.tag}</span><small>L${item.line} ${esc(item.text)}</small></div>`).join('')}` : ''}</aside></div>`;
      if (line) overlay.querySelector(`#L${line}`)?.scrollIntoView({ block: 'center' });
    } catch (error) { overlay.querySelector('.dt-sheet-body').innerHTML = `<p class="dt-muted">Could not load the source: ${esc(error.message)}</p>`; }
  }

  // ------------------------------------------------------------------------ AI context
  function contextFor(kind, id) {
    const r = S.r, x = S.x;
    if (kind === 'file') {
      const f = x.files.get(id), routes = x.routesByFile.get(id) || [], dependents = impactCompute([id]);
      return `## Context: \`${id}\`\n\n- Language: ${f.language}; ${f.loc} lines of code; complexity ${f.complexity}; nesting ${f.maxNesting}\n- Component: \`${f.component}\`\n- Fan-in ${f.fanIn}, fan-out ${f.fanOut}, instability ${f.instability}, import depth ${f.depth}\n- Changed in ${f.commits} commit(s) in the last 12 months${f.owner ? `; mostly by ${f.owner.name}` : ''}\n${x.cycleFiles.has(id) ? '- ⚠ Part of an import cycle\n' : ''}\n### Imports\n${(x.out.get(id) || []).map(item => `- \`${item}\``).join('\n') || '- none'}\n\n### Imported by (${dependents.depth.size} transitive dependents)\n${(x.inc.get(id) || []).map(item => `- \`${item}\``).join('\n') || '- none'}\n\n### Entry points in this file\n${routes.map(route => `- ${route.method} ${route.path}`).join('\n') || '- none'}\n\n### Entry points affected by a change\n${dependents.routes.slice(0, 30).map(route => `- ${route.method} ${route.path}`).join('\n') || '- none'}\n\n### Tests to run\n${dependents.tests.map(test => `- \`${test}\``).join('\n') || '- none found — add one'}\n\n### Integrations reached\n${[...dependents.reaches].map(ext => `- ${x.externals.get(ext)?.name || ext}`).join('\n') || '- none'}\n`;
    }
    const c = x.components.get(id), deps = r.architecture.links.filter(link => link.from === id), users = r.architecture.links.filter(link => link.to === id), routes = r.routes.items.filter(route => route.component === id);
    return `## Context: component \`${id}\`\n\n- ${c.files} source files, ${c.tests} tests, ${c.loc} lines of code\n- Ca ${c.ca}, Ce ${c.ce}, instability ${c.instability}, abstractness ${c.abstractness ?? 'n/a'}, distance ${c.distance ?? 'n/a'}${c.zone ? ` (zone of ${c.zone})` : ''}\n\n### Depends on\n${deps.map(link => `- \`${link.to}\` (${link.weight} imports)`).join('\n') || '- nothing'}\n\n### Used by\n${users.map(link => `- \`${link.from}\` (${link.weight} imports)`).join('\n') || '- nobody'}\n\n### Entry points\n${routes.slice(0, 40).map(route => `- ${route.method} ${route.path} → \`${route.file}:${route.line}\``).join('\n') || '- none'}\n\n### Most depended-on files\n${r.files.filter(file => file.component === id && !file.test).sort((a, b) => b.fanIn - a.fanIn).slice(0, 10).map(file => `- \`${file.id}\` (fan-in ${file.fanIn})`).join('\n')}\n`;
  }

  // ------------------------------------------------------------------------ command palette
  function openPalette() {
    if (document.querySelector('.dt-palette')) return;
    const overlay = document.createElement('div');
    overlay.className = 'dt-overlay dt-palette';
    overlay.innerHTML = `<div class="dt-pal" role="dialog" aria-label="Search"><input class="dt-pal-input" placeholder="Jump to a view, file, route, component, integration or finding…" autocomplete="off" spellcheck="false"><div class="dt-pal-list"></div><footer><span><kbd>↑</kbd><kbd>↓</kbd> navigate</span><span><kbd>↵</kbd> open</span><span><kbd>esc</kbd> close</span></footer></div>`;
    document.body.append(overlay);
    const input = overlay.querySelector('input'), listEl = overlay.querySelector('.dt-pal-list');
    let items = [], active = 0;
    const score = (text, q) => { const t = text.toLowerCase(); if (!q) return 1; if (t.includes(q)) return 100 - t.indexOf(q) - t.length / 100; let i = 0; for (const char of t) if (char === q[i]) i++; return i === q.length ? 10 - t.length / 100 : 0; };
    const all = () => {
      const r = S.r;
      if (!r) return VIEWS.map(([id, label, icon]) => ({ kind: 'View', label, icon, run: () => go(id) }));
      return [
        ...VIEWS.map(([id, label, icon]) => ({ kind: 'View', label, icon, run: () => go(id) })),
        ...r.architecture.components.map(c => ({ kind: 'Component', label: c.id, icon: '⌗', hint: `${c.files} files`, run: () => selectOnMap(c.id) })),
        ...r.routes.items.map(route => ({ kind: 'Route', label: `${route.method} ${route.path}`, icon: '⇢', hint: short(route.file, 2), run: () => openRoute(route.id) })),
        ...[...S.x.externals.values()].map(ext => ({ kind: 'Integration', label: ext.name, icon: '⇄', hint: ext.category, run: () => go('integrations') })),
        ...r.findings.map(item => ({ kind: 'Finding', label: item.title, icon: '!', hint: item.severity, run: () => openFinding(item.id) })),
        ...r.files.map(file => ({ kind: 'File', label: file.id, icon: '·', hint: file.language, run: () => openSource(file.id) }))
      ];
    };
    const source = all();
    const paint = () => {
      const q = input.value.trim().toLowerCase();
      items = source.map(item => ({ item, s: score(`${item.label} ${item.kind}`, q) })).filter(entry => entry.s > 0).sort((a, b) => b.s - a.s).slice(0, 40).map(entry => entry.item);
      if (!q) items = source.filter(item => item.kind === 'View').concat(source.filter(item => item.kind === 'Finding').slice(0, 5));
      active = clamp(active, 0, Math.max(0, items.length - 1));
      listEl.innerHTML = items.length ? items.map((item, i) => `<button class="dt-pal-item ${i === active ? 'on' : ''}" data-i="${i}"><span class="dt-pal-icon">${esc(item.icon)}</span><span class="dt-pal-label">${esc(item.label)}</span><span class="dt-pal-kind">${esc(item.hint || '')} <em>${item.kind}</em></span></button>`).join('') : '<div class="dt-pal-empty">No match</div>';
      listEl.querySelector('.on')?.scrollIntoView({ block: 'nearest' });
    };
    const close = () => overlay.remove();
    const run = i => { const item = items[i]; close(); item?.run(); };
    input.addEventListener('input', () => { active = 0; paint(); });
    input.addEventListener('keydown', event => { if (event.key === 'ArrowDown') { active++; paint(); event.preventDefault(); } else if (event.key === 'ArrowUp') { active--; paint(); event.preventDefault(); } else if (event.key === 'Enter') run(active); else if (event.key === 'Escape') close(); });
    listEl.addEventListener('click', event => { const item = event.target.closest('.dt-pal-item'); if (item) run(Number(item.dataset.i)); });
    overlay.addEventListener('click', event => { if (event.target === overlay) close(); });
    paint(); input.focus();
  }
  function selectOnMap(id) { ensureDevtools(); Object.assign(S.map, { level: 'components', component: '', selected: id, focus: null }); if (mapState) mapState.fitted = false; go('map'); }
  function openRoute(id) { ensureDevtools(); S.routes.selected = id; const route = S.r.routes.items.find(item => item.id === id); if (route && !filteredRoutes().includes(route)) Object.assign(S.routes, { q: '', kind: '', method: '', framework: '', unguarded: false }); go('routes'); }
  function openFinding(id) { ensureDevtools(); S.findings = { severity: '', category: '' }; go('findings'); setTimeout(() => { const el = document.getElementById(`finding-${id}`); el?.scrollIntoView({ block: 'center' }); el?.classList.add('flash'); }, 30); }
  function ensureDevtools() { if (!root || !document.body.contains(root)) location.hash = '#devtools/overview'; }

  // ------------------------------------------------------------------------ actions
  const VIEW_RENDER = { overview, map: mapView, routes: routesView, coupling: couplingView, cycles: cyclesView, hotspots: hotspotsView, impact: impactView, integrations: integrationsView, team: teamView, debt: debtView, findings: findingsView };
  const VIEW_AFTER = {
    map: () => { bindMap(); window.requestAnimationFrame(() => drawMap(!mapState?.fitted)); },
    routes: () => root.querySelectorAll('[data-snippet]').forEach(snippetInto)
  };
  const SLOTS = { routes: routesSlot, 'route-detail': routeDetailSlot, components: componentsSlot, files: filesSlot, vars: varsSlot, findings: findingsSlot };
  function setModel(path, value) {
    const [group, key] = path.split('.');
    S[group][key] = value;
    if (group === 'map') {
      if (key === 'component') { S.map.selected = null; S.map.focus = null; if (mapState) mapState.fitted = false; writeHash(value ? `component=${encodeURIComponent(value)}` : ''); }
      if (key === 'search') return paintSelection();
      if (['externals', 'isolated', 'tests', 'component'].includes(key) && mapState) mapState.fitted = false;
      return key === 'component' ? paintBody() : drawMap();
    }
    if (group === 'routes') { paintSlot('routes'); return; }
    if (group === 'findings') return paintSlot('findings');
    if (group === 'files') return paintSlot('files');
    if (group === 'ints') return paintSlot('vars');
    return paintBody();
  }
  async function createTask(id) {
    const finding = S.r.findings.find(item => item.id === id); if (!finding) return;
    const response = await fetch('/api/improvements', { method: 'POST', headers: { 'content-type': 'application/json', 'x-lens-token': token() }, body: JSON.stringify({ slug: slug(finding.title), title: finding.title, detail: [finding.detail, finding.action].filter(Boolean).join(' '), preset: finding.severity === 'high' || finding.category === 'security' ? 'strict' : 'standard' }) });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) return toast(result.error || 'Could not create the task', 'warn');
    toast(`Task ${result.slug} created (${result.preset}), grounded in the code — plan it with: maverick new ${result.slug}`);
    fetch('/api/project').then(res => res.json()).then(data => { d = data; }).catch(() => {});
  }
  function onAction(event) {
    const el = event.target.closest('[data-act]'); if (!el) return;
    const act = el.dataset.act;
    const actions = {
      go: () => go(el.dataset.view), palette: openPalette, refresh: () => load(true),
      source: () => openSource(el.dataset.file, Number(el.dataset.line) || undefined),
      impact: () => { ensureDevtools(); S.impact.files = el.dataset.file.split(','); go('impact', `file=${encodeURIComponent(el.dataset.file)}`); },
      'impact-changes': () => { S.impact.files = (lens()?.git?.changes || []).map(line => line.slice(3).trim().split(' -> ').pop()).filter(file => S.x.files.has(file)); paintBody(); },
      'impact-clear': () => { S.impact.files = []; writeHash(); paintBody(); },
      'impact-remove': () => { S.impact.files = S.impact.files.filter(file => file !== el.dataset.file); paintBody(); },
      'map-level': () => { S.map.level = el.dataset.level; S.map.selected = null; S.map.focus = null; if (mapState) mapState.fitted = false; if (S.view !== 'map') go('map'); else { writeHash(); paintBody(); } },
      'map-select': () => { const id = el.dataset.id; if (S.view === 'map' && mapState?.model.nodes.has(id)) { S.map.selected = id; paintSelection(); paintInspector(); } else if (S.view === 'map' && mapState?.model.nodes.has(`c:${id}`)) { S.map.selected = `c:${id}`; paintSelection(); paintInspector(); } else selectOnMap(id); },
      'map-focus': () => { S.map.focus = el.dataset.id; if (mapState) mapState.fitted = false; drawMap(true); },
      'map-unfocus': () => { S.map.focus = null; if (mapState) mapState.fitted = false; paintBody(); },
      'map-drill': () => drill(el.dataset.id), 'map-fit': () => fitMap(),
      'map-svg': () => { const svg = root.querySelector('.dt-svg'); if (svg) download('maverick-map.svg', `<?xml version="1.0"?>\n${svg.outerHTML.replace('<svg', `<svg style="background:#050505;font-family:system-ui" width="${Math.round(mapState.width + 200)}" height="${Math.round(mapState.height + 200)}"`).replace(/transform="translate\([^"]*\) scale\([^"]*\)"/, 'transform="translate(60,40)"').replace('</svg>', `<style>${MAP_EXPORT_CSS}</style></svg>`)}`, 'image/svg+xml'); },
      route: () => { S.routes.selected = el.dataset.id; root.querySelectorAll('.dt-route').forEach(item => item.classList.toggle('on', item.dataset.id === el.dataset.id)); paintSlot('route-detail'); root.querySelectorAll('[data-snippet]').forEach(snippetInto); },
      'route-open': () => openRoute(el.dataset.id),
      'route-kind': () => { S.routes.kind = S.routes.kind === el.dataset.kind && S.view === 'routes' ? '' : el.dataset.kind; if (S.view === 'routes') paintBody(); else go('routes'); },
      'route-unguarded': () => { S.routes.unguarded = !S.routes.unguarded; paintSlot('routes'); },
      'routes-export': () => exportRoutes(el.dataset.format),
      sort: () => { const key = el.dataset.key; S.coupling.dir = S.coupling.sort === key ? -S.coupling.dir : key === 'id' ? 1 : -1; S.coupling.sort = key; paintSlot('components'); },
      'copy-mermaid': () => copy(`graph LR\n${S.r.architecture.links.slice(0, 80).map(link => `  ${JSON.stringify(link.from)} -->|${link.weight}| ${JSON.stringify(link.to)}`).join('\n').replace(/"([^"]+)"/g, (_m, id) => `${id.replace(/[^\w]/g, '_')}["${id}"]`)}`, 'Copied Mermaid diagram'),
      copy: () => copy(el.dataset.text),
      context: () => copy(contextFor(el.dataset.kind, el.dataset.id), 'Copied AI context — paste it into your agent'),
      'findings-sev': () => { S.findings.severity = el.dataset.sev; root.querySelectorAll('[data-act="findings-sev"]').forEach(item => item.classList.toggle('on', item === el)); paintSlot('findings'); },
      'findings-export': () => copy(S.r.findings.map(item => `- **[${item.severity}] ${item.title}** — ${item.detail}${item.action ? ` _${item.action}_` : ''}`).join('\n'), 'Copied findings'),
      finding: () => openFinding(el.dataset.id), task: () => createTask(el.dataset.id),
      'debt-tag': () => { S.debt.tag = el.dataset.tag; paintBody(); }
    };
    if (actions[act]) { event.preventDefault?.(); actions[act](); }
  }
  function onInput(event) {
    const el = event.target;
    if (el.dataset.model) {
      const value = el.type === 'checkbox' ? el.checked : el.value;
      if (el.tagName === 'INPUT' && el.type !== 'checkbox') { window.clearTimeout(inputTimer); inputTimer = setTimeout(() => setModel(el.dataset.model, value), 110); } else setModel(el.dataset.model, value);
    }
    if (el.dataset.actInput === 'base-url') { store.set('baseUrl', el.value); window.clearTimeout(inputTimer); inputTimer = setTimeout(() => { const pre = el.closest('.dt-curl'); if (pre) { const fresh = document.createElement('div'); fresh.innerHTML = routeDetailSlot(); pre.querySelector('pre').textContent = fresh.querySelector('.dt-curl pre')?.textContent || ''; pre.querySelector('[data-act="copy"]').dataset.text = pre.querySelector('pre').textContent; } }, 200); }
  }
  function onKey(event) {
    if (event.target.dataset?.actInput === 'impact-add' && event.key === 'Enter') { const file = event.target.value.trim(); if (S.x.files.has(file)) { S.impact.files = [...new Set([...S.impact.files, file])]; paintBody(); root.querySelector('[data-act-input="impact-add"]')?.focus(); } else toast('Unknown file', 'warn'); }
  }

  // ------------------------------------------------------------------------ mount
  function connect() {
    if (sse || !window.EventSource) return;
    sse = new window.EventSource('/api/events');
    sse.addEventListener('changed', () => {
      if (!root || !document.body.contains(root)) { S.r = null; return; }
      const scroll = root.querySelector('.dt-body')?.scrollTop || 0;
      fetch('/api/devtools').then(res => res.json()).then(report => { if (!report.files) return; S.r = report; S.x = indexReport(report); S.updated = Date.now(); const keep = { ...S.map }; paintShell(); Object.assign(S.map, keep); root.querySelector('.dt-body')?.scrollTo?.(0, scroll); toast('Analysis updated from your latest changes'); }).catch(() => {});
      fetch('/api/project').then(res => res.json()).then(data => { d = data; }).catch(() => {});
    });
  }
  window.mountDevtools = () => {
    const host = document.getElementById('devtools-root'); if (!host) return;
    root = host; readHash();
    root.addEventListener('click', onAction); root.addEventListener('input', onInput); root.addEventListener('change', onInput); root.addEventListener('keydown', onKey);
    if (mapState) mapState.fitted = false;
    if (S.r) paintShell(); else load();
    connect();
  };
  document.addEventListener('keydown', event => {
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(event.target.tagName);
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { if (!root || !document.body.contains(root)) return; event.preventDefault(); openPalette(); return; }
    if (typing || event.metaKey || event.ctrlKey || event.altKey) return;
    if (event.key === '/' && root && document.body.contains(root)) { event.preventDefault(); openPalette(); }
    if (/^[1-9]$/.test(event.key) && root && document.body.contains(root) && !document.querySelector('.dt-overlay')) go(VIEWS[Number(event.key) - 1][0]);
  });

  // ------------------------------------------------------------------------ styles
  const MAP_EXPORT_CSS = '.dt-node-bg{fill:#161412;stroke:#3a2d22}.dt-node-title{fill:#f7f7f5;font:600 12px system-ui}.dt-node-sub{fill:#9a9a9a;font:10px ui-monospace,monospace}.dt-edge{fill:none;opacity:.8}.e-imp{stroke:#6a6a6a}.e-req{stroke:#ff6b00}.e-cyc{stroke:#ef5350}.e-use{stroke:#b69cff;stroke-dasharray:4 4}.m-e-imp{fill:#6a6a6a}.m-e-req{fill:#ff6b00}.m-e-cyc{fill:#ef5350}.m-e-use{fill:#b69cff}.dt-badge rect{fill:#2a1a0e}.dt-badge text{fill:#ffb15a;font:600 9px ui-monospace,monospace;text-anchor:middle}';
  const style = document.createElement('style');
  style.textContent = `
  #devtools-root{--dt-accent:#ff6b00;--dt-bg:#050505;--dt-s1:#0e0e0e;--dt-s2:#151515;--dt-s3:#1c1c1c;--dt-b:#292929;--dt-b2:#363636;--dt-t:#f7f7f5;--dt-m:#9b9b96;--dt-m2:#777;--dt-ok:#38c172;--dt-warn:#f6ad55;--dt-bad:#ef5350;--dt-v:#b69cff;--mono:"JetBrains Mono",ui-monospace,SFMono-Regular,Menlo,monospace;color:var(--dt-t)}
  .dt{display:flex;flex-direction:column;gap:18px;padding-bottom:40px}
  .dt-head{display:flex;justify-content:space-between;gap:20px;align-items:flex-end;flex-wrap:wrap}
  .dt-eyebrow{color:var(--dt-accent);font:600 10px var(--mono);letter-spacing:.13em;text-transform:uppercase}
  .dt-title h1{margin:8px 0 6px;font-size:clamp(28px,3.4vw,44px);letter-spacing:-.05em;line-height:1}
  .dt-title p{margin:0;color:var(--dt-m);font-size:13px}
  .dt-head-side{display:flex;gap:10px;align-items:center;flex-wrap:wrap}
  .dt-health{display:flex;align-items:center;gap:11px;padding:7px 14px 7px 7px;border:1px solid var(--dt-b);border-radius:12px;background:var(--dt-s1);color:var(--dt-t);cursor:pointer;text-align:left}
  .dt-health small{display:block;color:var(--dt-m2);font:600 9px var(--mono);letter-spacing:.1em}.dt-health strong{font-size:13px}
  .dt-ring{display:grid;place-items:center;width:42px;height:42px;border-radius:50%;background:conic-gradient(var(--c) calc(var(--p)*1%),#292929 0)}
  .dt-ring b{display:grid;place-items:center;width:33px;height:33px;border-radius:50%;background:var(--dt-s1);font:600 13px var(--mono)}
  .dt-btn{display:inline-flex;align-items:center;gap:7px;height:34px;padding:0 12px;border:1px solid var(--dt-b);border-radius:8px;background:var(--dt-s2);color:var(--dt-t);font:600 12px Inter,system-ui,sans-serif;cursor:pointer;text-decoration:none;white-space:nowrap;transition:border-color .15s,background .15s}
  .dt-btn:hover{border-color:#7b4119;background:#1d1611}.dt-btn.warm{border-color:#7b4119;color:#ffb15a}
  kbd{padding:1px 5px;border:1px solid var(--dt-b2);border-bottom-width:2px;border-radius:4px;background:#0f0f0f;color:var(--dt-m);font:10px var(--mono)}
  .dt-tabs{display:flex;gap:4px;padding:4px;border:1px solid var(--dt-b);border-radius:12px;background:var(--dt-s1);overflow-x:auto;scrollbar-width:none;position:sticky;top:0;z-index:5}
  .dt-tab{display:flex;align-items:center;gap:7px;flex:0 0 auto;padding:8px 12px;border:0;border-radius:8px;background:transparent;color:var(--dt-m);font:500 12.5px Inter,system-ui,sans-serif;cursor:pointer;transition:.15s}
  .dt-tab span{color:var(--dt-m2);font-size:12px}.dt-tab em{padding:1px 6px;border-radius:99px;background:#262626;color:var(--dt-m);font:600 10px var(--mono);font-style:normal}
  .dt-tab:hover{background:var(--dt-s3);color:var(--dt-t)}.dt-tab.on{background:#21130a;color:var(--dt-t);box-shadow:inset 0 -2px var(--dt-accent)}.dt-tab.on span{color:var(--dt-accent)}.dt-tab.on em{background:#40240f;color:#ffb15a}
  .dt-grid{display:grid;gap:16px}.dt-grid-2{grid-template-columns:repeat(2,minmax(0,1fr))}.dt-grid-3{grid-template-columns:repeat(3,minmax(0,1fr))}
  .dt-grid-over{grid-template-columns:repeat(3,minmax(0,1fr))}.dt-grid-over>.dt-card:first-child{grid-row:span 2}
  .dt-grid-coupling{grid-template-columns:minmax(0,1.5fr) minmax(300px,1fr)}.dt-grid-coupling>.dt-card:nth-child(3),.dt-grid-coupling>.dt-card:nth-child(6){grid-column:1/-1}
  .dt-card{min-width:0;padding:18px;border:1px solid var(--dt-b);border-radius:13px;background:var(--dt-s1)}
  .dt-card>header{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;margin-bottom:14px}
  .dt-card h3{margin:0;font-size:15px;letter-spacing:-.02em}.dt-card>header p{margin:5px 0 0;color:var(--dt-m2);font-size:11.5px;line-height:1.45}
  .dt-card h4{display:flex;justify-content:space-between;margin:16px 0 8px;color:var(--dt-m);font:600 10px var(--mono);letter-spacing:.08em;text-transform:uppercase}.dt-card h4 em{font-style:normal;color:var(--dt-m2)}
  .dt-more{flex:0 0 auto;border:0;background:none;color:#ffb15a;font:600 11px Inter,system-ui;cursor:pointer}
  .dt-count-badge{margin-left:6px;padding:1px 7px;border-radius:99px;background:#262626;color:var(--dt-m);font:600 11px var(--mono);font-style:normal}
  .dt-empty{padding:26px 18px;border:1px dashed var(--dt-b2);border-radius:10px;color:var(--dt-m);text-align:center}.dt-empty b{display:block;color:var(--dt-t);margin-bottom:6px}.dt-empty p{max-width:560px;margin:0 auto;font-size:12.5px;line-height:1.55}
  .dt-ok{padding:12px 14px;border:1px solid #1f3a28;border-radius:9px;background:#0f1a13;color:#9be0b3;font-size:12.5px;line-height:1.5}
  .dt-muted{color:var(--dt-m);font-size:12px;line-height:1.5}.dt-bad{color:var(--dt-bad)}.dt-okc{color:var(--dt-ok)}.dt-grow{flex:1}
  .dt-healthbox{display:flex;flex-direction:column;gap:16px}
  .dt-gauge{display:grid;place-items:center;width:150px;height:150px;margin:6px auto 0;border-radius:50%;background:conic-gradient(var(--c) calc(var(--p)*1%),#262626 0);position:relative}
  .dt-gauge::before{content:"";position:absolute;inset:13px;border-radius:50%;background:var(--dt-s1)}
  .dt-gauge b,.dt-gauge small{position:relative;grid-area:1/1}.dt-gauge b{font:600 44px var(--mono);letter-spacing:-.06em;margin-top:-10px}.dt-gauge small{margin-top:46px;color:var(--dt-m2);font:11px var(--mono)}
  .dt-deduct-row{display:flex;gap:12px;align-items:flex-start;padding:10px 0;border-top:1px solid var(--dt-b)}.dt-deduct-row b{font-size:13px}.dt-deduct-row small{display:block;margin-top:2px;color:var(--dt-m);font-size:11.5px}
  .dt-minus{flex:0 0 auto;min-width:44px;padding:3px 6px;border-radius:6px;background:#2b1212;color:#ff8a8a;font:600 12px var(--mono);text-align:center}
  .dt-formula{margin:0;color:var(--dt-m2);font-size:11px;line-height:1.55}.dt-formula code{color:#c9a98e;font:10.5px var(--mono)}
  .dt-kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(118px,1fr));gap:10px}
  .dt-kpi{padding:12px;border:1px solid var(--dt-b);border-radius:10px;background:var(--dt-s2)}.dt-kpi small{color:var(--dt-m2);font:600 9.5px var(--mono);letter-spacing:.08em;text-transform:uppercase}.dt-kpi b{display:block;margin:6px 0 2px;font-size:22px;letter-spacing:-.04em}.dt-kpi span{color:var(--dt-m);font-size:11px}
  .dt-langbar{display:flex;height:8px;margin:16px 0 10px;border-radius:99px;overflow:hidden;background:#222}.dt-langbar i{height:100%}
  .dt-legend{display:flex;flex-wrap:wrap;gap:6px 14px;color:var(--dt-m);font-size:11.5px}.dt-legend i{display:inline-block;width:8px;height:8px;margin-right:6px;border-radius:2px}.dt-legend em{color:var(--dt-m2);font-style:normal;font-family:var(--mono)}
  .dt-finding-mini{display:grid;grid-template-columns:auto 1fr;gap:3px 10px;width:100%;padding:10px 0;border:0;border-top:1px solid var(--dt-b);background:none;color:var(--dt-t);text-align:left;cursor:pointer}.dt-finding-mini:first-of-type{border-top:0}.dt-finding-mini b{font-size:12.5px}.dt-finding-mini small{grid-column:2;color:var(--dt-m);font-size:11.5px;line-height:1.4}.dt-finding-mini:hover b{color:#ffb15a}
  .dt-sev{display:inline-flex;align-items:center;height:19px;padding:0 7px;border:1px solid;border-radius:5px;font:600 9.5px var(--mono);letter-spacing:.04em;text-transform:uppercase;white-space:nowrap;background:none;cursor:default}
  button.dt-sev{cursor:pointer}.dt-sev-high{border-color:#5c2020;color:#ff8a8a;background:#1e0f0f}.dt-sev-medium{border-color:#5a4214;color:#ffcf7a;background:#1c160b}.dt-sev-low{border-color:#2f3a4a;color:#9cc2ff;background:#0f141b}.dt-sev-ok{border-color:#1f3a28;color:#9be0b3}
  .dt-kinds{display:flex;flex-wrap:wrap;gap:8px}.dt-kinds.wide{align-items:stretch;margin-bottom:12px}
  .dt-kind{min-width:88px;padding:10px 12px;border:1px solid var(--dt-b);border-radius:10px;background:var(--dt-s2);color:var(--dt-t);text-align:left;cursor:pointer;transition:.15s}.dt-kind b{display:block;font-size:20px;letter-spacing:-.04em}.dt-kind span{color:var(--dt-m);font-size:11px}.dt-kind:hover,.dt-kind.on{border-color:var(--dt-accent);background:#1d1611}
  .dt-kind-note{display:flex;gap:6px;align-items:center;margin-left:auto;flex-wrap:wrap}
  .dt-chips{display:flex;flex-wrap:wrap;gap:6px;margin-top:10px}
  .dt-chip{display:inline-flex;align-items:center;gap:6px;padding:4px 9px;border:1px solid var(--dt-b);border-radius:99px;background:var(--dt-s2);color:var(--dt-m);font:11px var(--mono);cursor:pointer}.dt-chip em{color:var(--dt-m2);font-style:normal}.dt-chip.v{border-color:#3d3160;color:#cbb8ff}.dt-chip.on{border-color:#7b4119;color:#ffb15a}.dt-chip button{border:0;background:none;color:inherit;cursor:pointer;font-size:14px;line-height:1}
  .dt-rank{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:6px 0}.dt-rank>span:last-child{display:flex;align-items:center;gap:8px;flex:0 0 42%}.dt-rank em{min-width:34px;color:var(--dt-m);font:11px var(--mono);font-style:normal;text-align:right}
  .dt-bar{display:inline-block;flex:1;min-width:40px;height:6px;border-radius:99px;background:#252525;overflow:hidden;vertical-align:middle}.dt-bar i{display:block;height:100%;border-radius:inherit}
  td .dt-bar{width:60px;flex:none;margin-right:8px}td em{color:var(--dt-m);font:11px var(--mono);font-style:normal}
  .dt-link{max-width:100%;padding:0;border:0;background:none;color:#e9c2a1;font:11.5px var(--mono);text-align:left;cursor:pointer;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.dt-link:hover{color:#ffb15a;text-decoration:underline}
  .dt-card .dt-link{display:block}.dt-rank .dt-link,.dt-row .dt-link,td .dt-link,small .dt-link{display:inline}
  .dt-spark{display:flex;align-items:flex-end;gap:3px;height:90px}.dt-spark.tall{height:150px}.dt-spark i{flex:1;min-width:3px;border-radius:3px 3px 0 0;background:linear-gradient(#ff8a1a,#8a3a0a)}.dt-spark i:hover{background:#ffb15a}
  .dt-spark-axis{display:flex;justify-content:space-between;margin-top:6px;color:var(--dt-m2);font:10px var(--mono)}
  .dt-table{width:100%;border-collapse:collapse;font-size:12.5px}.dt-table th{padding:0 10px 9px;border-bottom:1px solid var(--dt-b);color:var(--dt-m2);font:500 10px var(--mono);letter-spacing:.05em;text-align:left;text-transform:uppercase;white-space:nowrap;cursor:default}
  .dt-table th[data-act]{cursor:pointer}.dt-table th.asc::after{content:" ↑";color:var(--dt-accent)}.dt-table th.desc::after{content:" ↓";color:var(--dt-accent)}
  .dt-table td{padding:9px 10px;border-bottom:1px solid #202020;white-space:nowrap}.dt-table tbody tr[data-act]{cursor:pointer}.dt-table tbody tr:hover{background:#181818}.dt-table.dt-compact td{padding:7px 8px}
  .dt-scroll{max-height:520px;overflow:auto}.dt-scroll.tall{max-height:640px}
  .dt-toolbar{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-bottom:12px}
  .dt-input,.dt-select{height:34px;padding:0 11px;border:1px solid var(--dt-b);border-radius:8px;outline:0;background:#0f0f0f;color:var(--dt-t);font:12.5px Inter,system-ui,sans-serif}.dt-input:focus,.dt-select:focus{border-color:#8d4918}.dt-input.grow{flex:1;min-width:200px}
  .dt-field{display:flex;align-items:center;gap:7px;color:var(--dt-m);font-size:12px}.dt-check{display:flex;align-items:center;gap:6px;color:var(--dt-m);font-size:12px;cursor:pointer}.dt-check input{accent-color:var(--dt-accent)}
  .dt-seg{display:inline-flex;padding:3px;border:1px solid var(--dt-b);border-radius:9px;background:#0f0f0f}.dt-seg button{padding:6px 11px;border:0;border-radius:6px;background:none;color:var(--dt-m);font:600 12px Inter,system-ui;cursor:pointer}.dt-seg button.on{background:#21130a;color:#ffb15a}.dt-seg.small{margin-bottom:12px}.dt-seg.small button{font-size:11px}
  .dt-menu{position:relative}.dt-menu>div{position:absolute;right:0;top:38px;z-index:8;display:none;min-width:150px;padding:5px;border:1px solid var(--dt-b2);border-radius:9px;background:var(--dt-s2);box-shadow:0 14px 40px #000a}.dt-menu:hover>div,.dt-menu:focus-within>div{display:grid}.dt-menu>div button{padding:8px 10px;border:0;border-radius:6px;background:none;color:var(--dt-t);text-align:left;font-size:12px;cursor:pointer}.dt-menu>div button:hover{background:#262626}
  .dt-map-wrap{display:flex;flex-direction:column;border:1px solid var(--dt-b);border-radius:13px;background:var(--dt-s1);overflow:hidden}
  .dt-map-wrap>.dt-toolbar{margin:0;padding:10px 12px;border-bottom:1px solid var(--dt-b)}.dt-map-search{width:150px}
  .dt-map-main{display:grid;grid-template-columns:minmax(0,1fr) 330px;height:min(74vh,820px)}
  .dt-canvas{position:relative;overflow:hidden;background:radial-gradient(circle at 1px 1px,#ffffff0d 1px,transparent 0) 0 0/24px 24px,#0c0c0c;cursor:grab;outline:0;touch-action:none}.dt-canvas.panning{cursor:grabbing}.dt-canvas .dt-empty{position:absolute;inset:50% auto auto 50%;transform:translate(-50%,-50%);width:min(440px,90%);background:#0f0f0f}
  .dt-svg{width:100%;height:100%;user-select:none}
  .dt-node{cursor:pointer}.dt-node-bg{fill:#171513;stroke:#3a2d22;stroke-width:1;transition:stroke .15s}.dt-node:hover .dt-node-bg{stroke:#8d4918}
  .dt-node.k-clients .dt-node-bg{fill:#241407;stroke:#7b4119}.dt-node.k-external .dt-node-bg{fill:#17131f;stroke:#3d3160}.dt-node.ghost .dt-node-bg{fill:#0e0e0e;stroke:#292929;stroke-dasharray:4 3}.dt-node.k-file .dt-node-bg{fill:#141414}
  .dt-node-title{fill:#f7f7f5;font:600 12.5px Inter,system-ui,sans-serif}.dt-node-sub{fill:#8f8f8f;font:10px "JetBrains Mono",ui-monospace,monospace}
  .dt-badge rect{fill:#2a1a0e;stroke:#6b3614}.dt-badge text{fill:#ffb15a;font:600 9px "JetBrains Mono",ui-monospace,monospace;text-anchor:middle}
  .dt-edge{fill:none;opacity:.55;transition:opacity .15s}.e-imp{stroke:#5d5d5d}.e-req{stroke:#ff6b00;opacity:.75}.e-cyc{stroke:#ef5350;opacity:.8}.e-use{stroke:#b69cff;stroke-dasharray:5 5}
  .m-e-imp{fill:#5d5d5d}.m-e-req{fill:#ff6b00}.m-e-cyc{fill:#ef5350}.m-e-use{fill:#b69cff}
  .has-sel .dt-node:not(.lit){opacity:.18}.has-sel .dt-edge:not(.lit){opacity:.05}.has-sel .dt-edge.lit{opacity:.95}.dt-node.sel .dt-node-bg{stroke:#ff6b00;stroke-width:2}.dt-node.lit .dt-node-bg{stroke:#8d4918}
  .has-q .dt-node:not(.match){opacity:.25}.dt-node.match .dt-node-bg{stroke:#f6ad55;stroke-width:2}
  .e-req{stroke-dasharray:6 6;animation:dt-flow 1.2s linear infinite}@keyframes dt-flow{to{stroke-dashoffset:-24}}
  .dt-inspector{padding:16px;border-left:1px solid var(--dt-b);background:#101010;overflow:auto}
  .dt-inspector h3{margin:6px 0 2px;font-size:18px;letter-spacing:-.03em;word-break:break-word}.dt-inspector h4{margin:16px 0 7px;color:var(--dt-m);font:600 10px var(--mono);letter-spacing:.08em;text-transform:uppercase}.dt-inspector .dt-link{display:block;padding:3px 0}
  .dt-path{margin:0 0 12px;color:var(--dt-m2);font:10.5px var(--mono);word-break:break-all}
  .dt-mgrid{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin:10px 0}.dt-mgrid div{padding:7px;border:1px solid var(--dt-b);border-radius:7px;background:var(--dt-s2)}.dt-mgrid small{display:block;color:var(--dt-m2);font:600 9px var(--mono);text-transform:uppercase}.dt-mgrid b{display:block;margin-top:2px;font:600 13px var(--mono);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .dt-insp-link{display:flex;justify-content:space-between;width:100%;padding:6px 8px;border:0;border-radius:6px;background:none;color:#e9c2a1;font:11.5px var(--mono);cursor:pointer}.dt-insp-link:hover{background:#1c1c1c}.dt-insp-link em{color:var(--dt-m2);font-style:normal}
  .dt-insp-route{display:flex;gap:8px;align-items:center;padding:3px 0;font:11.5px var(--mono);overflow:hidden;white-space:nowrap}.dt-insp-group{margin:8px 0}.dt-insp-group b{display:block;margin-bottom:3px;font-size:12px}
  .dt-insp-actions{display:flex;flex-wrap:wrap;gap:7px;margin-top:18px}.dt-insp-empty h3{margin:8px 0}.dt-insp-empty p{color:var(--dt-m);font-size:12.5px;line-height:1.55}
  .dt-zone{padding:1px 6px;border-radius:4px;background:#2b1212;color:#ff9c8a;font:600 10px var(--mono)}
  .dt-map-legend{display:flex;flex-wrap:wrap;gap:6px 18px;padding:9px 14px;border-top:1px solid var(--dt-b);color:var(--dt-m);font-size:11px}.dt-map-legend i{display:inline-block;width:18px;height:0;margin-right:6px;vertical-align:middle;border-top:2px solid}.l-req{border-color:#ff6b00!important;border-top-style:dashed!important}.l-imp{border-color:#6a6a6a!important}.l-cyc{border-color:#ef5350!important}.l-use{border-color:#b69cff!important;border-top-style:dotted!important}.dt-hint{margin-left:auto;color:var(--dt-m2)}
  .dt-m{display:inline-grid;place-items:center;min-width:52px;height:20px;padding:0 5px;border-radius:5px;font:700 9.5px var(--mono);letter-spacing:.03em;flex:0 0 auto}
  .dt-m-get{background:#0f2a1a;color:#6fe39b}.dt-m-post{background:#10213a;color:#7cc4ff}.dt-m-put{background:#2d2310;color:#ffc867}.dt-m-del{background:#321212;color:#ff8a8a}.dt-m-any{background:#232323;color:#bbb}.dt-m-page{background:#241407;color:#ffb15a}.dt-m-evt{background:#1f1630;color:#cbb8ff}.dt-m-job{background:#12282b;color:#7fe0e6}.dt-m-rpc{background:#2a1428;color:#f59ae8}
  .dt-param{color:#f6ad55;font-style:normal}
  .dt-split{display:grid;grid-template-columns:minmax(0,1fr) 400px;gap:16px;align-items:start}
  .dt-count{margin-bottom:8px;color:var(--dt-m2);font:11px var(--mono)}
  .dt-rgroup{margin-bottom:12px;border:1px solid var(--dt-b);border-radius:11px;background:var(--dt-s1);overflow:hidden}.dt-rgroup h4{display:flex;justify-content:space-between;margin:0;padding:9px 14px;border-bottom:1px solid var(--dt-b);background:#141414;color:var(--dt-m);font:600 11px var(--mono)}.dt-rgroup h4 em{color:var(--dt-m2);font-style:normal}
  .dt-route{display:flex;align-items:center;gap:12px;width:100%;padding:8px 14px;border:0;border-top:1px solid #1d1d1d;background:none;color:var(--dt-t);text-align:left;cursor:pointer}.dt-rgroup .dt-route:first-of-type{border-top:0}.dt-route:hover{background:#181818}.dt-route.on{background:#1f150d;box-shadow:inset 3px 0 var(--dt-accent)}
  .dt-route.slim{padding:5px 0;border:0;background:none}.dt-route-path{flex:1 1 auto;min-width:0;overflow:hidden;font:12.5px var(--mono);text-overflow:ellipsis;white-space:nowrap}
  .dt-route-meta{display:flex;flex:0 1 auto;justify-content:flex-end;align-items:center;gap:8px;min-width:0;max-width:48%;overflow:hidden;color:var(--dt-m2)}.dt-route-meta small{min-width:0;overflow:hidden;font-size:11px;text-overflow:ellipsis;white-space:nowrap}.dt-route-meta code{color:var(--dt-m2);font:10.5px var(--mono);white-space:nowrap}
  .dt-lock{font-style:normal;font-size:11px}.dt-reach{padding:1px 6px;border:1px solid #3d3160;border-radius:4px;color:#cbb8ff;font:9.5px var(--mono);font-style:normal;white-space:nowrap}
  .dt-drawer{position:sticky;top:64px;max-height:calc(100vh - 90px);padding:16px;border:1px solid var(--dt-b);border-radius:13px;background:var(--dt-s1);overflow:auto}
  .dt-route-title{display:flex;align-items:center;gap:10px;margin:10px 0;font:600 15px var(--mono);word-break:break-all}
  .dt-pipe{display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin:14px 0}.dt-pipe-step{position:relative;padding:5px 9px;border:1px solid var(--dt-b2);border-radius:6px;background:var(--dt-s2);color:var(--dt-m);font:10.5px var(--mono)}.dt-pipe-step+.dt-pipe-step::before{content:"→";position:absolute;left:-11px;color:var(--dt-m2)}.dt-pipe-step{margin-left:6px}.dt-pipe-step:first-child{margin-left:0}.dt-pipe-step.g{border-color:#5a4214;color:#ffcf7a}.dt-pipe-step.h{border-color:#7b4119;color:#ffb15a}.dt-pipe-step.x{border-color:#3d3160;color:#cbb8ff}
  .dt-curl{margin:12px 0;padding:12px;border:1px solid var(--dt-b);border-radius:10px;background:#0e0e0e}.dt-curl small{color:var(--dt-m2);font:600 9.5px var(--mono);text-transform:uppercase}.dt-curl .dt-input{width:100%;margin:5px 0 10px}.dt-curl pre{margin:0 0 10px;color:#e9c2a1;font:11px/1.5 var(--mono);white-space:pre-wrap;word-break:break-all}
  .dt-snippet{margin-top:14px}
  .dt-code{margin:0;padding:10px 0;border:1px solid var(--dt-b);border-radius:9px;background:#0c0c0c;font:11.5px/1.62 var(--mono);overflow:auto;counter-reset:l}.dt-code span{display:block;padding-right:14px;white-space:pre}.dt-code span.hl{background:#2a1a0e;box-shadow:inset 3px 0 var(--dt-accent)}.dt-code em{display:inline-block;width:46px;padding-right:12px;color:#4a4a4a;font-style:normal;text-align:right;user-select:none}
  .dt-code .k{color:#ff9e64;font-weight:500}.dt-code .s{color:#9ece6a;font-style:normal}.dt-code .c{color:#5c6370;font-style:italic}.dt-code .n{color:#e0af68;font-style:normal}.dt-code .a{color:#bb9af7;font-style:normal}
  .dt-row{display:flex;flex-wrap:wrap;align-items:center;gap:6px 10px;padding:9px 0;border-top:1px solid #1f1f1f;font-size:12.5px}.dt-row:first-child{border-top:0}.dt-row small{flex-basis:100%;color:var(--dt-m);font-size:11.5px}.dt-row b{font-size:12.5px}
  .dt-path-code{font:12px var(--mono);color:#e5e5e5}
  .dt-chart{display:block;width:100%;max-width:420px;margin:0 auto}.dt-chart.wide{max-width:none}.dt-axis{stroke:#3a3a3a}.dt-diag{stroke:#ff6b00;stroke-dasharray:4 4;opacity:.7}.dt-zone-pain{fill:#ef535010}.dt-zone-use{fill:#b69cff10}.dt-zone-label{fill:#8a6060;font:10px var(--mono)}.dt-zone-label.end{text-anchor:end}.dt-axis-label{fill:#777;font:10px var(--mono);text-anchor:middle}.dt-dot{stroke:#050505;stroke-width:1.5;opacity:.9;cursor:pointer}.dt-dot:hover{opacity:1;stroke:#fff}.dt-dot-label{fill:#c9c9c9;font:10px var(--mono);pointer-events:none}
  .dt-dsm{border-collapse:collapse;font:11px var(--mono)}.dt-dsm th{padding:4px 8px;color:var(--dt-m);font-weight:500;text-align:left;white-space:nowrap}.dt-dsm thead th{text-align:center}.dt-dsm th span{display:inline-block;min-width:18px;margin-right:6px;color:var(--dt-m2)}.dt-dsm td{width:30px;min-width:30px;height:28px;border:1px solid #1d1d1d;background:rgba(255,106,0,var(--a,0));color:#fff;text-align:center}.dt-dsm td.self{background:#222}.dt-dsm td.mutual{background:rgba(255,92,92,var(--a,.4));outline:1px solid #ef5350}
  .dt-pre{margin:10px 0 0;padding:12px;border:1px solid var(--dt-b);border-radius:9px;background:#0c0c0c;color:#c9a98e;font:11.5px/1.55 var(--mono);overflow:auto}
  .dt-cycle{padding:14px 0;border-top:1px solid var(--dt-b)}.dt-cycle:first-child{border-top:0;padding-top:0}.dt-cycle header{display:flex;gap:10px;align-items:center;margin-bottom:10px;color:var(--dt-m);font-size:12px}.dt-cycle header b{color:var(--dt-t)}.dt-cycle header .dt-sev{margin-left:auto}.dt-cycle details{margin:10px 0;color:var(--dt-m);font-size:12px}.dt-cycle summary{cursor:pointer;margin-bottom:6px}
  .dt-loop{display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin-bottom:10px}.dt-loop-node{padding:5px 9px;border:1px solid #5c2020;border-radius:6px;background:#1e0f0f;color:#ffb3b3;font:11px var(--mono);cursor:pointer}.dt-loop-node:hover{border-color:#ef5350}.dt-arrow{color:#ef5350}
  .dt-steps{margin:0;padding-left:18px;color:var(--dt-m);font-size:12.5px;line-height:1.65}.dt-steps b{color:var(--dt-t)}
  .dt-int-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:10px}
  .dt-int{padding:12px;border:1px solid var(--dt-b);border-radius:10px;background:var(--dt-s2)}.dt-int header{display:flex;gap:10px;align-items:center}.dt-int header div{flex:1;min-width:0}.dt-int header b{display:block;font-size:13px}.dt-int header small{color:var(--dt-m2);font:10px var(--mono);text-transform:uppercase}.dt-int header em{color:var(--dt-m);font:11px var(--mono);font-style:normal}.dt-int details{margin-top:8px;color:var(--dt-m);font-size:11.5px}.dt-int summary{cursor:pointer}
  .dt-int-icon{display:grid;place-items:center;width:32px;height:32px;border-radius:8px;background:#2a1a0e;color:#ffb15a;font:700 14px var(--mono)}.c-database{background:#0f2a1a;color:#6fe39b}.c-messaging{background:#1f1630;color:#cbb8ff}.c-cache{background:#321212;color:#ff8a8a}.c-cloud{background:#10213a;color:#7cc4ff}.c-observability{background:#12282b;color:#7fe0e6}.c-ai{background:#2a1428;color:#f59ae8}.c-security{background:#2d2310;color:#ffc867}
  .dt-person{font-size:12.5px}
  .dt-tag{padding:2px 6px;border-radius:4px;background:#232323;color:#ccc;font:600 9.5px var(--mono)}.t-fixme,.t-bug{background:#321212;color:#ff8a8a}.t-hack,.t-xxx{background:#2d2310;color:#ffc867}.t-todo{background:#10213a;color:#7cc4ff}.t-deprecated{background:#232323;color:#999}
  .dt-debt-text{flex:1;min-width:0;color:#ddd;font-size:12px}
  .dt-finding{margin-bottom:10px;padding:16px;border:1px solid var(--dt-b);border-radius:12px;background:var(--dt-s1);transition:border-color .3s}.dt-finding.flash{border-color:var(--dt-accent)}.dt-finding header{display:flex;flex-wrap:wrap;align-items:center;gap:8px}.dt-finding h3{flex-basis:100%;margin:8px 0 0;font-size:14px}.dt-finding p{margin:8px 0;color:var(--dt-m);font-size:12.5px;line-height:1.55;word-break:break-word}.dt-cat{color:var(--dt-m2);font:10px var(--mono);text-transform:uppercase;letter-spacing:.06em}
  .dt-finding footer{display:flex;justify-content:space-between;gap:12px;align-items:center;margin-top:12px;padding-top:10px;border-top:1px solid #1f1f1f}.dt-action{color:#c9a98e;font-size:12px}
  .dt-overlay{position:fixed;inset:0;z-index:60;display:grid;place-items:center;padding:24px;background:#000b;backdrop-filter:blur(4px)}
  .dt-sheet{display:flex;flex-direction:column;width:min(1180px,100%);height:min(88vh,1000px);border:1px solid var(--dt-b2);border-radius:14px;background:#0f0f0f;box-shadow:0 30px 90px #000;overflow:hidden;color:#f7f7f5;--mono:"JetBrains Mono",ui-monospace,monospace;--dt-b:#292929;--dt-b2:#363636;--dt-s2:#151515;--dt-m:#9b9b96;--dt-m2:#777;--dt-t:#f7f7f5;--dt-accent:#ff6b00}
  .dt-sheet>header{display:flex;justify-content:space-between;gap:16px;align-items:center;padding:14px 18px;border-bottom:1px solid var(--dt-b)}.dt-sheet h3{margin:4px 0 0;font:600 14px var(--mono);word-break:break-all}.dt-sheet h3 em{color:var(--dt-accent);font-style:normal}.dt-sheet-actions{display:flex;gap:7px;flex-wrap:wrap;justify-content:flex-end}
  .dt-sheet-meta{padding:0 18px}.dt-sheet-meta .dt-mgrid{grid-template-columns:repeat(8,1fr)}
  .dt-sheet-body{flex:1;min-height:0;padding:0 18px 18px}.dt-sheet-cols{display:grid;grid-template-columns:minmax(0,1fr) 280px;gap:16px;height:100%}.dt-code.full{height:100%}.dt-sheet-cols aside{overflow:auto}.dt-sheet-cols aside h4{margin:4px 0 8px;color:var(--dt-m);font:600 10px var(--mono);letter-spacing:.08em;text-transform:uppercase}.dt-sheet-cols aside .dt-link{display:block;padding:3px 0}
  .dt-pal{width:min(680px,100%);align-self:start;margin-top:10vh;border:1px solid #3a2d22;border-radius:14px;background:#111;box-shadow:0 30px 90px #000;overflow:hidden}
  .dt-pal-input{width:100%;height:56px;padding:0 20px;border:0;border-bottom:1px solid #292929;outline:0;background:none;color:#f7f7f5;font:15px Inter,system-ui,sans-serif}
  .dt-pal-list{max-height:52vh;padding:6px;overflow:auto}.dt-pal-item{display:flex;align-items:center;gap:12px;width:100%;padding:9px 12px;border:0;border-radius:8px;background:none;color:#e5e5e5;text-align:left;cursor:pointer}.dt-pal-item.on{background:#21130a}.dt-pal-icon{width:18px;color:#ff6b00;text-align:center}.dt-pal-label{flex:1;min-width:0;overflow:hidden;font:12.5px "JetBrains Mono",ui-monospace,monospace;text-overflow:ellipsis;white-space:nowrap}.dt-pal-kind{color:#777;font-size:11px;white-space:nowrap}.dt-pal-kind em{margin-left:6px;padding:1px 6px;border:1px solid #333;border-radius:4px;font-style:normal}.dt-pal-empty{padding:24px;color:#777;text-align:center}
  .dt-pal footer{display:flex;gap:16px;padding:9px 16px;border-top:1px solid #292929;color:#777;font-size:11px}
  .dt-toast{position:fixed;left:50%;bottom:28px;z-index:80;transform:translateX(-50%);padding:11px 16px;border:1px solid #7b4119;border-radius:10px;background:#1a120c;color:#ffd2ad;box-shadow:0 14px 40px #000a;font:600 12.5px Inter,system-ui;transition:opacity .4s,transform .4s}.dt-toast-warn{border-color:#5c2020;background:#1e0f0f;color:#ffb3b3}.dt-toast.out{opacity:0;transform:translate(-50%,10px)}
  .dt-loading{display:grid;place-items:center;gap:8px;padding:60px 20px;border:1px solid var(--dt-b);border-radius:13px;background:var(--dt-s1);text-align:center}.dt-loading p{max-width:440px;margin:0;color:var(--dt-m);font-size:13px}.dt-skel{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;width:min(620px,100%);margin-top:18px}.dt-skel i{height:64px;border-radius:10px;background:linear-gradient(90deg,#161616,#202020,#161616);background-size:200% 100%;animation:dt-shimmer 1.4s infinite}
  @keyframes dt-shimmer{to{background-position:-200% 0}}
  .dt-spin{display:inline-block;width:12px;height:12px;border:2px solid #444;border-top-color:var(--dt-accent,#ff6b00);border-radius:50%;animation:dt-rot .7s linear infinite}.dt-spin.big{width:28px;height:28px;border-width:3px}@keyframes dt-rot{to{transform:rotate(360deg)}}
  @media(max-width:1250px){.dt-grid-over{grid-template-columns:repeat(2,minmax(0,1fr))}.dt-grid-3{grid-template-columns:repeat(2,minmax(0,1fr))}.dt-split{grid-template-columns:minmax(0,1fr) 340px}}
  @media(max-width:980px){.dt-grid-2,.dt-grid-3,.dt-grid-over,.dt-grid-coupling{grid-template-columns:minmax(0,1fr)}.dt-grid-over>.dt-card:first-child{grid-row:auto}.dt-split{grid-template-columns:minmax(0,1fr)}.dt-drawer{position:static;max-height:none}.dt-map-main{grid-template-columns:minmax(0,1fr);grid-template-rows:62vh auto;height:auto}.dt-inspector{border-left:0;border-top:1px solid var(--dt-b)}.dt-sheet-cols{grid-template-columns:minmax(0,1fr)}.dt-sheet-cols aside{display:none}.dt-sheet-meta .dt-mgrid{grid-template-columns:repeat(4,1fr)}.dt-hint{display:none}}
  @media(max-width:640px){.dt-head{align-items:flex-start}.dt-head-side{width:100%}.dt-head-side .dt-btn{flex:1;justify-content:center}.dt-route-meta small,.dt-route-meta code{display:none}.dt-mgrid{grid-template-columns:repeat(2,1fr)}.dt-overlay{padding:8px}.dt-sheet{height:94vh}.dt-card{padding:14px}.dt-map-search{width:100%}}
  `;
  document.head.append(style);
})();
