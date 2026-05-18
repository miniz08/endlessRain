<template>
  <div class="page topic-page">
    <section class="panel topic-hero">
      <div>
        <h2>标签分类</h2>
      </div>
      <button class="ghost" :disabled="loadingTags" @click="loadTags">
        {{ loadingTags ? "同步中" : "刷新标签" }}
      </button>
    </section>

    <div class="topic-layout">
      <aside class="panel tag-cloud-panel">
        <div class="row" style="justify-content: space-between">
          <strong>标签云</strong>
          <span class="muted">{{ tags.length }}</span>
        </div>

        <div class="tag-cloud">
          <button
            v-for="tag in tags"
            :key="tag.name"
            class="topic-chip"
            :class="{ active: selectedTag === tag.name }"
            @click="selectTag(tag.name)"
          >
            <span>{{ tag.name }}</span>
            <small>{{ tag.total }}</small>
          </button>
        </div>

        <div v-if="tags.length === 0 && !loadingTags" class="empty">暂无标签</div>
      </aside>

      <section class="stack">
        <div class="panel topic-toolbar">
          <div>
            <h3>{{ selectedTag || "选择一个标签" }}</h3>
            <p v-if="selectedSummary" class="muted" style="margin: 4px 0 0">
              {{ summaryText(selectedSummary) }}
            </p>
          </div>
          <button v-if="selectedTag" class="ghost" :disabled="loadingArticles" @click="refreshArticles">
            {{ loadingArticles ? "加载中" : "刷新文章" }}
          </button>
        </div>

        <div v-if="error" class="panel error">{{ error }}</div>
        <div v-else-if="loadingArticles" class="panel empty">加载中</div>
        <div v-else-if="selectedTag && articles.length === 0" class="panel empty">该标签下暂无文章</div>
        <div v-else-if="!selectedTag" class="panel empty">请选择标签</div>

        <ArticleCard v-for="article in articles" :key="article.id" :article="article" compact />

        <button v-if="nextCursor" class="primary" :disabled="loadingMore" @click="loadMore">
          {{ loadingMore ? "加载中" : "加载更多" }}
        </button>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { Article, ArticleTagSummary } from "~/types/social";

const route = useRoute();
const router = useRouter();
const { blogApi } = useApi();
const tags = ref<ArticleTagSummary[]>([]);
const articles = ref<Article[]>([]);
const nextCursor = ref<number | null>(null);
const loadingTags = ref(false);
const loadingArticles = ref(false);
const loadingMore = ref(false);
const error = ref("");

const selectedTag = computed(() => {
  const raw = route.query.tag;
  return typeof raw === "string" ? raw : "";
});

const selectedSummary = computed(() => tags.value.find((tag) => tag.name === selectedTag.value));

onMounted(async () => {
  const hadSelectedTag = Boolean(selectedTag.value);
  await loadTags();
  if (hadSelectedTag) await loadArticles();
});

watch(selectedTag, async () => {
  articles.value = [];
  nextCursor.value = null;
  if (selectedTag.value) await loadArticles();
});

async function loadTags() {
  loadingTags.value = true;
  try {
    const payload = await blogApi<{ items: ArticleTagSummary[] }>("/articles/tags?limit=90");
    tags.value = payload.items;
    if (!selectedTag.value && payload.items[0]) {
      await selectTag(payload.items[0].name);
    }
  } finally {
    loadingTags.value = false;
  }
}

async function selectTag(tag: string) {
  await router.replace({ path: "/topic", query: { tag } });
}

async function loadArticles(cursor?: number) {
  if (!selectedTag.value) return;
  if (cursor) {
    loadingMore.value = true;
  } else {
    loadingArticles.value = true;
  }
  error.value = "";

  try {
    const query = new URLSearchParams({ tag: selectedTag.value, limit: "10" });
    if (cursor) query.set("cursor", String(cursor));
    const payload = await blogApi<{ items: Article[]; nextCursor: number | null }>(`/articles?${query.toString()}`);
    if (cursor) {
      articles.value.push(...payload.items);
    } else {
      articles.value = payload.items;
    }
    nextCursor.value = payload.nextCursor;
  } catch (err) {
    error.value = err instanceof Error ? err.message : "标签文章加载失败";
  } finally {
    loadingArticles.value = false;
    loadingMore.value = false;
  }
}

async function loadMore() {
  if (!nextCursor.value) return;
  await loadArticles(nextCursor.value);
}

async function refreshArticles() {
  await loadArticles();
}

function summaryText(tag: ArticleTagSummary) {
  return `总关联 ${tag.total}，主标签 ${tag.primaryCount}，人工 ${tag.manualCount}，AI ${tag.aiCount}`;
}
</script>
