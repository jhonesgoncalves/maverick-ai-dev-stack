<template>
  <div class="mv-showcase" @mouseenter="paused = true" @mouseleave="paused = false">
    <div class="mv-showcase-tabs" role="tablist" aria-label="Maverick Lens views">
      <button v-for="(view, index) in views" :key="view.src" role="tab" type="button" :aria-selected="index === active" :class="{ on: index === active }" @click="select(index)">
        <span class="mv-showcase-icon">{{ view.icon }}</span>{{ view.label }}
        <i v-if="index === active && !paused" class="mv-showcase-progress" :style="{ animationDuration: `${interval}ms` }" />
      </button>
    </div>
    <div class="mv-window mv-showcase-window">
      <div class="mv-window-bar">
        <span class="mv-dots"><i /><i /><i /></span>
        <span class="mv-window-url">127.0.0.1:4173{{ views[active].path }}</span>
        <span class="mv-window-badge">LOCAL</span>
      </div>
      <div class="mv-showcase-stage">
        <img v-for="(view, index) in views" :key="view.src" :src="withBase(`/screens/${view.src}.png`)" :alt="view.alt" :class="{ on: index === active }" :loading="index === 0 ? 'eager' : 'lazy'" decoding="async" width="1440" height="900" />
      </div>
    </div>
    <p class="mv-showcase-caption"><b>{{ views[active].label }}.</b> {{ views[active].copy }}</p>
  </div>
</template>

<script setup>
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { withBase } from 'vitepress';

const views = [
  { src: 'lens-inbox', label: 'Inbox', icon: '◎', path: '/#/inbox', alt: 'Lens Inbox with decisions waiting, key numbers and recent runs', copy: 'Approvals, failing gates and ready subtasks, most urgent first, each with its action beside it.' },
  { src: 'lens-subtasks', label: 'Task', icon: '▤', path: '/#/tasks/add-orders-pagination/subtasks', alt: 'Task page with the stage stepper, subtask dependency graph and next step', copy: 'The workflow stages, the subtask graph and one next step with the command behind it.' },
  { src: 'lens-gates', label: 'Gates', icon: '✓', path: '/#/tasks/fix-order-export/gates', alt: 'Ship flow gates with results and the pending human review', copy: 'Every gate of the ship flow with its last result, and the human decision that finishes it.' },
  { src: 'lens-runs', label: 'Agents', icon: '▶', path: '/#/runs?kind=agents', alt: 'An agent run with its streamed events, cost and transcript', copy: 'Headless agents within the permissions you allow, streamed live and recorded as transcripts.' },
  { src: 'devtools-route-detail', label: 'Entry points', icon: '⇢', path: '/#devtools/routes', alt: 'Entry point inspector with a ready-to-run curl', copy: 'Every route in any stack, what it reaches through imports, and a ready-to-run curl.' },
  { src: 'devtools-coupling', label: 'Coupling', icon: '⋈', path: '/#devtools/coupling', alt: 'Component coupling with Martin metrics and main sequence chart', copy: 'Martin metrics per component, the main sequence and a dependency structure matrix.' }
];
const interval = 5200;
const active = ref(0);
const paused = ref(false);
let timer;

function select(index) { active.value = index; restart(); }
function restart() {
  clearInterval(timer);
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  timer = setInterval(() => { if (!paused.value) active.value = (active.value + 1) % views.length; }, interval);
}
onMounted(restart);
onBeforeUnmount(() => clearInterval(timer));
</script>
