<template>
  <div class="page">
    <div v-if="!user" class="panel">
      <h2>通知中心</h2>
      <p class="muted">登录后可以查看发布、评论、reaction 和关注提醒。</p>
      <NuxtLink to="/login">
        <button class="primary">登录</button>
      </NuxtLink>
    </div>

    <div v-else class="grid">
      <section class="stack">
        <div class="panel notification-head">
          <div>
            <h2>通知中心</h2>
            <p class="muted">聚合内容发布、互动提醒和关系变化。</p>
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
        <div v-else-if="notifications.length === 0" class="panel empty">暂无通知</div>

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
          <div class="tags">
            <span class="tag">发布结果</span>
            <span class="tag">审核反馈</span>
            <span class="tag">评论</span>
            <span class="tag">回复</span>
            <span class="tag">reaction</span>
            <span class="tag">关注</span>
          </div>
        </div>
        <div class="panel">
          <h3>闭环说明</h3>
          <p class="muted">通知中心会反馈内容审核结果、互动提醒和关系变化，帮助用户了解内容处理状态。</p>
        </div>
      </aside>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { NotificationItem } from "~/types/social";

const { blogApi } = useApi();
const { user, refreshMe } = useAuth();
const notifications = ref<NotificationItem[]>([]);
const nextCursor = ref<number | null>(null);
const unreadCount = useState<number>("notifications:unread", () => 0);
const loading = ref(false);
const loadingMore = ref(false);
const error = ref("");

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
