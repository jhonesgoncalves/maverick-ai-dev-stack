# Maverick Lens

The Lens documentation has moved to its own section: **[Maverick Lens →](../lens/)**

<script setup>
import { onMounted } from 'vue';
import { useRouter, withBase } from 'vitepress';

const router = useRouter();
onMounted(() => router.go(withBase('/lens/')));
</script>
