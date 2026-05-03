<template>
  <section class="panel composer">
    <form v-if="user" class="form" @submit.prevent="submitArticle">
      <div class="composer-head">
        <div>
          <h3>发布动态</h3>
          <p class="muted">分享内容、添加标签，发布后会进入信息流。</p>
        </div>
        <span class="status-pill risk-low">{{ user.username }}</span>
      </div>

      <textarea v-model="content" maxlength="10000" placeholder="写下你想分享的内容" />
      <input v-model="tagInput" maxlength="191" placeholder="标签，使用逗号分隔" />

      <div class="composer-actions">
        <span class="muted">{{ contentLength }} / 10000</span>
        <button class="primary" :disabled="submitting || !content.trim()">
          {{ submitting ? "发布中" : "发布" }}
        </button>
      </div>
    </form>

    <div v-else class="composer-login">
      <div>
        <h3>发布动态</h3>
        <p class="muted">登录后可以发布内容、参与评论和 reaction。</p>
      </div>
      <NuxtLink to="/login">
        <button class="primary">登录</button>
      </NuxtLink>
    </div>

    <p v-if="error" class="error">{{ error }}</p>

    <div v-if="lastResult" class="publish-result">
      <div class="row" style="justify-content: space-between">
        <strong>发布成功</strong>
        <NuxtLink :to="`/article/${lastResult.article.id}`">
          <button class="ghost">查看</button>
        </NuxtLink>
      </div>
      <ContentProfilePanel
        :analysis="lastResult.article.aiAnalysis"
        :tags="lastResult.article.aiTags"
      />
    </div>
  </section>
</template>

<script setup lang="ts">
import type { CreateArticleResponse } from "~/types/social";

const emit = defineEmits<{
  created: [payload: CreateArticleResponse];
}>();

const { blogApi } = useApi();
const { user, refreshMe } = useAuth();
const content = ref("");
const tagInput = ref("");
const submitting = ref(false);
const error = ref("");
const lastResult = ref<CreateArticleResponse | null>(null);

const contentLength = computed(() => Array.from(content.value).length);

async function submitArticle() {
  if (!content.value.trim()) return;
  submitting.value = true;
  error.value = "";
  try {
    const tags = parseTags(tagInput.value);
    const payload = await blogApi<CreateArticleResponse>("/articles", {
      method: "POST",
      body: {
        content: content.value,
        tag: tags[0],
        tags,
      },
    });
    content.value = "";
    tagInput.value = "";
    lastResult.value = payload;
    emit("created", payload);
    await refreshMe();
  } catch (err) {
    error.value = err instanceof Error ? err.message : "发布失败";
  } finally {
    submitting.value = false;
  }
}

function parseTags(value: string) {
  return [...new Set(value.split(/[,，\s]+/).map((item) => item.trim()).filter(Boolean))].slice(0, 8);
}
</script>
