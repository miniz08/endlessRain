<template>
  <div class="page">
    <section class="panel" style="max-width: 420px">
      <h2>登录</h2>
      <p class="muted">使用用户名或邮箱进入你的账号。</p>
      <form class="form" @submit.prevent="submit">
        <label>
          <span class="muted">用户名或邮箱</span>
          <input v-model.trim="identifier" autocomplete="username" required />
        </label>
        <label>
          <span class="muted">密码</span>
          <input v-model="password" type="password" autocomplete="current-password" required />
        </label>
        <p v-if="error" class="error">{{ error }}</p>
        <button class="primary" type="submit" :disabled="loading || !canSubmit">{{ loading ? "登录中" : "登录" }}</button>
      </form>
      <p class="muted">
        还没有账号？
        <NuxtLink class="text-link" to="/register">去注册</NuxtLink>
      </p>
    </section>
  </div>
</template>

<script setup lang="ts">
const { login } = useAuth();
const identifier = ref("");
const password = ref("");
const loading = ref(false);
const error = ref("");
const canSubmit = computed(() => Boolean(identifier.value.trim() && password.value));

async function submit() {
  if (!canSubmit.value) return;
  loading.value = true;
  error.value = "";
  try {
    await login(identifier.value, password.value);
    await navigateTo("/");
  } catch (err) {
    error.value = err instanceof Error ? err.message : "登录失败";
  } finally {
    loading.value = false;
  }
}
</script>
