<template>
  <div class="mv-picker">
    <div class="mv-picker-form">
      <fieldset>
        <legend>Your idea</legend>
        <input v-model="idea" type="text" aria-label="Your idea" placeholder="Add pagination to the orders API" />
      </fieldset>
      <fieldset v-for="question in questions" :key="question.key">
        <legend>{{ question.label }}</legend>
        <div class="mv-seg small">
          <button v-for="option in question.options" :key="option.value" type="button" :class="{ on: answers[question.key] === option.value }" :aria-pressed="answers[question.key] === option.value" @click="answers[question.key] = option.value">{{ option.label }}</button>
        </div>
      </fieldset>
    </div>
    <div class="mv-picker-result" aria-live="polite">
      <span class="mv-kicker">WORKFLOW</span>
      <h3>{{ workflow.name }}</h3>
      <p>{{ reason }}</p>
      <div class="mv-picker-artifacts">
        <span v-for="stage in workflow.stages" :key="stage" class="mv-label">{{ stage.toUpperCase() }}</span>
      </div>
      <CopyCommand :command="command" />
    </div>
  </div>
</template>

<script setup>
import { computed, reactive, ref } from 'vue';
import { presets } from '../../../../src/core/presets.js';
import CopyCommand from './CopyCommand.vue';

// Three workflows share one pipeline: strict adds a security gate, spec-driven adds an approved
// SPEC.md before the technical spec. `maverick new` also picks strict on its own when the idea
// mentions security, data, payments or migrations, and spec-driven for APIs and integrations.
const RISKY = new Set(['security', 'data', 'payment', 'migration', 'infrastructure']);
const CONTRACT = new Set(['api', 'integration']);
const questions = [
  { key: 'area', label: 'What does it touch?', options: [{ value: 'feature', label: 'Feature' }, { value: 'api', label: 'API / contract' }, { value: 'integration', label: 'Integration' }, { value: 'bugfix', label: 'Bug fix' }, { value: 'refactor', label: 'Refactor' }, { value: 'security', label: 'Security' }, { value: 'data', label: 'Data' }, { value: 'payment', label: 'Payments' }, { value: 'migration', label: 'Migration' }, { value: 'infrastructure', label: 'Shared infra' }] },
  { key: 'risk', label: 'How risky is it?', options: [{ value: 'low', label: 'Low' }, { value: 'medium', label: 'Medium' }, { value: 'high', label: 'High' }] }
];
const idea = ref('');
const answers = reactive({ area: 'feature', risk: 'medium' });
const strict = computed(() => RISKY.has(answers.area) || answers.risk === 'high');
const specDriven = computed(() => !strict.value && CONTRACT.has(answers.area));
const workflow = computed(() => presets[strict.value ? 'strict' : specDriven.value ? 'spec-driven' : 'standard']);
const reason = computed(() => `${workflow.value.description} Best for: ${workflow.value.bestFor.toLowerCase()}`);
const command = computed(() => {
  const text = (idea.value.trim() || 'Add pagination to the orders API').replace(/"/g, "'");
  return `npx maverick-ai-dev-stack new "${text}"${strict.value ? ' --strict' : specDriven.value ? ' --spec' : ''}`;
});
</script>
