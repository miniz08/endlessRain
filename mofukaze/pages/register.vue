<template>
  <div class="page auth-page">
    <section class="panel auth-panel wide">
      <h2>注册</h2>

      <form class="form" @submit.prevent="submit">
        <label>
          <span class="muted">用户名</span>
          <input v-model.trim="username" autocomplete="username" maxlength="32" required />
        </label>
        <label>
          <span class="muted">邮箱</span>
          <input v-model.trim="email" type="email" autocomplete="email" required />
        </label>
        <label>
          <span class="muted">密码</span>
          <input v-model="password" type="password" autocomplete="new-password" minlength="6" required />
        </label>
        <label>
          <span class="muted">确认密码</span>
          <input v-model="confirmPassword" type="password" autocomplete="new-password" minlength="6" required />
        </label>

        <p v-if="error" class="error">{{ error }}</p>
        <button class="primary" type="submit" :disabled="loading || !canSubmit">
          {{ loading ? "注册中" : "注册并登录" }}
        </button>
      </form>

      <p class="muted">
        已有账号？
        <NuxtLink class="text-link" to="/login">去登录</NuxtLink>
      </p>
    </section>
  </div>
</template>

<script setup lang="ts">
const { register } = useAuth();
const username = ref("");
const email = ref("");
const password = ref("");
const confirmPassword = ref("");
const loading = ref(false);
const error = ref("");

const canSubmit = computed(() =>
  Boolean(username.value.trim() && email.value.trim() && password.value.length >= 6 && password.value === confirmPassword.value),
);

async function submit() {
  error.value = "";
  if (password.value !== confirmPassword.value) {
    error.value = "两次输入的密码不一致";
    return;
  }
  if (!canSubmit.value) return;

  loading.value = true;
  try {
    await register({
      username: username.value,
      email: email.value,
      password: password.value,
    });
    await navigateTo("/");
  } catch (err) {
    error.value = err instanceof Error ? err.message : "注册失败";
  } finally {
    loading.value = false;
  }
}
</script>
