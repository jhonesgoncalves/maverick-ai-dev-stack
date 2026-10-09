// The codebase views (architecture map, entry points, hotspots, findings…) are the Devtools module,
// mounted inside the shell. It owns the `#devtools/<view>` part of the URL.
const NAMES = { overview: 'Overview', map: 'Architecture', routes: 'Entry points', coupling: 'Coupling', cycles: 'Cycles', hotspots: 'Hotspots', impact: 'Impact', integrations: 'Integrations', team: 'Team', debt: 'Debt', findings: 'Findings' };

export const title = ({ route }) => NAMES[route.view] || 'Codebase';
export const crumbs = ({ route }) => ['<a href="#devtools/overview">Codebase</a>', `<b>${NAMES[route.view] || 'Overview'}</b>`];
export const render = () => '<div class="devtools-host"><div id="devtools-root"></div></div>';
export function after() { if (typeof window.mountDevtools === 'function') window.mountDevtools(); }
