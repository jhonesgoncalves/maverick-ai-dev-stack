<template>
  <button class="mv-copy-cmd" type="button" :aria-label="`Copy command: ${command}`" @click="copy">
    <span class="mv-copy-prompt">$</span>
    <code>{{ command }}</code>
    <span class="mv-copy-state" :class="{ done: copied }">{{ copied ? 'Copied' : 'Copy' }}</span>
  </button>
</template>

<script setup>
import { ref } from 'vue';

const props = defineProps({ command: { type: String, required: true } });
const copied = ref(false);
let timer;

async function copy() {
  try { await navigator.clipboard.writeText(props.command); } catch { return; }
  copied.value = true;
  clearTimeout(timer);
  timer = setTimeout(() => (copied.value = false), 1600);
}
</script>
