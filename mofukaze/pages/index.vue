<template>
  <div class="page">
    <div class="grid">
      <section>
        <ArticleComposer @created="handleArticleCreated" />

        <div class="tabs">
          <button :class="{ active: activeFeed === 'recommended' }" @click="switchFeed('recommended')">推荐</button>
          <button :class="{ active: activeFeed === 'following' }" @click="switchFeed('following')">关注</button>
          <button class="ghost" :disabled="loading" @click="loadFeed">刷新</button>
        </div>

        <div v-if="error" class="panel error">{{ error }}</div>
        <div v-else-if="loading" class="panel empty">加载中</div>
        <div v-else-if="articles.length === 0" class="panel empty">暂无内容</div>
        <ArticleCard v-for="article in articles" v-else :key="article.id" :article="article" compact />

        <button v-if="nextCursor" class="primary" :disabled="loadingMore" @click="loadMore">
          {{ loadingMore ? "加载中" : "加载更多" }}
        </button>
      </section>

      <aside class="stack">
        <div class="panel">
          <h3>推荐闭环</h3>
          <p class="muted">当前推荐流会写入曝光事件，并基于内容标签、作者亲和度、内容质量和展示策略排序。</p>
          <p v-if="feedMeta" class="muted">策略：{{ feedMeta.strategy || feedMeta.source }}</p>
          <button v-if="user" class="ghost" @click="refreshProfile">刷新我的兴趣画像</button>
        </div>

        <div class="panel">
          <h3>{{ user ? user.username : "未登录" }}</h3>
          <p class="muted">登录后可查看关注流、使用 reaction、评论，并让系统学习你的内容偏好。</p>
          <div v-if="!user" class="row">
            <NuxtLink to="/login">
              <button class="primary">去登录</button>
            </NuxtLink>
            <NuxtLink to="/register">
              <button>注册</button>
            </NuxtLink>
          </div>
          <NuxtLink v-else :to="`/u/${user.id}`">
            <button>查看主页</button>
          </NuxtLink>
        </div>
      </aside>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { Article, CreateArticleResponse, FeedResponse } from "~/types/social";

type FeedType = "recommended" | "following";

const { blogApi } = useApi();
const { user, refreshMe } = useAuth();
const activeFeed = ref<FeedType>("recommended");
const articles = ref<Article[]>([]);
const nextCursor = ref<number | null>(null);
const feedMeta = ref<FeedResponse | null>(null);
const loading = ref(false);
const loadingMore = ref(false);
const error = ref("");

onMounted(async () => {
  await refreshMe();
  await loadFeed();
});

async function switchFeed(feed: FeedType) {
  if (feed === "following" && !user.value) {
    await navigateTo("/login");
    return;
  }
  activeFeed.value = feed;
  await loadFeed();
}

async function loadFeed() {
  loading.value = true;
  error.value = "";
  try {
    const payload = await fetchFeed();
    articles.value = payload.items;
    nextCursor.value = payload.nextCursor;
    feedMeta.value = payload;
  } catch (err) {
    error.value = err instanceof Error ? err.message : "加载失败";
  } finally {
    loading.value = false;
  }
}

async function loadMore() {
  if (!nextCursor.value) return;
  loadingMore.value = true;
  try {
    const payload = await fetchFeed(nextCursor.value);
    articles.value.push(...payload.items);
    nextCursor.value = payload.nextCursor;
    feedMeta.value = payload;
  } finally {
    loadingMore.value = false;
  }
}

async function fetchFeed(cursor?: number) {
  const path = activeFeed.value === "following" ? "/feeds/following" : "/feeds/recommended";
  const query = new URLSearchParams({ limit: "10" });
  if (cursor) query.set("cursor", String(cursor));
  return blogApi<FeedResponse>(`${path}?${query.toString()}`);
}

async function refreshProfile() {
  await blogApi("/reco/profile/me/refresh", { method: "POST" });
  await loadFeed();
}

function handleArticleCreated(payload: CreateArticleResponse) {
  if (payload.article.status !== "PUBLISHED" && payload.article.status !== "LOW_PRIORITY") return;
  articles.value = [payload.article, ...articles.value.filter((article) => article.id !== payload.article.id)];
  activeFeed.value = "recommended";
}
</script>
