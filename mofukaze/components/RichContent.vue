<template>
  <div v-if="htmlMode" class="rich-content" :class="{ compact }" v-html="renderedHtml"></div>
  <div v-else class="rich-content" :class="{ compact }">
    <template v-for="part in parts" :key="part.key">
      <span v-if="part.type === 'text'">{{ part.value }}</span>
      <span v-else-if="part.type === 'math-inline'" class="math-inline" v-html="part.html"></span>
      <span v-else-if="part.type === 'math-block'" class="math-block" v-html="part.html"></span>
      <img v-else-if="part.type === 'image'" class="rich-image" :src="part.src" :alt="part.alt" loading="lazy" />
    </template>
  </div>
</template>

<script setup lang="ts">
import { renderLatexToHtml } from "~/utils/latex";

type RichPart =
  | { key: string; type: "text"; value: string }
  | { key: string; type: "math-inline" | "math-block"; html: string }
  | { key: string; type: "image"; src: string; alt: string };

const props = defineProps<{
  content: string;
  compact?: boolean;
}>();

const htmlMode = computed(() => looksLikeHtml(props.content));
const renderedHtml = computed(() => renderHtmlContent(props.content));
const parts = computed(() => parsePlainRichContent(props.content));

function looksLikeHtml(content: string): boolean {
  return /<\/?(p|h1|h2|h3|ul|ol|li|blockquote|pre|code|strong|em|s|a|img|span|hr|br)\b/i.test(content);
}

function renderHtmlContent(content: string): string {
  const latexTokens: string[] = [];
  let html = content.replace(/<!--[\s\S]*?-->/g, "");
  html = html.replace(/<(script|style|iframe|object|embed|svg|math|form|input|button|select|textarea|meta|link|base)\b[\s\S]*?<\/\1>/gi, "");
  html = html.replace(/<(script|style|iframe|object|embed|svg|math|form|input|button|select|textarea|meta|link|base)\b[^>]*\/?>/gi, "");

  html = html.replace(/<span\b([^>]*)data-type=(["'])latex\2([^>]*)>([\s\S]*?)<\/span>/gi, (_match, before: string, _quote: string, after: string, inner: string) => {
    const attrs = `${before} ${after}`;
    const source = readAttribute(attrs, "data-latex") || stripTags(inner).replace(/^\$|\$$/g, "");
    const token = `@@MOFUKAZE_LATEX_${latexTokens.length}@@`;
    latexTokens.push(`<span class="math-inline">${renderLatexToHtml(decodeHtml(source))}</span>`);
    return token;
  });

  html = html.replace(/<\/?([a-z][a-z0-9-]*)(\s[^>]*)?>/gi, (match, tagName: string, attrs = "") => {
    const tag = tagName.toLowerCase();
    if (!allowedTags.has(tag)) return "";
    if (match.startsWith("</")) return `</${tag}>`;
    if (tag === "br" || tag === "hr") return `<${tag}>`;
    if (tag === "img" && !safeImageUrl(readAttribute(attrs, "src"))) return "";
    return `<${tag}${sanitizeAttributes(tag, attrs)}>`;
  });

  latexTokens.forEach((tokenHtml, index) => {
    html = html.replaceAll(`@@MOFUKAZE_LATEX_${index}@@`, tokenHtml);
  });

  return html;
}

const allowedTags = new Set([
  "p",
  "br",
  "strong",
  "b",
  "em",
  "i",
  "s",
  "ul",
  "ol",
  "li",
  "blockquote",
  "pre",
  "code",
  "h1",
  "h2",
  "h3",
  "hr",
  "a",
  "img",
  "span",
]);

function sanitizeAttributes(tag: string, raw: string): string {
  const attrs: string[] = [];

  if (tag === "a") {
    const href = safeLinkUrl(readAttribute(raw, "href"));
    if (href) {
      attrs.push(`href="${escapeHtml(href)}"`, 'target="_blank"', 'rel="noopener noreferrer"');
    }
    const title = readAttribute(raw, "title");
    if (title) attrs.push(`title="${escapeHtml(title)}"`);
  }

  if (tag === "img") {
    const src = safeImageUrl(readAttribute(raw, "src"));
    if (src) attrs.push(`src="${escapeHtml(src)}"`, 'loading="lazy"', 'class="rich-image"');
    const alt = readAttribute(raw, "alt") || "uploaded image";
    attrs.push(`alt="${escapeHtml(alt)}"`);
    const title = readAttribute(raw, "title");
    if (title) attrs.push(`title="${escapeHtml(title)}"`);
  }

  if (tag === "span") {
    const className = safeClassList(readAttribute(raw, "class"), ["math-inline", "math-block", "latex-node"]);
    if (className) attrs.push(`class="${escapeHtml(className)}"`);
  }

  return attrs.length ? ` ${attrs.join(" ")}` : "";
}

function parsePlainRichContent(content: string): RichPart[] {
  const result: RichPart[] = [];
  let index = 0;
  let textStart = 0;

  function pushText(end: number) {
    if (end > textStart) {
      result.push({ key: `text-${textStart}`, type: "text", value: content.slice(textStart, end) });
    }
  }

  while (index < content.length) {
    const image = matchMarkdownImage(content, index);
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
          html: renderLatexToHtml(content.slice(index + 2, end), true),
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
          html: renderLatexToHtml(content.slice(index + 1, end)),
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

function matchMarkdownImage(content: string, index: number): { alt: string; src: string; length: number } | null {
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

function safeImageUrl(raw?: string): string {
  const value = (raw ?? "").trim();
  if (!value) return "";
  if (value.startsWith("/media/img/uni/") || value.startsWith("/api/users/media/img/uni/")) return value;
  if (value.startsWith("http://") || value.startsWith("https://")) return value;
  return "";
}

function safeLinkUrl(raw?: string): string {
  const value = (raw ?? "").trim();
  if (!value) return "";
  if (value.startsWith("/") || value.startsWith("#")) return value;
  if (value.startsWith("http://") || value.startsWith("https://") || value.startsWith("mailto:")) return value;
  return "";
}

function safeClassList(raw: string | undefined, allow: string[]): string {
  if (!raw) return "";
  const allowed = new Set(allow);
  return raw
    .split(/\s+/)
    .filter((item) => allowed.has(item))
    .join(" ");
}

function readAttribute(attrs: string, name: string): string | undefined {
  const match = attrs.match(new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, "i"));
  return decodeHtml(match?.[1] ?? match?.[2] ?? "");
}

function stripTags(value: string): string {
  return value.replace(/<[^>]*>/g, "");
}

function findClosingDollar(content: string, start: number): number {
  for (let index = start; index < content.length; index += 1) {
    if (content[index] === "$" && content[index - 1] !== "\\") return index;
  }
  return -1;
}

function decodeHtml(value: string): string {
  return value.replace(/&(#x?[0-9a-f]+|amp|lt|gt|quot|apos|nbsp);/gi, (_match, entity: string) => {
    const lower = entity.toLowerCase();
    if (lower === "amp") return "&";
    if (lower === "lt") return "<";
    if (lower === "gt") return ">";
    if (lower === "quot") return '"';
    if (lower === "apos") return "'";
    if (lower === "nbsp") return " ";
    if (lower.startsWith("#x")) return String.fromCodePoint(Number.parseInt(lower.slice(2), 16));
    if (lower.startsWith("#")) return String.fromCodePoint(Number.parseInt(lower.slice(1), 10));
    return "";
  });
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
</script>
