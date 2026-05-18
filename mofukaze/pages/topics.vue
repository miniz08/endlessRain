<template>
  <div class="page topic-bubble-page">
    <section class="topic-bubble-hero">
      <div>
        <h2>主题分类</h2>
      </div>
      <button class="ghost" :disabled="loading" @click="loadTags">
        {{ loading ? "同步中" : "刷新主题" }}
      </button>
    </section>

    <section class="topic-bubble-field" :class="{ loading }">
      <NuxtLink
        v-for="(tag, index) in tags"
        :key="tag.name"
        class="topic-bubble"
        :class="bubbleClass(index)"
        :style="bubbleStyle(tag, index)"
        :to="topicLink(tag.name)"
      >
        <strong>{{ tag.name }}</strong>
        <span>{{ tag.total }} 篇</span>
      </NuxtLink>

      <div v-if="!loading && tags.length === 0" class="empty">暂无主题</div>
      <div v-if="loading" class="empty">加载中</div>
    </section>

    <p v-if="error" class="error">{{ error }}</p>
  </div>
</template>

<script setup lang="ts">
import type { ArticleTagSummary } from "~/types/social";

const { blogApi } = useApi();
const tags = ref<ArticleTagSummary[]>([]);
const loading = ref(false);
const error = ref("");

const maxTotal = computed(() => Math.max(1, ...tags.value.map((tag) => tag.total)));

onMounted(loadTags);

async function loadTags() {
  loading.value = true;
  error.value = "";
  try {
    const payload = await blogApi<{ items: ArticleTagSummary[] }>("/articles/tags?limit=120");
    tags.value = payload.items;
  } catch (err) {
    error.value = err instanceof Error ? err.message : "主题加载失败";
  } finally {
    loading.value = false;
  }
}

function bubbleStyle(tag: ArticleTagSummary, index: number) {
  const ratio = Math.max(0.36, tag.total / maxTotal.value);
  const size = Math.round(92 + ratio * 86);
  const hue = [174, 204, 44, 344, 258, 24][index % 6];
  return {
    "--bubble-size": `${size}px`,
    "--bubble-hue": hue,
    "--bubble-rise": `${(index % 5) * 8}px`,
  };
}

function bubbleClass(index: number) {
  return `bubble-tone-${index % 6}`;
}

function topicLink(tag: string) {
  return `/topic?tag=${encodeURIComponent(tag)}`;
}
</script>
