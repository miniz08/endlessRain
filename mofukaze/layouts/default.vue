<template>
  <div class="app-shell">
    <header class="topbar">
      <div class="topbar-inner">
        <NuxtLink class="brand" to="/">LongSeason 社交平台</NuxtLink>
        <nav class="nav">
          <NuxtLink to="/">信息流</NuxtLink>
          <NuxtLink v-if="user" :to="`/u/${user.id}`">我的主页</NuxtLink>
          <NuxtLink v-if="user" to="/chat">私信</NuxtLink>
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
const { user, refreshMe, logout } = useAuth();
const isOperator = computed(() => {
  const role = user.value?.role?.toLowerCase();
  return role === "admin" || role === "reviewer";
});

onMounted(() => {
  if (!user.value) void refreshMe();
});
</script>
