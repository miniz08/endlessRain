<template>
  <div class="page">
    <div class="grid">
      <section>
        <div v-if="error" class="panel error">{{ error }}</div>
        <div v-else-if="!article" class="panel empty">加载中</div>
        <template v-else>
          <ArticleCard :article="article" />
          <div class="panel">
            <div class="row" style="justify-content: space-between">
              <h3>评论 {{ comments.length }}</h3>
              <button class="ghost" :disabled="!isPublicArticle" @click="markReadComplete">标记已读</button>
            </div>
            <form v-if="user && isPublicArticle" class="form" @submit.prevent="submitComment">
              <textarea v-model="commentText" placeholder="写下你的评论" />
              <button class="primary" :disabled="submitting">{{ submitting ? "发送中" : "发布评论" }}</button>
            </form>
            <p v-else-if="!isPublicArticle" class="muted">评论暂停</p>
            <p v-else class="muted">登录后可评论</p>

            <div v-if="comments.length === 0" class="empty">暂无评论</div>
            <div v-for="comment in comments" :key="comment.id" class="panel" style="margin-top: 10px">
              <div class="article-meta">
                <NuxtLink :to="`/u/${comment.author.id}`">
                  <strong>{{ comment.author.username }}</strong>
                </NuxtLink>
                <span>{{ formatTime(comment.posttime) }}</span>
              </div>
              <RichContent class="article-content" :content="comment.content" compact />
              <div class="reactions">
                <button
                  v-for="emoji in reactionEmojis"
                  :key="emoji"
                  :class="{ primary: comment.reactions.myReactions.includes(emoji) }"
                  @click="toggleCommentReaction(comment.id, emoji)"
                >
                  {{ emoji }} {{ commentReactionCount(comment, emoji) || "" }}
                </button>
                <span class="muted">共 {{ comment.reactions.total }}</span>
              </div>
            </div>
          </div>
        </template>
      </section>

      <aside class="stack">
        <div v-if="article" class="panel">
          <h3>作者</h3>
          <p>{{ article.author.username }}</p>
          <p class="muted">专业度 {{ article.author.professionalism }} / 友好度 {{ article.author.friendliness }}</p>
          <FollowButton :user-id="article.author.id" :article-id="article.id" />
        </div>
      </aside>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { Article, Comment } from "~/types/social";
import { REACTION_EMOJIS } from "~/utils/reactionEmojis";

const route = useRoute();
const articleId = computed(() => Number(route.params.id));
const { blogApi } = useApi();
const { user, refreshMe } = useAuth();
const article = ref<Article | null>(null);
const comments = ref<Comment[]>([]);
const commentText = ref("");
const submitting = ref(false);
const error = ref("");
const enteredAt = Date.now();
const reactionEmojis = REACTION_EMOJIS.slice(0, 6);
const isPublicArticle = computed(() => article.value?.status === "PUBLISHED" || article.value?.status === "LOW_PRIORITY");

onMounted(async () => {
  await refreshMe();
  await loadArticle();
  if (isPublicArticle.value) {
    await loadComments();
  }
});

onBeforeUnmount(() => {
  void recordDwell();
});

async function loadArticle() {
  const payload = await blogApi<{ article: Article }>(`/articles/${articleId.value}`);
  article.value = payload.article;
}

async function loadComments() {
  const payload = await blogApi<{ items: Comment[] }>(`/articles/${articleId.value}/comments?limit=50`);
  comments.value = payload.items;
}

async function submitComment() {
  if (!commentText.value.trim()) return;
  submitting.value = true;
  try {
    await blogApi(`/articles/${articleId.value}/comments`, {
      method: "POST",
      body: { content: commentText.value },
    });
    commentText.value = "";
    await loadComments();
  } finally {
    submitting.value = false;
  }
}

async function toggleCommentReaction(commentId: number, emoji: string) {
  if (!user.value) {
    await navigateTo("/login");
    return;
  }
  const payload = await blogApi<{ summary: Comment["reactions"] }>(`/comments/${commentId}/reactions`, {
    method: "POST",
    body: { emoji },
  });
  const comment = comments.value.find((item) => item.id === commentId);
  if (comment) comment.reactions = payload.summary;
}

function commentReactionCount(comment: Comment, emoji: string) {
  return comment.reactions.counts.find((item) => item.emoji === emoji)?.count ?? 0;
}

async function markReadComplete() {
  if (!isPublicArticle.value) return;
  await blogApi("/reco/events", {
    method: "POST",
    body: {
      articleId: articleId.value,
      eventType: "READ_COMPLETE",
      scene: "article_detail",
    },
  });
}

async function recordDwell() {
  if (!isPublicArticle.value) return;
  const dwellMs = Math.max(0, Date.now() - enteredAt);
  if (dwellMs < 1000) return;
  await blogApi("/reco/events", {
    method: "POST",
    body: {
      articleId: articleId.value,
      eventType: "DWELL",
      dwellMs,
      scene: "article_detail",
    },
  }).catch(() => undefined);
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
