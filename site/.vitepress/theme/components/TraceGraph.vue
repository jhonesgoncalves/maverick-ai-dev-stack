<template>
  <div class="mv-widget">
    <div class="mv-widget-head">
      <span class="mv-kicker">TRY IT · TRACEABILITY</span>
      <small class="mv-widget-hint">Hover a node to follow its chain. Break a link to see what <code>maverick validate</code> reports.</small>
    </div>
    <div class="mv-trace-scroll">
      <svg class="mv-trace" viewBox="0 0 720 300" role="img" aria-label="User stories trace to acceptance criteria, tests and tasks">
        <text v-for="(column, index) in COLUMNS" :key="column" :x="X[index]" y="18" class="mv-trace-col">{{ column }}</text>
        <path v-for="edge in edges" :key="edge.key" :d="curve(edge)" class="mv-trace-edge" :class="{ hot: chain.has(edge.from) && chain.has(edge.to) }" />
        <g v-for="node in NODES" :key="node.id" class="mv-trace-node" :class="{ hot: chain.has(node.id), orphan: orphans.has(node.id) }" :transform="`translate(${node.x - 52}, ${node.y - 15})`" tabindex="0" @mouseenter="active = node.id" @mouseleave="active = null" @focus="active = node.id" @blur="active = null">
          <rect width="104" height="30" rx="8" />
          <text x="52" y="19">{{ node.id }}</text>
        </g>
      </svg>
    </div>
    <div class="mv-trace-break">
      <span class="mv-label">BREAK A LINK</span>
      <label v-for="toggle in TOGGLES" :key="toggle.id"><input v-model="broken" type="checkbox" :value="toggle.id" /> {{ toggle.label }}</label>
    </div>
    <pre class="mv-widget-out"><span class="cmd">$ maverick validate add-orders-pagination --strict</span>
<template v-if="!findings.length"><span class="ok">✓ PRD, TECHSPEC and tasks are valid</span></template><template v-else><span v-for="finding in findings" :key="finding" class="bad">✕ {{ finding }}
</span><span class="muted">{{ findings.length }} finding(s): fix the plan before you build</span></template></pre>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue';

// Every acceptance criterion needs a test in the TECHSPEC Test Plan and a task that covers it;
// these are the "Test Plan" and "Tasks" checks of `maverick validate`.
const COLUMNS = ['USER STORY', 'CRITERION', 'TEST', 'TASK'];
const X = [70, 250, 430, 620];
const column = (ids, x, top, gap) => ids.map((id, index) => ({ id, x, y: top + index * gap }));
const NODES = [
  ...column(['US-01', 'US-02'], X[0], 92, 130),
  ...column(['AC-01', 'AC-02', 'AC-03', 'AC-04'], X[1], 60, 65),
  ...column(['UT-01', 'UT-02', 'IT-03', 'UT-04'], X[2], 60, 65),
  ...column(['task_01', 'task_02', 'task_03'], X[3], 80, 85)
];
const at = Object.fromEntries(NODES.map(node => [node.id, node]));
const LINKS = [
  ['US-01', 'AC-01'], ['US-01', 'AC-02'], ['US-02', 'AC-03'], ['US-02', 'AC-04'],
  ['AC-01', 'UT-01', 'test-1'], ['AC-02', 'UT-02', 'test-2'], ['AC-03', 'IT-03', 'test-3'], ['AC-04', 'UT-04', 'test-4'],
  ['AC-01', 'task_01', 'task-1'], ['AC-02', 'task_01'], ['AC-03', 'task_02'], ['AC-04', 'task_03', 'task-4']
];
const TOGGLES = [
  { id: 'test-3', label: 'Drop IT-03 from the Test Plan' },
  { id: 'task-4', label: 'Remove AC-04 from task_03' },
  { id: 'ghost', label: 'task_02 cites AC-05' }
];

const active = ref(null);
const broken = ref([]);
const edges = computed(() => LINKS.filter(([, , id]) => !broken.value.includes(id)).map(([from, to]) => ({ from, to, key: `${from}-${to}` })));
const walk = (start, forward) => {
  const seen = new Set(), queue = [start];
  while (queue.length) {
    const id = queue.shift();
    for (const { from, to } of edges.value) {
      const next = forward ? (from === id && to) : (to === id && from);
      if (next && !seen.has(next)) { seen.add(next); queue.push(next); }
    }
  }
  return seen;
};
// A node lights its ancestors and descendants, and every criterion in the chain lights its test and task.
const chain = computed(() => {
  if (!active.value) return new Set();
  const seen = new Set([active.value, ...walk(active.value, false), ...walk(active.value, true)]);
  for (const id of [...seen]) if (id.startsWith('AC')) walk(id, true).forEach(next => seen.add(next));
  return seen;
});
const findings = computed(() => {
  const list = [];
  for (const ac of ['AC-01', 'AC-02', 'AC-03', 'AC-04']) {
    if (!edges.value.some(edge => edge.from === ac && /^(UT|IT)/.test(edge.to))) list.push(`Test Plan: ${ac} has no test`);
    if (!edges.value.some(edge => edge.from === ac && edge.to.startsWith('task'))) list.push(`Tasks: ${ac} is covered by no task`);
  }
  if (broken.value.includes('ghost')) list.push('Tasks: task_02 references AC-05, which the PRD does not define');
  return list;
});
const orphans = computed(() => new Set(findings.value.map(finding => finding.match(/(AC-\d+|task_\d+)/)?.[1]).filter(Boolean)));
const curve = ({ from, to }) => { const a = at[from], b = at[to], mid = (a.x + b.x) / 2; return `M${a.x + 52},${a.y} C${mid},${a.y} ${mid},${b.y} ${b.x - 52},${b.y}`; };
</script>
