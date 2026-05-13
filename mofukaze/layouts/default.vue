<template>
  <div class="app-shell">
    <header class="topbar">
      <div class="topbar-inner">
        <NuxtLink class="brand" to="/">LongSeason 社交平台</NuxtLink>
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
const unreadNotifications = useState<number>("notifications:unread", () => 0);
const isOperator = computed(() => {
  const role = user.value?.role?.toLowerCase();
  return role === "admin" || role === "reviewer";
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

async function loadUnreadNotifications() {
  const payload = await blogApi<{ count: number }>("/notifications/unread-count").catch(() => ({ count: 0 }));
  unreadNotifications.value = payload.count;
}
</script>
