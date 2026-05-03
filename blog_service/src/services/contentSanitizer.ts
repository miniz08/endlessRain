export function sanitizeContent(content: string): string {
  return content.replace(/\u0000/g, "").replace(/\r\n/g, "\n").trim();
}

export function summarizeContent(content: string, length = 120): string {
  const compact = content.replace(/\s+/g, " ").trim();
  return compact.length > length ? `${compact.slice(0, length)}...` : compact;
}
