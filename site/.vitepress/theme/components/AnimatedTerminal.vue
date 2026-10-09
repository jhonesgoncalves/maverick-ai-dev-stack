<template>
  <div ref="root" class="mv-term" role="img" :aria-label="`Terminal: ${title}`">
    <div class="mv-term-bar">
      <span class="mv-dots"><i /><i /><i /></span>
      <span class="mv-term-title">{{ title }}</span>
    </div>
    <pre class="mv-term-body"><template v-for="(line, index) in shown" :key="index"><span :class="line.kind">{{ line.text }}</span>
</template><span v-if="!finished" class="mv-caret">▍</span></pre>
  </div>
</template>

<script setup>
import { onBeforeUnmount, onMounted, ref } from 'vue';

// Each line is { text, kind } where kind is 'cmd' (typed), 'ok', 'muted', 'warn' or 'accent'.
const props = defineProps({ title: { type: String, default: 'maverick — zsh' }, lines: { type: Array, required: true }, loop: { type: Boolean, default: true } });
const root = ref();
const shown = ref([]);
const finished = ref(false);
let timer, observer, started = false;

const wait = ms => new Promise(resolve => { timer = setTimeout(resolve, ms); });

async function play() {
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  do {
    shown.value = []; finished.value = false;
    for (const line of props.lines) {
      if (reduce || line.kind !== 'cmd') { shown.value.push({ ...line }); await wait(reduce ? 0 : 260); continue; }
      const current = { kind: 'cmd', text: '$ ' };
      shown.value.push(current);
      for (const char of line.text) { current.text += char; shown.value = [...shown.value]; await wait(28 + Math.random() * 40); }
      await wait(380);
    }
    finished.value = true;
    if (reduce) return;
    await wait(4200);
  } while (props.loop);
}

onMounted(() => {
  observer = new IntersectionObserver(([entry]) => { if (entry.isIntersecting && !started) { started = true; play(); } }, { threshold: 0.3 });
  observer.observe(root.value);
});
onBeforeUnmount(() => { clearTimeout(timer); observer?.disconnect(); });
</script>
