<template>
  <div class="mv-cmds">
    <div class="mv-cmds-bar">
      <label class="mv-cmds-search">
        <span aria-hidden="true">⌕</span>
        <input v-model="query" type="search" placeholder="Search commands, aliases or flags…" aria-label="Search commands" />
        <kbd>{{ filtered.length }}</kbd>
      </label>
      <div class="mv-chips" role="group" aria-label="Filter by group">
        <button type="button" :class="{ on: !group }" @click="group = ''">All</button>
        <button v-for="item in data.groups" :key="item.id" type="button" :class="{ on: group === item.id }" @click="group = group === item.id ? '' : item.id">{{ item.title }}</button>
      </div>
    </div>
    <div class="mv-cmds-list">
      <article v-for="command in filtered" :id="`cmd-${command.id}`" :key="command.id" class="mv-cmd">
        <header>
          <code class="mv-cmd-name">maverick {{ command.id }}</code>
          <span v-for="alias in command.aliases" :key="alias" class="mv-cmd-alias">{{ alias }}</span>
          <span class="mv-cmd-group">{{ titleOf(command.group) }}</span>
        </header>
        <p>{{ command.description }}</p>
        <button type="button" class="mv-cmd-usage" :title="`Copy maverick ${command.usage}`" @click="copy(command)">
          <span>$ maverick {{ command.usage }}</span><em>{{ copied === command.id ? 'Copied' : 'Copy' }}</em>
        </button>
      </article>
      <p v-if="!filtered.length" class="mv-empty">No command matches “{{ query }}”.</p>
    </div>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue';
import { data } from '../../data/cli.data.js';

const query = ref('');
const group = ref('');
const copied = ref('');
const titleOf = id => data.groups.find(item => item.id === id)?.title || id;
const filtered = computed(() => {
  const q = query.value.trim().toLowerCase();
  return data.commands.filter(command => (!group.value || command.group === group.value) && (!q || [command.id, command.description, command.usage, ...command.aliases].join(' ').toLowerCase().includes(q)));
});

async function copy(command) {
  try { await navigator.clipboard.writeText(`maverick ${command.usage}`); } catch { return; }
  copied.value = command.id;
  setTimeout(() => { if (copied.value === command.id) copied.value = ''; }, 1500);
}
</script>
