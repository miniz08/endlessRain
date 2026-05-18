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

      <aside class="stack home-sidebar">
        <div class="panel profile-visual-panel">
          <div class="content-profile-head">
            <div>
              <h3>个人画像</h3>
              <p class="muted">推荐页会根据阅读、互动、关注和停留行为更新兴趣分布。</p>
            </div>
            <span class="status-pill" :class="profileReady ? 'risk-low' : 'risk-mid'">
              {{ profileReady ? "已生成" : "待学习" }}
            </span>
          </div>

          <div v-if="!user" class="profile-empty">
            <p class="muted">登录后可以看到你的兴趣画像，并获得更贴近个人偏好的推荐。</p>
            <NuxtLink to="/login">
              <button class="primary">去登录</button>
            </NuxtLink>
          </div>

          <div v-else-if="profileLoading" class="panel empty profile-loading">画像加载中</div>

          <div v-else class="profile-visual">
            <div v-if="topTags.length > 0" class="interest-bubbles">
              <div
                v-for="tag in topTags"
                :key="tag.name"
                class="interest-bubble"
                :style="{ '--bubble-size': `${tag.size}px`, '--bubble-alpha': String(tag.alpha) }"
              >
                <strong>{{ tag.name }}</strong>
                <span>{{ tag.percent }}%</span>
              </div>
            </div>
            <div v-else class="profile-empty">
              <p class="muted">还没有足够的行为数据。多浏览、评论、reaction 或关注作者后，画像会逐渐清晰。</p>
            </div>

            <div v-if="topTags.length > 0" class="profile-bars">
              <div v-for="tag in topTags.slice(0, 5)" :key="`bar-${tag.name}`" class="profile-bar">
                <span>{{ tag.name }}</span>
                <div><i :style="{ width: `${tag.percent}%` }"></i></div>
              </div>
            </div>

            <div class="profile-stats">
              <span>事件 {{ profileStats.events }}</span>
              <span>标签 {{ topTags.length }}</span>
              <span>作者 {{ profileStats.authors }}</span>
            </div>

            <div class="row" style="justify-content: space-between">
              <span v-if="profileUpdatedAt" class="muted">更新于 {{ formatTime(profileUpdatedAt) }}</span>
              <span v-else class="muted">尚未生成画像</span>
              <button class="ghost" :disabled="profileRefreshing" @click="refreshProfile">
                {{ profileRefreshing ? "刷新中" : "刷新画像" }}
              </button>
            </div>
          </div>
        </div>

        <div class="panel">
          <h3>{{ user ? user.username : "未登录" }}</h3>
          <p class="muted">关注流、评论和 reaction 会参与推荐学习，也会让系统更理解你的内容偏好。</p>
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
type RecoProfile = {
  userId: number;
  tagVector: {
    tags?: Record<string, number>;
    updatedFromEvents?: number;
    version?: number;
  };
  authorAffinity?: Record<string, number> | null;
  updatedAt: string;
};

const { blogApi } = useApi();
const { user, refreshMe } = useAuth();
const activeFeed = ref<FeedType>("recommended");
const articles = ref<Article[]>([]);
const nextCursor = ref<number | null>(null);
const feedMeta = ref<FeedResponse | null>(null);
const profile = ref<RecoProfile | null>(null);
const loading = ref(false);
const loadingMore = ref(false);
const profileLoading = ref(false);
const profileRefreshing = ref(false);
const error = ref("");

const profileReady = computed(() => Boolean(profile.value && topTags.value.length > 0));
const topTags = computed(() => {
  const tags = profile.value?.tagVector?.tags ?? {};
  const entries = Object.entries(tags)
    .map(([name, value]) => ({ name, value: Math.max(0, Number(value) || 0) }))
    .filter((item) => item.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, 8);
  const max = Math.max(1, ...entries.map((item) => item.value));
  return entries.map((item) => {
    const ratio = item.value / max;
    return {
      ...item,
      percent: Math.round(ratio * 100),
      size: Math.round(74 + ratio * 58),
      alpha: Math.max(0.52, Math.min(0.95, 0.42 + ratio * 0.48)),
    };
  });
});
const profileStats = computed(() => ({
  events: profile.value?.tagVector?.updatedFromEvents ?? 0,
  authors: Object.keys(profile.value?.authorAffinity ?? {}).length,
}));
const profileUpdatedAt = computed(() => profile.value?.updatedAt ?? "");

onMounted(async () => {
  await refreshMe();
  await Promise.all([loadFeed(), loadProfile()]);
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

async function loadProfile() {
  if (!user.value) {
    profile.value = null;
    return;
  }
  profileLoading.value = true;
  try {
    const payload = await blogApi<{ profile: RecoProfile | null }>("/reco/profile/me");
    profile.value = payload.profile;
  } finally {
    profileLoading.value = false;
  }
}

async function refreshProfile() {
  if (!user.value) return;
  profileRefreshing.value = true;
  try {
    const payload = await blogApi<{ profile: RecoProfile }>("/reco/profile/me/refresh", { method: "POST" });
    profile.value = payload.profile;
    await loadFeed();
  } finally {
    profileRefreshing.value = false;
  }
}

function handleArticleCreated(payload: CreateArticleResponse) {
  if (payload.article.status !== "PUBLISHED" && payload.article.status !== "LOW_PRIORITY") return;
  articles.value = [payload.article, ...articles.value.filter((article) => article.id !== payload.article.id)];
  activeFeed.value = "recommended";
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}
</script>
