import { prisma } from "../../lib/prisma.js";

type Vector = Record<string, number>;

const eventWeights: Record<string, number> = {
  IMPRESSION: 0.03,
  CLICK: 1,
  DWELL: 1.2,
  READ_COMPLETE: 2,
  LIKE: 3,
  COMMENT: 4,
  FAVORITE: 5,
  FOLLOW_AUTHOR: 2.5,
  HIDE: -3,
  REPORT: -6,
};

export async function refreshUserProfile(userId: number) {
  const events = await prisma.reco_event.findMany({
    where: {
      userId,
      createdAt: {
        gte: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000),
      },
    },
    orderBy: { createdAt: "desc" },
    take: 500,
  });
  const articleIds = [...new Set(events.map((event) => event.articleId))];
  const articles = await prisma.article.findMany({
    where: { id: { in: articleIds } },
    include: {
      article_ai_tag_on_article: {
        include: { article_ai_tag: true },
      },
    },
  });
  const articleMap = new Map(articles.map((article) => [article.id, article]));

  const tagVector: Vector = {};
  const authorAffinity: Vector = {};

  for (const event of events) {
    const article = articleMap.get(event.articleId);
    if (!article) continue;

    const weight = scoreEvent(event.eventType, event.dwellMs);
    const ageFactor = decay(event.createdAt);
    const finalWeight = weight * ageFactor;

    authorAffinity[String(article.authorId)] = (authorAffinity[String(article.authorId)] ?? 0) + finalWeight;

    for (const relation of article.article_ai_tag_on_article) {
      const tagWeight = (relation.weight ?? 0.7) * (relation.confidence ?? 0.7);
      const tagName = relation.article_ai_tag.name;
      tagVector[tagName] = (tagVector[tagName] ?? 0) + finalWeight * tagWeight;
    }
  }

  const normalizedTags = normalizeVector(tagVector, 60);
  const normalizedAuthors = normalizeVector(authorAffinity, 80);

  const profile = {
    tags: normalizedTags,
    updatedFromEvents: events.length,
    version: 1,
  };

  const tagVectorJson = JSON.stringify(profile);
  const authorAffinityJson = JSON.stringify(normalizedAuthors);

  await prisma.$executeRaw`
    INSERT INTO reco_user_profile (userId, tagVector, authorAffinity, updatedAt, createdAt)
    VALUES (${userId}, ${tagVectorJson}, ${authorAffinityJson}, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3))
    ON DUPLICATE KEY UPDATE
      tagVector = ${tagVectorJson},
      authorAffinity = ${authorAffinityJson},
      updatedAt = CURRENT_TIMESTAMP(3)
  `;

  const updated = await prisma.reco_user_profile.findUnique({ where: { userId } });
  if (!updated) {
    throw new Error("Failed to refresh recommendation profile");
  }
  return updated;
}

export async function getUserProfile(userId: number) {
  return prisma.reco_user_profile.findUnique({
    where: { userId },
  });
}

export function extractTagVector(value: unknown): Vector {
  if (!value || typeof value !== "object") return {};
  const record = value as Record<string, unknown>;
  const tags = record.tags;
  if (!tags || typeof tags !== "object") return {};
  return numericRecord(tags as Record<string, unknown>);
}

export function extractAuthorAffinity(value: unknown): Vector {
  if (!value || typeof value !== "object") return {};
  return numericRecord(value as Record<string, unknown>);
}

function scoreEvent(eventType: string, dwellMs: number | null): number {
  if (eventType === "DWELL") {
    return Math.min(3, Math.max(0.2, (dwellMs ?? 0) / 20000));
  }
  return eventWeights[eventType] ?? 0;
}

function decay(createdAt: Date): number {
  const ageDays = Math.max(0, (Date.now() - createdAt.getTime()) / (24 * 60 * 60 * 1000));
  return Math.exp(-ageDays / 30);
}

function normalizeVector(vector: Vector, limit: number): Vector {
  const entries = Object.entries(vector)
    .filter(([, value]) => Number.isFinite(value) && value !== 0)
    .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
    .slice(0, limit);

  const max = Math.max(1, ...entries.map(([, value]) => Math.abs(value)));
  return Object.fromEntries(entries.map(([key, value]) => [key, round(value / max)]));
}

function numericRecord(record: Record<string, unknown>): Vector {
  const output: Vector = {};
  for (const [key, value] of Object.entries(record)) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) output[key] = parsed;
  }
  return output;
}

function round(value: number): number {
  return Math.round(value * 10000) / 10000;
}
