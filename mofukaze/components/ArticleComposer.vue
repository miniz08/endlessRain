<template>
  <section class="panel composer">
    <form v-if="user" class="form" @submit.prevent="submitArticle">
      <div class="composer-head">
        <div>
          <h3>发布动态</h3>
        </div>
        <span class="status-pill risk-low">{{ user.username }}</span>
      </div>

      <TiptapEditor
        ref="editorRef"
        v-model="content"
        :disabled="submitting"
        :max-length="10000"
        placeholder="写下你想分享的内容"
      />

      <input v-model="tagInput" maxlength="191" placeholder="标签，使用逗号分隔" />

      <div class="composer-actions">
        <span class="muted">{{ contentLength }} / 10000</span>
        <button class="primary" :disabled="submitting || !canSubmit">
          {{ submitting ? "发布中" : "发布" }}
        </button>
      </div>
    </form>

    <div v-else class="composer-login">
      <div>
        <h3>发布动态</h3>
      </div>
      <NuxtLink to="/login">
        <button class="primary">登录</button>
      </NuxtLink>
      <NuxtLink to="/register">
        <button>注册</button>
      </NuxtLink>
    </div>

    <p v-if="error" class="error">{{ error }}</p>

    <div v-if="lastResult" class="publish-result">
      <div class="row" style="justify-content: space-between">
        <div>
          <strong>{{ reviewTitle(lastResult.review.status) }}</strong>
          <p class="muted" style="margin: 4px 0 0">{{ reviewBody(lastResult) }}</p>
        </div>
        <span class="status-pill" :class="reviewClass(lastResult.review.status)">
          {{ reviewStatusLabel(lastResult.review.status) }}
        </span>
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
import TiptapEditor from "~/components/editor/TiptapEditor.vue";
import type { CreateArticleResponse } from "~/types/social";

type TiptapEditorExpose = {
  clear: () => void;
  getText: () => string;
  isEmpty: () => boolean;
};

const emit = defineEmits<{
  created: [payload: CreateArticleResponse];
}>();

const { blogApi } = useApi();
const { user, refreshMe } = useAuth();
const content = ref("");
const tagInput = ref("");
const editorRef = ref<TiptapEditorExpose | null>(null);
const submitting = ref(false);
const error = ref("");
const lastResult = ref<CreateArticleResponse | null>(null);

const contentLength = computed(() => Array.from(editorRef.value?.getText() ?? stripHtml(content.value)).length);
const canSubmit = computed(() => contentLength.value <= 10000 && !(editorRef.value?.isEmpty() ?? isHtmlEmpty(content.value)));

async function submitArticle() {
  if (!canSubmit.value) return;
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
    editorRef.value?.clear();
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
  return [...new Set(value.split(/[,\s，、]+/u).map((item) => item.trim()).filter(Boolean))].slice(0, 8);
}

function stripHtml(value: string) {
  return value.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").trim();
}

function isHtmlEmpty(value: string) {
  return !stripHtml(value) && !/<(img|video|audio)\b/i.test(value) && !/data-type=["']latex["']/i.test(value);
}

function reviewTitle(status: CreateArticleResponse["review"]["status"]) {
  if (status === "PUBLISHED") return "审核通过";
  if (status === "LOW_PRIORITY") return "已发布，展示优先级较低";
  if (status === "REJECTED") return "未通过审核";
  if (status === "REVIEW_REQUIRED") return "已进入复核";
  return "等待审核";
}

function reviewStatusLabel(status: CreateArticleResponse["review"]["status"]) {
  if (status === "PUBLISHED") return "公开";
  if (status === "LOW_PRIORITY") return "降权";
  if (status === "REJECTED") return "拒绝";
  if (status === "REVIEW_REQUIRED") return "复核";
  return "待审";
}

function reviewClass(status: CreateArticleResponse["review"]["status"]) {
  if (status === "PUBLISHED") return "risk-low";
  if (status === "LOW_PRIORITY" || status === "REVIEW_REQUIRED") return "risk-mid";
  return "risk-high";
}

function reviewBody(payload: CreateArticleResponse) {
  return payload.review.reason || payload.review.suggestion || payload.article.reviewReason || "处理结果已同步到通知中心";
}
</script>
