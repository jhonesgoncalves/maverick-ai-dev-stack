<template>
  <nav class="mv-cmap" aria-label="Where each concept lives in the pipeline">
    <ol class="mv-cmap-rail">
      <li v-for="stage in STAGES" :key="stage.id" :class="{ lit: lit.has(stage.id), gate: GATES.has(stage.id) && focus === 'human-in-the-loop', dim: lit.size && !lit.has(stage.id) }">
        <span class="mv-cmap-stage">{{ stage.id }}</span>
        <small>{{ stage.note }}</small>
        <i v-if="GATES.has(stage.id)" class="mv-cmap-diamond" title="Human gate">◆</i>
      </li>
    </ol>
    <div class="mv-cmap-ground" :class="{ lit: focus === 'context-engineering' }">
      <span>CONTEXT</span> grounding from <code>maverick new</code> feeds every stage
    </div>
    <div class="mv-cmap-chips" role="list">
      <a v-for="concept in CONCEPTS" :key="concept.id" role="listitem" :href="withBase(`/concepts/${concept.id}`)" :class="{ on: concept.id === focus }" @mouseenter="hover = concept.id" @mouseleave="hover = null" @focus="hover = concept.id" @blur="hover = null">
        <b>{{ concept.title }}</b><span>{{ concept.question }}</span>
      </a>
    </div>
  </nav>
</template>

<script setup>
import { computed, ref } from 'vue';
import { withBase } from 'vitepress';

// Each concept owns part of the pipeline; hovering a chip previews which stages it covers.
const props = defineProps({ current: { type: String, default: '' } });
const STAGES = [
  { id: 'prd', note: 'what & why' }, { id: 'spec', note: 'spec-driven' }, { id: 'techspec', note: 'how, here' }, { id: 'tasks', note: 'graph' },
  { id: 'build', note: 'one subtask' }, { id: 'verify', note: 'evidence' }, { id: 'security', note: 'strict' }, { id: 'review', note: 'decision' }, { id: 'pr', note: 'rationale' }
];
const GATES = new Set(['spec', 'build', 'review', 'pr']);
const CONCEPTS = [
  { id: 'context-engineering', title: 'Context engineering', question: 'What does the agent need to see?', stages: STAGES.map(stage => stage.id) },
  { id: 'brief', title: 'Task brief', question: 'What changes, and how do we know?', stages: ['prd', 'spec'] },
  { id: 'planning', title: 'Planning', question: 'How is it built here, in what order?', stages: ['techspec', 'tasks'] },
  { id: 'verification', title: 'Verification', question: 'Where is the proof it works?', stages: ['build', 'verify', 'security'] },
  { id: 'review', title: 'Review', question: 'Does the diff do what was promised?', stages: ['review', 'pr'] },
  { id: 'human-in-the-loop', title: 'Human in the loop', question: 'Who decides, and with what power?', stages: ['spec', 'build', 'review', 'pr'] }
];
const hover = ref(null);
const focus = computed(() => hover.value || props.current);
const lit = computed(() => new Set(CONCEPTS.find(concept => concept.id === focus.value)?.stages || []));
</script>
