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

      <textarea ref="contentInput" v-model="content" maxlength="10000" placeholder="写下你想分享的内容" />
      <input v-model="tagInput" maxlength="191" placeholder="标签，使用逗号分隔" />

      <div class="editor-toolbar">
        <button type="button" class="ghost" @click="insertFormula(false)">行内公式</button>
        <button type="button" class="ghost" @click="insertFormula(true)">独立公式</button>
        <button type="button" class="ghost" :disabled="uploadingKind === 'article'" @click="pickImage('article')">
          {{ uploadingKind === "article" ? "上传中" : "插入图片" }}
        </button>
        <button type="button" class="ghost" :disabled="uploadingKind === 'sticker'" @click="pickImage('sticker')">
          {{ uploadingKind === "sticker" ? "上传中" : "插入表情包" }}
        </button>
        <input ref="articleImageInput" type="file" accept="image/png,image/jpeg,image/gif,image/webp" hidden @change="handleImageUpload($event, 'article')" />
        <input ref="stickerInput" type="file" accept="image/png,image/jpeg,image/gif,image/webp" hidden @change="handleImageUpload($event, 'sticker')" />
      </div>

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
import type { CreateArticleResponse } from "~/types/social";

const emit = defineEmits<{
  created: [payload: CreateArticleResponse];
}>();

const { blogApi } = useApi();
const { user, refreshMe } = useAuth();
const { uploadImage } = useMediaUpload();
const content = ref("");
const tagInput = ref("");
const contentInput = ref<HTMLTextAreaElement | null>(null);
const articleImageInput = ref<HTMLInputElement | null>(null);
const stickerInput = ref<HTMLInputElement | null>(null);
const submitting = ref(false);
const error = ref("");
const uploadingKind = ref<"" | "article" | "sticker">("");
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
  return payload.review.reason || payload.review.suggestion || payload.article.reviewReason || "处理结果已同步到通知中心。";
}

function insertFormula(block: boolean) {
  void insertAtCursor(block ? "\n$$\nE = mc^2\n$$\n" : "$E = mc^2$");
}

function pickImage(kind: "article" | "sticker") {
  const input = kind === "article" ? articleImageInput.value : stickerInput.value;
  input?.click();
}

async function handleImageUpload(event: Event, kind: "article" | "sticker") {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;

  uploadingKind.value = kind;
  error.value = "";
  try {
    const payload = await uploadImage(file, kind);
    const label = kind === "sticker" ? "表情包" : "图片";
    await insertAtCursor(`\n![${label}](${payload.media.url})\n`);
  } catch (err) {
    error.value = err instanceof Error ? err.message : "图片上传失败";
  } finally {
    uploadingKind.value = "";
    input.value = "";
  }
}

async function insertAtCursor(markup: string) {
  const input = contentInput.value;
  if (!input) {
    content.value += markup;
    return;
  }

  const start = input.selectionStart ?? content.value.length;
  const end = input.selectionEnd ?? start;
  content.value = `${content.value.slice(0, start)}${markup}${content.value.slice(end)}`;
  await nextTick();
  input.focus();
  const cursor = start + markup.length;
  input.setSelectionRange(cursor, cursor);
}
</script>
