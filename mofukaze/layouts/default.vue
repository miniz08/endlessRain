<template>
  <div class="app-shell">
    <header class="topbar">
      <div class="topbar-inner">
        <NuxtLink class="brand" to="/">LongSeason</NuxtLink>
        <form class="topbar-search" role="search" @submit.prevent="submitSiteSearch">
          <input v-model.trim="siteSearch" type="search" placeholder="搜索博客 / 用户" autocomplete="off" />
          <button class="primary" :disabled="siteSearch.length === 0">搜索</button>
        </form>
        <nav class="nav">
          <NuxtLink to="/">推荐</NuxtLink>
          <NuxtLink to="/topics">主题</NuxtLink>
          <NuxtLink v-if="user" :to="`/u/${user.id}`">我的主页</NuxtLink>
          <NuxtLink v-if="user" to="/chat">私信</NuxtLink>
          <NuxtLink v-if="user" class="nav-notification" to="/notifications">
            通知
            <span v-if="unreadNotifications > 0" class="nav-badge">{{ unreadNotifications }}</span>
          </NuxtLink>
          <NuxtLink v-if="isOperator" to="/ops">运维</NuxtLink>
          <NuxtLink v-if="!user" to="/login">登录</NuxtLink>
          <NuxtLink v-if="!user" to="/register">注册</NuxtLink>
          <button v-else class="ghost" @click="logout">退出</button>
        </nav>
      </div>
    </header>
    <main>
      <slot />
    </main>
  </div>
</template>

<script setup lang="ts">
const { blogApi } = useApi();
const { user, refreshMe, logout } = useAuth();
const route = useRoute();
const unreadNotifications = useState<number>("notifications:unread", () => 0);
const siteSearch = ref("");
const isOperator = computed(() => {
  const role = user.value?.role?.toLowerCase();
  return role === "admin";
});

watch(
  user,
  () => {
    if (user.value) {
      void loadUnreadNotifications();
    } else {
      unreadNotifications.value = 0;
    }
  },
  { immediate: false },
);

onMounted(async () => {
  await refreshMe();
});

watch(
  () => [route.path, route.query.q],
  () => {
    siteSearch.value = route.path === "/search" && typeof route.query.q === "string" ? route.query.q : "";
  },
  { immediate: true },
);

async function loadUnreadNotifications() {
  const payload = await blogApi<{ count: number }>("/notifications/unread-count").catch(() => ({ count: 0 }));
  unreadNotifications.value = payload.count;
}

async function submitSiteSearch() {
  const keyword = siteSearch.value.trim();
  if (!keyword) return;
  await navigateTo(`/search?q=${encodeURIComponent(keyword)}`);
}
</script>
