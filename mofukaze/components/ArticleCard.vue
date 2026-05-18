<template>
  <article class="article-card">
    <div class="article-meta">
      <NuxtLink class="row" :to="`/u/${article.author.id}`">
        <span class="avatar">
          <img v-if="article.author.avatar" :src="article.author.avatar" alt="" />
          <span v-else>{{ article.author.username.slice(0, 1).toUpperCase() }}</span>
        </span>
        <strong>{{ article.author.username }}</strong>
      </NuxtLink>
      <span>{{ formatTime(article.posttime) }}</span>
      <span v-if="article.status !== 'PUBLISHED'" class="status-pill" :class="statusClass(article.status)">
        {{ statusLabel(article.status) }}
      </span>
    </div>

    <NuxtLink :to="`/article/${article.id}`">
      <RichContent class="article-content" :content="compact ? article.excerpt : article.content" :compact="compact" />
    </NuxtLink>

    <div class="tags">
      <NuxtLink class="tag tag-link" :to="topicLink(article.tag)">{{ article.tag }}</NuxtLink>
      <NuxtLink
        v-for="tag in visibleTags"
        :key="tag.name"
        class="tag tag-link"
        :to="topicLink(tag.name)"
      >
        {{ tag.name }}
      </NuxtLink>
    </div>

    <ContentProfilePanel
      :analysis="article.aiAnalysis"
      :tags="article.aiTags"
      compact
    />

    <div class="row" style="margin-top: 10px">
      <span class="muted">评论 {{ article.commentCount }}</span>
      <span v-if="article.recommendation" class="muted">推荐分 {{ article.recommendation.total }}</span>
    </div>

    <div v-if="isPublicArticle" class="reactions" style="margin-top: 10px">
      <button
        v-for="emoji in visibleEmojis"
        :key="emoji"
        :class="{ primary: localReactions.myReactions.includes(emoji) }"
        :title="`使用 ${emoji}`"
        @click="toggleReaction(emoji)"
      >
        {{ emoji }} {{ reactionCount(emoji) || "" }}
      </button>
      <span class="muted">共 {{ localReactions.total }}</span>
    </div>
  </article>
</template>

<script setup lang="ts">
import type { Article } from "~/types/social";
import { REACTION_EMOJIS } from "~/utils/reactionEmojis";

const props = defineProps<{
  article: Article;
  compact?: boolean;
}>();

const emit = defineEmits<{
  updated: [];
}>();

const { isLoggedIn } = useAuth();
const { blogApi } = useApi();
const visibleEmojis = REACTION_EMOJIS.slice(0, 8);
const localReactions = ref(props.article.reactions);
const isPublicArticle = computed(() => props.article.status === "PUBLISHED" || props.article.status === "LOW_PRIORITY");
const visibleTags = computed(() => {
  const seen = new Set([props.article.tag]);
  return [...props.article.manualTags, ...props.article.aiTags]
    .filter((tag) => {
      if (!tag.name || seen.has(tag.name)) return false;
      seen.add(tag.name);
      return true;
    })
    .slice(0, 5);
});

watch(
  () => props.article.reactions,
  (value) => {
    localReactions.value = value;
  },
);

function reactionCount(emoji: string) {
  return localReactions.value.counts.find((item) => item.emoji === emoji)?.count ?? 0;
}

async function toggleReaction(emoji: string) {
  if (!isLoggedIn.value) {
    await navigateTo("/login");
    return;
  }
  const payload = await blogApi<{ summary: Article["reactions"] }>(`/articles/${props.article.id}/reactions`, {
    method: "POST",
    body: { emoji },
  });
  localReactions.value = payload.summary;
  emit("updated");
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function topicLink(tag: string) {
  return `/topic?tag=${encodeURIComponent(tag)}`;
}

function statusLabel(status: Article["status"]) {
  if (status === "LOW_PRIORITY") return "低优先级";
  if (status === "PENDING_REVIEW") return "待审核";
  if (status === "REVIEW_REQUIRED") return "复核中";
  if (status === "REJECTED") return "未通过";
  return "公开";
}

function statusClass(status: Article["status"]) {
  if (status === "LOW_PRIORITY" || status === "REVIEW_REQUIRED" || status === "PENDING_REVIEW") return "risk-mid";
  if (status === "REJECTED") return "risk-high";
  return "risk-low";
}
</script>
