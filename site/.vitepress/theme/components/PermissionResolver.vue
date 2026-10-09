<template>
  <div class="mv-widget">
    <div class="mv-widget-head">
      <span class="mv-kicker">TRY IT · WHO MAY RUN, WITH WHAT POWER</span>
    </div>
    <div class="mv-perm-grid">
      <fieldset>
        <legend>Provider</legend>
        <div class="mv-seg small"><button v-for="(item, id) in PROVIDERS" :key="id" type="button" :class="{ on: provider === id }" @click="provider = id">{{ item.name }}</button></div>
        <label class="mv-perm-check"><input v-model="trusted" type="checkbox" /> Trusted in <code>.maverick/config.json</code></label>
      </fieldset>
      <fieldset>
        <legend>Ceiling · <code>runtime.maxPermission</code></legend>
        <div class="mv-seg small"><button v-for="level in LEVELS" :key="level" type="button" :class="{ on: ceiling === level }" @click="ceiling = level">{{ level }}</button></div>
      </fieldset>
      <fieldset>
        <legend>Requested · <code>--permission</code></legend>
        <div class="mv-seg small"><button v-for="level in LEVELS" :key="level" type="button" :class="{ on: requested === level }" @click="requested = level">{{ level }}</button></div>
      </fieldset>
      <fieldset>
        <legend>Hook · <code>before-agent-run</code></legend>
        <div class="mv-seg small"><button v-for="(label, key) in HOOKS" :key="key" type="button" :class="{ on: hook === key }" @click="hook = key">{{ label }}</button></div>
      </fieldset>
    </div>
    <div class="mv-perm-ladder" aria-hidden="true">
      <div v-for="level in LEVELS" :key="level" :class="{ ceiling: level === ceiling, req: level === requested, above: rank(level) > rank(ceiling) }">
        <b>{{ level }}</b><span>{{ MEANING[level] }}</span>
      </div>
    </div>
    <pre class="mv-widget-out"><span class="cmd">$ maverick agent run add-orders-pagination --provider {{ provider }} --permission {{ requested }}</span>
<span :class="result.ok ? 'ok' : 'bad'">{{ result.ok ? '✓' : '✕' }} {{ result.text }}</span></pre>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue';

// The same checks, in the same order, as resolveRun in src/runtime/policy.js and the blocking
// before-agent-run hook in src/runtime/hooks.js.
const LEVELS = ['read-only', 'edit', 'full'];
const MEANING = { 'read-only': 'reads and plans; writes nothing', edit: 'edits files in the repository', full: 'edits and runs shell commands' };
const PROVIDERS = {
  'claude-code': { name: 'Claude Code', support: {} },
  codex: { name: 'Codex', support: {} },
  cursor: { name: 'Cursor', support: { edit: 'Cursor CLI applies edits only with --force, which also allows shell commands; use full or another provider' } }
};
const HOOKS = { none: 'none', allow: 'exit 0', deny: 'exit 2' };
const rank = level => LEVELS.indexOf(level);

const provider = ref('claude-code');
const trusted = ref(true);
const ceiling = ref('edit');
const requested = ref('edit');
const hook = ref('none');

const result = computed(() => {
  const definition = PROVIDERS[provider.value];
  if (!trusted.value) return { ok: false, text: `provider ${provider.value} is not trusted in this repository; review it, then run maverick agent trust ${provider.value}` };
  if (rank(requested.value) > rank(ceiling.value)) return { ok: false, text: `permission ${requested.value} exceeds runtime.maxPermission (${ceiling.value}); raise it in .maverick/config.json only after review` };
  const support = definition.support[requested.value];
  if (support) return { ok: false, text: `${definition.name} cannot run with ${requested.value} permission: ${support}` };
  if (hook.value === 'deny') return { ok: false, text: 'before-agent-run hook denied the run: "touches src/payments/; needs a human pairing session"' };
  return { ok: true, text: `${definition.name} runs with ${requested.value} permission${hook.value === 'allow' ? ' after the hook allowed it' : ''}; the run is recorded under the task's runs` };
});
</script>
