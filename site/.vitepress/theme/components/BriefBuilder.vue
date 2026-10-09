<template>
  <div class="mv-widget">
    <div class="mv-widget-head">
      <span class="mv-kicker">TRY IT · ACCEPTANCE CRITERION</span>
      <div class="mv-seg small">
        <button v-for="(example, key) in EXAMPLES" :key="key" type="button" :class="{ on: picked === key }" @click="load(key)">{{ example.label }}</button>
      </div>
    </div>
    <div class="mv-brief-form">
      <label v-for="field in FIELDS" :key="field"><span>{{ field }}</span><input v-model="ac[field]" type="text" :aria-label="field" /></label>
    </div>
    <pre class="mv-widget-out"><span class="muted">## Acceptance Criteria</span>
- [ ] AC-01: Given {{ ac.given || '…' }}, when {{ ac.when || '…' }}, then {{ ac.then || '…' }} (US-01)</pre>
    <ul class="mv-lint" aria-live="polite">
      <li v-for="finding in findings" :key="finding.text" :class="finding.level"><b>{{ finding.level === 'ok' ? '✓' : finding.level === 'warn' ? '!' : '✕' }}</b>{{ finding.text }}</li>
    </ul>
    <p class="mv-widget-verdict" :class="{ good: checkable }">{{ checkable ? 'Checkable: a test or a reviewer can say yes or no.' : 'Not checkable yet: a reviewer would have to guess.' }}</p>
  </div>
</template>

<script setup>
import { computed, reactive, ref } from 'vue';

// A small lint in the spirit of maverick-prd: an acceptance criterion names an observable outcome,
// not an implementation, and it is precise enough that a test can decide it.
const FIELDS = ['given', 'when', 'then'];
const EXAMPLES = {
  vague: { label: 'Vague', given: 'the orders list', when: 'there are many orders', then: 'it should load fast and work properly' },
  impl: { label: 'Implementation', given: 'the orders service', when: 'we refactor it', then: 'use a Redis cache and add an index on created_at' },
  good: { label: 'Checkable', given: '3 orders', when: 'a client requests limit=2', then: 'it receives 2 orders and a nextCursor' }
};
const VAGUE = /\b(fast|quick|properly|correctly|better|nice|user[- ]friendly|intuitive|robust|efficient|seamless|easy|etc)\b/i;
const IMPLEMENTATION = /\b(redis|cache|index|table|column|class|function|method|refactor|library|framework|implement|sql|orm|hook|service)\b/i;
const OBSERVABLE = /\b(\d+|receives?|returns?|sees?|shows?|displays?|responds?|status|error|rejects?|redirects?|emails?|is|are|contains?)\b/i;

const picked = ref('vague');
const ac = reactive({ ...EXAMPLES.vague });
function load(key) { picked.value = key; Object.assign(ac, EXAMPLES[key]); }

const findings = computed(() => {
  const list = [];
  for (const field of FIELDS) if (!ac[field].trim()) list.push({ level: 'fail', text: `"${field}" is empty: Given, when and then are all required.` });
  const match = ac.then.match(VAGUE);
  if (match) list.push({ level: 'fail', text: `"${match[0]}" cannot be tested. Name a number, a status or a visible result.` });
  const impl = ac.then.match(IMPLEMENTATION) || ac.when.match(IMPLEMENTATION);
  if (impl) list.push({ level: 'warn', text: `"${impl[0]}" describes how, not what. Move it to TECHSPEC.md and keep the outcome here.` });
  if (ac.then.trim() && !OBSERVABLE.test(ac.then)) list.push({ level: 'warn', text: 'The "then" has no observable result someone could check.' });
  if (!/\d/.test(`${ac.given} ${ac.when} ${ac.then}`)) list.push({ level: 'warn', text: 'No concrete value. Examples with numbers make edge cases visible.' });
  if (!list.length) list.push({ level: 'ok', text: 'Observable, concrete and free of implementation detail.' });
  return list;
});
const checkable = computed(() => !findings.value.some(finding => finding.level !== 'ok'));
</script>
