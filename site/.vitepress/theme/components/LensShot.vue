<template>
  <figure class="mv-shot">
    <div class="mv-window">
      <div class="mv-window-bar">
        <span class="mv-dots"><i /><i /><i /></span>
        <span class="mv-window-url">127.0.0.1:4173{{ path }}</span>
        <span class="mv-window-badge">LOCAL</span>
      </div>
      <img :src="withBase(`/screens/${src}.png`)" :alt="alt || caption" loading="lazy" decoding="async" width="1440" height="900" data-zoomable />
    </div>
    <figcaption v-if="caption">{{ caption }}</figcaption>
  </figure>
</template>

<script setup>
import { withBase } from 'vitepress';

defineProps({ src: { type: String, required: true }, caption: String, alt: String, path: { type: String, default: '/' } });
</script>
