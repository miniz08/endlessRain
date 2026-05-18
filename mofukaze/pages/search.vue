<template>
  <div class="page search-page">
    <section class="panel">
      <div class="search-head">
        <div>
          <h2>搜索</h2>
        </div>
        <form class="inline-form search-inline" @submit.prevent="submitSearch">
          <input v-model.trim="draft" type="search" placeholder="输入关键词" autocomplete="off" />
          <button class="primary" :disabled="draft.length === 0">搜索</button>
        </form>
      </div>
    </section>

    <div v-if="!keyword" class="panel empty">在顶部输入关键词开始搜索</div>

    <div v-else class="search-layout">
      <aside class="panel search-users-panel">
        <div class="row" style="justify-content: space-between">
          <h3 style="margin: 0">用户</h3>
          <span class="muted">{{ userResults.length }}</span>
        </div>
        <div v-if="loadingUsers" class="empty">用户搜索中</div>
        <p v-else-if="userError" class="error">{{ userError }}</p>
        <div v-else class="user-list">
          <NuxtLink v-for="item in userResults" :key="item.id" class="user-item" :to="`/u/${item.id}`">
            <span class="row">
              <span class="avatar">
                <img v-if="item.avatar" :src="item.avatar" alt="" />
                <span v-else>{{ item.username.slice(0, 1).toUpperCase() }}</span>
              </span>
              <span>
                <strong>{{ item.username }}</strong>
                <small class="muted">专业度 {{ item.professionalism }} / 友好度 {{ item.friendliness }}</small>
              </span>
            </span>
          </NuxtLink>
          <div v-if="userResults.length === 0" class="empty">没有匹配用户</div>
        </div>
      </aside>

      <section>
        <div class="row search-result-title">
          <h3>博客</h3>
          <span class="muted">{{ articleResults.length }} 条结果</span>
        </div>
        <div v-if="loadingArticles" class="panel empty">博客搜索中</div>
        <p v-else-if="articleError" class="panel error">{{ articleError }}</p>
        <div v-else-if="articleResults.length === 0" class="panel empty">没有匹配博客</div>
        <template v-else>
          <ArticleCard v-for="article in articleResults" :key="article.id" :article="article" compact />
          <button v-if="nextCursor" class="primary" :disabled="loadingMoreArticles" @click="loadMoreArticles">
            {{ loadingMoreArticles ? "加载中" : "查看更多博客" }}
          </button>
        </template>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { Article, PublicUser } from "~/types/social";

const route = useRoute();
const { blogApi, userApi } = useApi();
const draft = ref("");
const keyword = computed(() => (typeof route.query.q === "string" ? route.query.q.trim() : ""));
const userResults = ref<PublicUser[]>([]);
const articleResults = ref<Article[]>([]);
const nextCursor = ref<number | null>(null);
const loadingUsers = ref(false);
const loadingArticles = ref(false);
const loadingMoreArticles = ref(false);
const userError = ref("");
const articleError = ref("");

watch(
  keyword,
  async (value) => {
    draft.value = value;
    if (!value) {
      userResults.value = [];
      articleResults.value = [];
      nextCursor.value = null;
      return;
    }
    await Promise.all([searchUsers(value), searchArticles(value)]);
  },
  { immediate: true },
);

async function submitSearch() {
  const value = draft.value.trim();
  if (!value) return;
  await navigateTo(`/search?q=${encodeURIComponent(value)}`);
}

async function searchUsers(value: string) {
  loadingUsers.value = true;
  userError.value = "";
  try {
    const query = new URLSearchParams({ q: value, limit: "8" });
    const payload = await userApi<{ items: PublicUser[] }>(`/users/search?${query.toString()}`);
    userResults.value = payload.items;
  } catch (err) {
    userError.value = err instanceof Error ? err.message : "用户搜索失败";
  } finally {
    loadingUsers.value = false;
  }
}

async function searchArticles(value: string, cursor?: number) {
  const loadingRef = cursor ? loadingMoreArticles : loadingArticles;
  loadingRef.value = true;
  articleError.value = "";
  try {
    const query = new URLSearchParams({ q: value, limit: "10" });
    if (cursor) query.set("cursor", String(cursor));
    const payload = await blogApi<{ items: Article[]; nextCursor: number | null }>(`/articles?${query.toString()}`);
    articleResults.value = cursor ? [...articleResults.value, ...payload.items] : payload.items;
    nextCursor.value = payload.nextCursor;
  } catch (err) {
    articleError.value = err instanceof Error ? err.message : "博客搜索失败";
  } finally {
    loadingRef.value = false;
  }
}

async function loadMoreArticles() {
  if (!nextCursor.value || !keyword.value) return;
  await searchArticles(keyword.value, nextCursor.value);
}
</script>
