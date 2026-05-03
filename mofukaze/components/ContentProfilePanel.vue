<template>
  <div class="content-profile" :class="{ compact }">
    <div class="content-profile-head">
      <strong>内容画像</strong>
    </div>

    <div v-if="analysis" class="score-grid">
      <div v-for="item in scoreItems" :key="item.key" class="score-item">
        <div class="score-row">
          <span>{{ item.label }}</span>
          <strong :class="scoreTone(item.value)">{{ item.value }}</strong>
        </div>
        <div class="score-bar">
          <span :class="scoreTone(item.value)" :style="{ width: `${clampScore(item.value)}%` }" />
        </div>
      </div>
    </div>

    <div v-if="visibleTags.length" class="tags">
      <span v-for="tag in visibleTags" :key="tag.name" class="tag">
        {{ tag.name }}
      </span>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { AiAnalysis } from "~/types/social";

const props = defineProps<{
  analysis?: AiAnalysis | null;
  tags?: Array<{ name: string; confidence?: number | null; weight?: number | null }>;
  compact?: boolean;
}>();

const scoreItems = computed(() => {
  if (!props.analysis) return [];
  return [
    { key: "professionalism", label: "专业度", value: props.analysis.professionalismScore },
    { key: "friendliness", label: "友好度", value: props.analysis.friendlinessScore },
    { key: "rationality", label: "理性度", value: props.analysis.rationalityScore },
  ];
});

const visibleTags = computed(() => (props.tags ?? []).slice(0, props.compact ? 5 : 10));

function clampScore(value: number) {
  return Math.max(0, Math.min(100, value));
}

function scoreTone(value: number) {
  if (value >= 80) return "score-low";
  if (value >= 60) return "score-mid";
  return "score-high";
}
</script>
