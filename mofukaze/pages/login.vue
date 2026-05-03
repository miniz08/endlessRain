<template>
  <div class="page">
    <section class="panel" style="max-width: 420px">
      <h2>登录</h2>
      <form class="form" @submit.prevent="submit">
        <label>
          <span class="muted">用户名或邮箱</span>
          <input v-model="identifier" autocomplete="username" />
        </label>
        <label>
          <span class="muted">密码</span>
          <input v-model="password" type="password" autocomplete="current-password" />
        </label>
        <p v-if="error" class="error">{{ error }}</p>
        <button class="primary" :disabled="loading">{{ loading ? "登录中" : "登录" }}</button>
      </form>
    </section>
  </div>
</template>

<script setup lang="ts">
const { login } = useAuth();
const identifier = ref("");
const password = ref("");
const loading = ref(false);
const error = ref("");

async function submit() {
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
