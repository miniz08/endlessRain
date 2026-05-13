export function sanitizeContent(content: string): string {
  const normalized = content.replace(/\u0000/g, "").replace(/\r\n/g, "\n").trim();
  return looksLikeHtml(normalized) ? sanitizeHtmlContent(normalized).trim() : normalized;
}

export function summarizeContent(content: string, length = 120): string {
  const compact = toPlainText(content).replace(/\s+/g, " ").trim();
  return compact.length > length ? `${compact.slice(0, length)}...` : compact;
}

function looksLikeHtml(content: string): boolean {
  return /<\/?(p|h1|h2|h3|ul|ol|li|blockquote|pre|code|strong|em|s|a|img|span|hr|br)\b/i.test(content);
}

function sanitizeHtmlContent(content: string): string {
  let html = content.replace(/<!--[\s\S]*?-->/g, "");
  html = html.replace(/<(script|style|iframe|object|embed|svg|math|form|input|button|select|textarea|meta|link|base)\b[\s\S]*?<\/\1>/gi, "");
  html = html.replace(/<(script|style|iframe|object|embed|svg|math|form|input|button|select|textarea|meta|link|base)\b[^>]*\/?>/gi, "");
  return html.replace(/<\/?([a-z][a-z0-9-]*)(\s[^>]*)?>/gi, (match, tagName: string, attrs = "") => {
    const tag = tagName.toLowerCase();
    if (!allowedTags.has(tag)) return "";
    if (match.startsWith("</")) return `</${tag}>`;
    if (tag === "br" || tag === "hr") return `<${tag}>`;
    if (tag === "img" && !safeImageUrl(readAttribute(attrs, "src"))) return "";
    return `<${tag}${sanitizeAttributes(tag, attrs)}>`;
  });
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
    if (href) attrs.push(`href="${escapeHtml(href)}"`, 'target="_blank"', 'rel="noopener noreferrer"');
    const title = readAttribute(raw, "title");
    if (title) attrs.push(`title="${escapeHtml(title)}"`);
  }
  if (tag === "img") {
    const src = safeImageUrl(readAttribute(raw, "src"));
    if (src) attrs.push(`src="${escapeHtml(src)}"`);
    const alt = readAttribute(raw, "alt") || "uploaded image";
    attrs.push(`alt="${escapeHtml(alt)}"`);
  }
  if (tag === "span") {
    const className = safeClassList(readAttribute(raw, "class"), ["latex-node"]);
    if (className) attrs.push(`class="${escapeHtml(className)}"`);
    if (readAttribute(raw, "data-type") === "latex") {
      attrs.push('data-type="latex"');
      attrs.push(`data-latex="${escapeHtml(readAttribute(raw, "data-latex") ?? "")}"`);
    }
  }
  return attrs.length ? ` ${attrs.join(" ")}` : "";
}

function toPlainText(content: string): string {
  if (!looksLikeHtml(content)) return content;
  return decodeHtml(
    content
      .replace(/<span\b([^>]*)data-type=(["'])latex\2([^>]*)>([\s\S]*?)<\/span>/gi, (_match, before: string, _quote: string, after: string, inner: string) => {
        const source = readAttribute(`${before} ${after}`, "data-latex") || inner.replace(/<[^>]*>/g, "").replace(/^\$|\$$/g, "");
        return source ? `$${source}$` : "";
      })
      .replace(/<img\b[^>]*>/gi, " [image] ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|h1|h2|h3|li|blockquote)>/gi, "\n")
      .replace(/<[^>]*>/g, " "),
  );
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
