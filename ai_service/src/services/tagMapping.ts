import type { TagCandidate } from "../providers/types.js";
import { FLAT_TAGS, findTag } from "./tagTaxonomy.js";
import { clampFloat } from "../utils/validation.js";

const fallbackTags = ["日常记录", "个人观点", "理性讨论"];

export function normalizeTags(input: unknown, limit = 8): TagCandidate[] {
  if (!Array.isArray(input)) {
    return fallbackTags.map((name, index) => toCandidate(name, 0.55 - index * 0.05, 0.5));
  }

  const seen = new Set<string>();
  const candidates: TagCandidate[] = [];

  for (const item of input) {
    const name = extractName(item);
    if (!name || seen.has(name)) continue;

    const mapped = findTag(name) ?? fuzzyFindTag(name);
    if (!mapped || seen.has(mapped.name)) continue;

    seen.add(mapped.name);
    candidates.push({
      name: mapped.name,
      category: mapped.categoryName,
      confidence: clampFloat(readNumber(item, "confidence"), 0.65),
      weight: clampFloat(readNumber(item, "weight"), 0.7),
    });

    if (candidates.length >= limit) break;
  }

  if (candidates.length === 0) {
    return fallbackTags.map((name, index) => toCandidate(name, 0.55 - index * 0.05, 0.5));
  }

  return candidates;
}

export function keywordTags(content: string, limit = 8): TagCandidate[] {
  const normalized = content.toLowerCase();
  const scored = FLAT_TAGS.map((tag) => {
    let score = 0;
    if (normalized.includes(tag.name.toLowerCase())) score += 5;
    for (const char of tag.name) {
      if (content.includes(char)) score += 0.08;
    }
    return { tag, score };
  })
    .filter((item) => item.score > 0.15)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  if (scored.length === 0) {
    return fallbackTags.map((name, index) => toCandidate(name, 0.6 - index * 0.05, 0.5));
  }

  return scored.map((item) =>
    toCandidate(item.tag.name, Math.min(0.95, 0.55 + item.score / 10), Math.min(1, 0.5 + item.score / 12)),
  );
}

function toCandidate(name: string, confidence: number, weight: number): TagCandidate {
  const mapped = findTag(name) ?? FLAT_TAGS[0];
  return {
    name: mapped.name,
    category: mapped.categoryName,
    confidence: clampFloat(confidence, 0.6),
    weight: clampFloat(weight, 0.6),
  };
}

function extractName(item: unknown): string | undefined {
  if (typeof item === "string") return item.trim();
  if (!item || typeof item !== "object") return undefined;
  const record = item as Record<string, unknown>;
  const raw = record.name ?? record.tag ?? record.label;
  return typeof raw === "string" ? raw.trim() : undefined;
}

function readNumber(item: unknown, key: string): unknown {
  if (!item || typeof item !== "object") return undefined;
  return (item as Record<string, unknown>)[key];
}

function fuzzyFindTag(name: string) {
  return FLAT_TAGS.find((tag) => tag.name.includes(name) || name.includes(tag.name));
}
