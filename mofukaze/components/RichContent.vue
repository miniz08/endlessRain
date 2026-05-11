<template>
  <div class="rich-content" :class="{ compact }">
    <template v-for="part in parts" :key="part.key">
      <span v-if="part.type === 'text'">{{ part.value }}</span>
      <span v-else-if="part.type === 'math-inline'" class="math-inline" v-html="part.html"></span>
      <span v-else-if="part.type === 'math-block'" class="math-block" v-html="part.html"></span>
      <img v-else-if="part.type === 'image'" class="rich-image" :src="part.src" :alt="part.alt" loading="lazy" />
    </template>
  </div>
</template>

<script setup lang="ts">
import katex from "katex";

type RichPart =
  | { key: string; type: "text"; value: string }
  | { key: string; type: "math-inline" | "math-block"; html: string }
  | { key: string; type: "image"; src: string; alt: string };

const props = defineProps<{
  content: string;
  compact?: boolean;
}>();

const parts = computed(() => parseRichContent(props.content));

function parseRichContent(content: string): RichPart[] {
  const result: RichPart[] = [];
  let index = 0;
  let textStart = 0;

  function pushText(end: number) {
    if (end > textStart) {
      result.push({ key: `text-${textStart}`, type: "text", value: content.slice(textStart, end) });
    }
  }

  while (index < content.length) {
    const image = matchImage(content, index);
    if (image) {
      pushText(index);
      result.push({ key: `image-${index}`, type: "image", src: image.src, alt: image.alt });
      index += image.length;
      textStart = index;
      continue;
    }

    if (content.startsWith("$$", index)) {
      const end = content.indexOf("$$", index + 2);
      if (end > index + 2) {
        pushText(index);
        result.push({
          key: `math-block-${index}`,
          type: "math-block",
          html: renderMath(content.slice(index + 2, end), true),
        });
        index = end + 2;
        textStart = index;
        continue;
      }
    }

    if (content[index] === "$" && content[index + 1] !== "$") {
      const end = findClosingDollar(content, index + 1);
      if (end > index + 1) {
        pushText(index);
        result.push({
          key: `math-inline-${index}`,
          type: "math-inline",
          html: renderMath(content.slice(index + 1, end), false),
        });
        index = end + 1;
        textStart = index;
        continue;
      }
    }

    index += 1;
  }

  pushText(content.length);
  return result;
}

function matchImage(content: string, index: number): { alt: string; src: string; length: number } | null {
  if (!content.startsWith("![", index)) return null;
  const altEnd = content.indexOf("](", index + 2);
  if (altEnd < 0) return null;
  const urlEnd = content.indexOf(")", altEnd + 2);
  if (urlEnd < 0) return null;

  const src = safeImageUrl(content.slice(altEnd + 2, urlEnd));
  if (!src) return null;

  return {
    alt: content.slice(index + 2, altEnd).trim() || "uploaded image",
    src,
    length: urlEnd - index + 1,
  };
}

function safeImageUrl(raw: string): string {
  const value = raw.trim();
  if (!value) return "";
  if (value.startsWith("/media/img/uni/") || value.startsWith("/api/users/media/img/uni/")) return value;
  if (value.startsWith("http://") || value.startsWith("https://")) return value;
  return "";
}

function findClosingDollar(content: string, start: number): number {
  for (let index = start; index < content.length; index += 1) {
    if (content[index] === "$" && content[index - 1] !== "\\") return index;
  }
  return -1;
}

function renderMath(source: string, displayMode: boolean): string {
  return katex.renderToString(source.trim(), {
    displayMode,
    throwOnError: false,
    trust: false,
    strict: false,
  });
}
</script>
