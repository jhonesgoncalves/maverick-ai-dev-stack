<template>
  <div class="mv-widget">
    <div class="mv-widget-head">
      <span class="mv-kicker">TRY IT · THE GATES</span>
      <small class="mv-widget-hint">Choose what the agent changed. The gates read the diff, not the agent's summary.</small>
    </div>
    <div class="mv-gate-grid">
      <div>
        <span class="mv-label">DECLARED SCOPE · TECHSPEC + TASK FILES</span>
        <ul class="mv-gate-scope"><li v-for="file in SCOPE" :key="file"><code>{{ file }}</code></li></ul>
        <span class="mv-label">THE DIFF</span>
        <ul class="mv-gate-diff">
          <li v-for="file in FILES" :key="file.path">
            <label><input v-model="changed" type="checkbox" :value="file.path" /> <code>{{ file.path }}</code></label>
            <small v-if="!SCOPE.includes(file.path)">{{ file.why }}</small>
          </li>
        </ul>
        <div class="mv-gate-toggles">
          <label><input v-model="testsPass" type="checkbox" /> Tests pass</label>
          <label><input v-model="secret" type="checkbox" /> Diff adds <code>apiKey = "sk_live_…"</code></label>
        </div>
      </div>
      <div class="mv-gate-results">
        <article v-for="gate in gates" :key="gate.cmd" :class="gate.state">
          <header><b>{{ gate.state === 'pass' ? 'PASS' : gate.state === 'warn' ? 'WARN' : 'FAIL' }}</b><code>maverick {{ gate.cmd }}</code></header>
          <span>{{ gate.file }}</span>
          <ul><li v-for="line in gate.lines" :key="line">{{ line }}</li></ul>
        </article>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue';

// Mirrors src/commands/gates.js: verify runs the detected checks, guard compares the diff with the
// declared scope and the change budget, security looks for high-signal patterns, deps lists
// manifest and lockfile changes. Each writes its own report next to the task.
const SCOPE = ['src/orders/orders.controller.ts', 'src/orders/orders.service.ts', 'src/orders/dto/list-orders.dto.ts', 'test/orders.e2e-spec.ts'];
const FILES = [
  ...SCOPE.map(path => ({ path })),
  { path: 'src/common/date-utils.ts', why: 'a drive-by refactor' },
  { path: 'package.json', why: 'a new dependency' },
  { path: 'package-lock.json', why: 'its lockfile' },
  { path: '.env.example', why: 'a sensitive-looking path' }
];
const changed = ref([...SCOPE]);
const testsPass = ref(true);
const secret = ref(false);
const BUDGET = 8;

const gates = computed(() => {
  const outside = changed.value.filter(file => !SCOPE.includes(file));
  const lock = changed.value.filter(file => /lock\.json$/.test(file)), manifests = changed.value.filter(file => file === 'package.json');
  return [
    { cmd: 'verify', file: 'EVIDENCE.md', state: testsPass.value ? 'pass' : 'fail', lines: [`${testsPass.value ? 'PASS' : 'FAIL'} npm test · exit ${testsPass.value ? 0 : 1}`, 'PASS npm run lint · exit 0', 'PASS npx tsc --noEmit · exit 0'] },
    { cmd: 'guard', file: 'SCOPE-GUARD.md', state: outside.length || changed.value.length > BUDGET ? 'warn' : 'pass', lines: [`Changed ${changed.value.length} · expected ${SCOPE.length} · budget ${BUDGET}`, ...outside.map(file => `Not in TECHSPEC.md File References or any task: ${file}`)] },
    { cmd: 'security', file: 'SECURITY-REPORT.md', state: secret.value ? 'fail' : 'pass', lines: [secret.value ? 'Likely cloud/API secret assignment' : 'No high-signal patterns found in the current diff.'] },
    { cmd: 'deps', file: 'DEPENDENCY-REVIEW.md', state: lock.length || manifests.length ? 'warn' : 'pass', lines: [`Manifests: ${manifests.join(', ') || 'none'}`, `Lockfiles: ${lock.join(', ') || 'none'}`] },
    { cmd: 'review --diff', file: 'REVIEW-FINDINGS.md', state: lock.length || changed.value.includes('.env.example') ? 'warn' : 'pass', lines: [...(changed.value.includes('.env.example') ? ['Security: sensitive-looking path changed; confirm secrets and PII were not included.'] : []), ...(lock.length ? ['Dependencies: lockfile changed; review new packages, licenses, and vulnerabilities.'] : []), `Blast radius listed for ${changed.value.length} file(s)`] }
  ];
});
</script>
