<template>
  <div class="mv-widget">
    <div class="mv-widget-head">
      <span class="mv-kicker">TRY IT · GROUNDING</span>
      <div class="mv-seg small">
        <button v-for="example in EXAMPLES" :key="example" type="button" :class="{ on: idea === example }" @click="idea = example">{{ example.split(' ').slice(0, 3).join(' ') }}…</button>
      </div>
    </div>
    <label class="mv-ground-input"><span>$ maverick new "</span><input v-model="idea" type="text" aria-label="Your idea" /><span>"</span></label>
    <div class="mv-ground-terms">
      <span class="mv-label">TERMS</span>
      <code v-for="term in terms" :key="term">{{ term }}</code>
      <em v-if="!terms.length">no meaningful terms: grounding returns only the stack and commands</em>
    </div>
    <div class="mv-ground-grid">
      <div>
        <span class="mv-label">RELEVANT FILES</span>
        <TransitionGroup name="mv-list" tag="ol" class="mv-ground-list">
          <li v-for="item in relevant" :key="item.path">
            <div><code>{{ item.path }}</code><b>{{ item.score.toFixed(1) }}</b></div>
            <i :style="{ width: `${Math.max(6, (item.score / best) * 100)}%` }" />
            <small>{{ item.reasons.join(' · ') }}</small>
          </li>
        </TransitionGroup>
        <p v-if="terms.length && !relevant.length" class="mv-empty">No file matches. The agent would ask where to start.</p>
      </div>
      <div class="mv-ground-side">
        <div><span class="mv-label">TESTS NEARBY</span><span class="mv-ground-tags"><code v-for="test in tests" :key="test">{{ test }}</code><em v-if="!tests.length">none</em></span></div>
        <div><span class="mv-label">SHARED · CHANGE RIPPLES</span><span class="mv-ground-tags"><code v-for="item in shared" :key="item.path">{{ item.path }} <small>{{ item.fanIn }} importers</small></code><em v-if="!shared.length">none</em></span></div>
        <div><span class="mv-label">VERIFY WITH</span><span class="mv-ground-tags"><code>npm run lint</code><code>npx tsc --noEmit</code><code>npm test</code></span></div>
        <div><span class="mv-label">DO NOT TOUCH</span><span class="mv-ground-tags"><code>dist/</code><code>package-lock.json</code></span></div>
      </div>
    </div>
    <div class="mv-ground-budget">
      <span>Context sent</span>
      <div><i :style="{ width: `${(relevant.length / REPO.length) * 100}%` }" /></div>
      <b>{{ relevant.length }} of {{ REPO.length }} files</b>
    </div>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue';

// A browser-sized version of src/core/grounding.js: the same term extraction, stemming,
// IDF weighting and "matches several terms" multiplier, over a small sample repository.
const EXAMPLES = ['Add cursor pagination to the orders endpoint', 'Send an email when a payment fails', 'Adicionar filtro por status na listagem de pedidos'];
const REPO = [
  { path: 'src/orders/orders.controller.ts', words: 'orders list get endpoint route query limit', fanIn: 1 },
  { path: 'src/orders/orders.service.ts', words: 'orders list find repository status', fanIn: 2 },
  { path: 'src/orders/dto/list-orders.dto.ts', words: 'orders list limit validate query', fanIn: 2 },
  { path: 'src/orders/orders.repository.ts', words: 'orders query find createdAt status', fanIn: 1 },
  { path: 'src/orders/order-status.enum.ts', words: 'status pending paid failed', fanIn: 4 },
  { path: 'src/payments/payments.service.ts', words: 'payment charge failed retry webhook', fanIn: 2 },
  { path: 'src/payments/payment-webhook.controller.ts', words: 'payment webhook event failed route', fanIn: 1 },
  { path: 'src/notifications/email.service.ts', words: 'email send template mail', fanIn: 3 },
  { path: 'src/notifications/templates/payment-failed.hbs', words: 'payment failed email template', fanIn: 0 },
  { path: 'src/common/pagination.ts', words: 'pagination cursor limit page offset', fanIn: 6 },
  { path: 'src/common/http-error.ts', words: 'error status http', fanIn: 9 },
  { path: 'src/users/users.controller.ts', words: 'users list route', fanIn: 1 },
  { path: 'src/auth/auth.guard.ts', words: 'auth token guard', fanIn: 7 },
  { path: 'src/main.ts', words: 'bootstrap app module', fanIn: 0 },
  { path: 'test/orders.e2e-spec.ts', words: 'orders list limit endpoint', test: true },
  { path: 'src/orders/orders.service.spec.ts', words: 'orders list status', test: true },
  { path: 'src/payments/payments.service.spec.ts', words: 'payment failed retry', test: true },
  { path: 'src/common/pagination.spec.ts', words: 'pagination cursor limit', test: true }
];
const STOPWORDS = new Set('a an and are as at be by can do for from has have how in into is it of on or our should so that the their them this to up use when where which will with add adds new send o os as um uma de do da dos das no na em para por com que quando adicionar'.split(' '));

const fold = text => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const stem = word => (word.length > 6 ? word.slice(0, 6) : word.length > 3 && word.endsWith('s') ? word.slice(0, -1) : word);
const tokens = path => fold(path.replace(/([a-z0-9])([A-Z])/g, '$1 $2')).split(/[^a-z0-9]+/).filter(Boolean);
// The sample repository speaks English; a few Portuguese terms are mapped so the third example grounds too.
const ALIAS = { filtro: 'filter', status: 'status', listag: 'list', pedido: 'orders' };

const idea = ref(EXAMPLES[0]);
const terms = computed(() => [...new Set(fold(idea.value).split(/[^a-z0-9]+/).filter(word => word.length >= 3 && !STOPWORDS.has(word)).map(stem))].slice(0, 16));
const scored = computed(() => {
  const list = terms.value.map(term => ALIAS[term] ? stem(ALIAS[term]) : term);
  const idf = new Map(list.map(term => [term, Math.log((REPO.length + 1) / (REPO.filter(file => `${fold(file.path)} ${file.words}`.includes(term)).length + 1)) + 1]));
  return REPO.map(file => {
    const name = tokens(file.path.split('/').pop()), all = tokens(file.path), words = file.words.split(' ').map(fold);
    let score = 0; const reasons = [], matched = new Set();
    list.forEach((term, index) => {
      const inName = name.some(token => token.startsWith(term)), inPath = !inName && all.some(token => token.startsWith(term)), hits = words.filter(word => word.startsWith(term)).length * 2;
      if (!inName && !inPath && !hits) return;
      matched.add(term);
      score += idf.get(term) * ((inName ? 6 : inPath ? 3 : 0) + hits * 0.5);
      reasons.push(inName ? `name matches "${terms.value[index]}"` : inPath ? `path matches "${terms.value[index]}"` : `mentions "${terms.value[index]}" ${hits}×`);
    });
    return { ...file, score: score * matched.size, reasons: reasons.slice(0, 3) };
  }).filter(file => file.score > 0).sort((a, b) => b.score - a.score);
});
const best = computed(() => scored.value[0]?.score || 1);
// Keep only files within reach of the best match, as grounding does.
const strong = computed(() => scored.value.filter(file => file.score >= best.value * 0.12));
const relevant = computed(() => strong.value.filter(file => !file.test).slice(0, 6));
const tests = computed(() => strong.value.filter(file => file.test).slice(0, 4).map(file => file.path));
const shared = computed(() => relevant.value.filter(file => file.fanIn >= 5));
</script>
