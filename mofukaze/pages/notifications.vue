<template>
  <div class="page">
    <div v-if="!user" class="panel">
      <h2>通知中心</h2>
      <NuxtLink to="/login">
        <button class="primary">登录</button>
      </NuxtLink>
    </div>

    <div v-else class="grid">
      <section class="stack">
        <div class="panel notification-head">
          <div>
            <h2>通知中心</h2>
          </div>
          <div class="row">
            <span class="status-pill" :class="unreadCount > 0 ? 'risk-mid' : 'risk-low'">
              未读 {{ unreadCount }}
            </span>
            <button class="ghost" :disabled="loading" @click="refreshNotifications">刷新</button>
            <button class="primary" :disabled="unreadCount === 0" @click="markAllRead">全部已读</button>
          </div>
        </div>

        <div v-if="error" class="panel error">{{ error }}</div>
        <div v-else-if="loading" class="panel empty">加载中</div>
        <div v-else-if="notifications.length === 0" class="panel empty">
          暂无{{ activeFilterLabel }}通知
        </div>

        <article
          v-for="item in notifications"
          :key="item.id"
          class="panel notification-card"
          :class="{ unread: !item.readAt }"
        >
          <div class="row" style="justify-content: space-between">
            <div class="row">
              <span class="status-dot" :class="notificationClass(item.type)"></span>
              <strong>{{ item.title }}</strong>
            </div>
            <span class="muted">{{ formatTime(item.createdAt) }}</span>
          </div>
          <p v-if="item.body" class="muted">{{ item.body }}</p>
          <div class="row" style="justify-content: space-between">
            <NuxtLink v-if="item.link" :to="item.link">
              <button class="ghost" @click="markRead(item)">查看</button>
            </NuxtLink>
            <span v-else></span>
            <button v-if="!item.readAt" @click="markRead(item)">标记已读</button>
          </div>
        </article>

        <button v-if="nextCursor" class="primary" :disabled="loadingMore" @click="loadMore">
          {{ loadingMore ? "加载中" : "加载更多" }}
        </button>
      </section>

      <aside class="stack">
        <div class="panel">
          <h3>通知类型</h3>
          <div class="tags notification-filters">
            <button
              v-for="filter in filters"
              :key="filter.key"
              type="button"
              class="tag filter-chip"
              :class="{ active: activeFilter === filter.key }"
              @click="setFilter(filter.key)"
            >
              {{ filter.label }}
            </button>
          </div>
        </div>
      </aside>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { NotificationItem } from "~/types/social";

type FilterKey = "all" | "publish" | "review" | "comment" | "reply" | "reaction" | "follow";
type NotificationType = NotificationItem["type"];

const filters: Array<{ key: FilterKey; label: string; types: NotificationType[] }> = [
  { key: "all", label: "全部", types: [] },
  { key: "publish", label: "发布结果", types: ["CONTENT_PUBLISHED"] },
  {
    key: "review",
    label: "审核反馈",
    types: [
      "CONTENT_REVIEW_APPROVED",
      "CONTENT_REVIEW_LIMITED",
      "CONTENT_REVIEW_REQUIRED",
      "CONTENT_REVIEW_REJECTED",
      "CONTENT_REVIEW_FAILED",
    ],
  },
  { key: "comment", label: "评论", types: ["COMMENT"] },
  { key: "reply", label: "回复", types: ["REPLY"] },
  { key: "reaction", label: "reaction", types: ["ARTICLE_REACTION", "COMMENT_REACTION"] },
  { key: "follow", label: "关注", types: ["FOLLOW"] },
];

const { blogApi } = useApi();
const { user, refreshMe } = useAuth();
const notifications = ref<NotificationItem[]>([]);
const nextCursor = ref<number | null>(null);
const unreadCount = useState<number>("notifications:unread", () => 0);
const activeFilter = ref<FilterKey>("all");
const loading = ref(false);
const loadingMore = ref(false);
const error = ref("");

const activeFilterConfig = computed(() => filters.find((filter) => filter.key === activeFilter.value) ?? filters[0]);
const activeFilterLabel = computed(() => (activeFilterConfig.value.key === "all" ? "" : activeFilterConfig.value.label));

onMounted(async () => {
  await refreshMe();
  if (!user.value) return;
  await Promise.all([loadNotifications(), loadUnreadCount()]);
});

async function loadNotifications(cursor?: number) {
  if (cursor) {
    loadingMore.value = true;
  } else {
    loading.value = true;
  }
  error.value = "";
  try {
    const query = new URLSearchParams({ limit: "20" });
    if (cursor) query.set("cursor", String(cursor));
    if (activeFilterConfig.value.types.length > 0) {
      query.set("types", activeFilterConfig.value.types.join(","));
    }
    const payload = await blogApi<{ items: NotificationItem[]; nextCursor: number | null }>(`/notifications?${query.toString()}`);
    if (cursor) {
      notifications.value.push(...payload.items);
    } else {
      notifications.value = payload.items;
    }
    nextCursor.value = payload.nextCursor;
  } catch (err) {
    error.value = err instanceof Error ? err.message : "通知加载失败";
  } finally {
    loading.value = false;
    loadingMore.value = false;
  }
}

async function loadUnreadCount() {
  const payload = await blogApi<{ count: number }>("/notifications/unread-count");
  unreadCount.value = payload.count;
}

async function markRead(item: NotificationItem) {
  if (!item.readAt) {
    await blogApi(`/notifications/${item.id}/read`, { method: "PATCH" });
    item.readAt = new Date().toISOString();
    unreadCount.value = Math.max(0, unreadCount.value - 1);
  }
}

async function markAllRead() {
  await blogApi("/notifications/read-all", { method: "PATCH" });
  for (const item of notifications.value) {
    item.readAt ??= new Date().toISOString();
  }
  unreadCount.value = 0;
}

async function loadMore() {
  if (!nextCursor.value) return;
  await loadNotifications(nextCursor.value);
}

async function refreshNotifications() {
  await Promise.all([loadNotifications(), loadUnreadCount()]);
}

async function setFilter(filter: FilterKey) {
  if (activeFilter.value === filter) return;
  activeFilter.value = filter;
  nextCursor.value = null;
  await loadNotifications();
}

function notificationClass(type: NotificationItem["type"]) {
  if (type === "CONTENT_PUBLISHED" || type === "CONTENT_REVIEW_APPROVED") return "risk-low";
  if (type === "CONTENT_REVIEW_LIMITED" || type === "CONTENT_REVIEW_REQUIRED" || type === "FOLLOW") return "risk-mid";
  if (type === "CONTENT_REVIEW_REJECTED" || type === "CONTENT_REVIEW_FAILED") return "risk-high";
  return "risk-high";
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
