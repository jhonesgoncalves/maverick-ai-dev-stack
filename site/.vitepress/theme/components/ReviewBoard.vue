<template>
  <div class="mv-widget">
    <div class="mv-widget-head">
      <span class="mv-kicker">TRY IT · REVIEW.md → MERGE READINESS</span>
      <label class="mv-review-strict"><input v-model="strict" type="checkbox" /> Strict workflow</label>
    </div>
    <div class="mv-review-grid">
      <div class="mv-review-doc">
        <span class="mv-label">REVIEW.md</span>
        <template v-for="section in SECTIONS" :key="section.title">
          <h4>## {{ section.title }}</h4>
          <label v-for="item in section.items" :key="item"><input v-model="checked" type="checkbox" :value="item" /> {{ item }}</label>
        </template>
        <h4>## Decision</h4>
        <label v-for="option in DECISIONS" :key="option"><input v-model="decision" type="radio" name="mv-decision" :value="option" /> {{ option }}</label>
        <h4>## Human Explanation</h4>
        <textarea v-model="explanation" rows="2" aria-label="Human explanation" placeholder="In your own words, why this change is safe to merge." />
      </div>
      <div class="mv-review-side">
        <span class="mv-label">GATE REPORTS IN THE TASK FOLDER</span>
        <label v-for="file in required" :key="file" class="mv-review-file"><input v-model="reports" type="checkbox" :value="file" /> <code>{{ file }}</code></label>
        <div class="mv-review-status" :class="{ ready }">
          <small>$ maverick readiness add-orders-pagination</small>
          <b>{{ ready ? 'READY FOR HUMAN MERGE DECISION' : 'NOT READY' }}</b>
          <ul><li v-for="item in missing" :key="item">! {{ item }}</li></ul>
        </div>
        <div class="mv-review-status" :class="{ ready: approved }">
          <small>$ maverick flow run ship add-orders-pagination</small>
          <b>{{ approved ? 'human-review: approved' : decision === 'request changes' ? 'human-review: changes requested' : 'awaiting-approval' }}</b>
        </div>
        <p class="mv-review-note">{{ coverage }}</p>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue';

// Mirrors `maverick readiness`: every gate report must exist (plus CHECKPOINT.md when strict) and
// one decision box must be checked. The ship flow's approval gate accepts only an approval.
const SECTIONS = [
  { title: 'Acceptance Criteria', items: ['AC-01: Given 3 orders, when a client requests limit=2, then it receives 2 orders and a nextCursor.', 'AC-02: Given an invalid cursor, then it receives 400 invalid_cursor.'] },
  { title: 'Tasks', items: ['01 Keyset pagination in OrdersService (done)', '02 Reject invalid cursors and document the contract (done)'] },
  { title: 'Checks', items: ['Scope: the diff stays within TECHSPEC.md File References.', 'Tests: new behavior is tested, and no test was weakened to pass.', 'Security: inputs are validated, authorization is preserved, no secrets or PII.'] }
];
const DECISIONS = ['approve', 'approve with follow-up', 'request changes'];
const BASE = ['EVIDENCE.md', 'REVIEW-FINDINGS.md', 'SECURITY-REPORT.md', 'DEPENDENCY-REVIEW.md', 'SCOPE-GUARD.md'];

const strict = ref(false);
const checked = ref([]);
const decision = ref('');
const explanation = ref('');
const reports = ref([...BASE]);
const required = computed(() => (strict.value ? [...BASE, 'CHECKPOINT.md'] : BASE));
watch(strict, value => { if (!value) reports.value = reports.value.filter(file => file !== 'CHECKPOINT.md'); });

const missing = computed(() => [...required.value.filter(file => !reports.value.includes(file)), ...(decision.value ? [] : ['Human decision in REVIEW.md'])]);
const ready = computed(() => missing.value.length === 0);
const approved = computed(() => decision.value === 'approve' || decision.value === 'approve with follow-up');
const total = SECTIONS.reduce((sum, section) => sum + section.items.length, 0);
const coverage = computed(() => {
  if (approved.value && checked.value.length < total) return `You approved with ${total - checked.value.length} item(s) unchecked. Maverick records the decision, but the evidence behind it is yours to stand on.`;
  if (approved.value && !explanation.value.trim()) return 'Approved. Now explain it in your own words: if you cannot, you are approving the agent, not the change.';
  if (decision.value === 'request changes') return 'Readiness only needs a decision, so it reports ready, but the ship flow will not pass until a human approves.';
  return `${checked.value.length} of ${total} items checked.`;
});
</script>
