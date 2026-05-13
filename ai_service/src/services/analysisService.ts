import { prisma } from "../../lib/prisma.js";
import { createProvider } from "../providers/index.js";
import type { AnalysisResult } from "../providers/types.js";
import { HttpError } from "../utils/validation.js";
import { compactTaxonomyForPrompt } from "./tagTaxonomy.js";

type PersistedAnalysis = {
  analysisId: number;
  articleId: number;
  updatedUserId: number;
  tagCount: number;
};

type UserAverageRow = {
  avgProfessionalism: number | null;
  avgFriendliness: number | null;
  lowPriorityCount: bigint | number;
  reviewRequiredCount: bigint | number;
  rejectedCount: bigint | number;
};

const provider = createProvider();

export async function analyzeText(content: string): Promise<AnalysisResult> {
  try {
    return await provider.analyze({
      content,
      taxonomy: compactTaxonomyForPrompt(),
    });
  } catch (error) {
    console.error("[ai_service] provider failed, returning conservative fallback", error);
    return fallbackResult(error);
  }
}

export async function analyzeAndPersistArticle(articleId: number): Promise<{
  articleId: number;
  result: AnalysisResult;
  persisted: PersistedAnalysis;
}> {
  const article = await prisma.article.findUnique({
    where: { id: articleId },
    select: { id: true, content: true },
  });

  if (!article) {
    throw new HttpError(404, "Article not found", "ARTICLE_NOT_FOUND");
  }

  const result = await analyzeText(article.content);
  const persisted = await persistArticleAnalysis(article.id, result);
  return { articleId: article.id, result, persisted };
}

export async function persistArticleAnalysis(articleId: number, result: AnalysisResult): Promise<PersistedAnalysis> {
  const article = await prisma.article.findUnique({
    where: { id: articleId },
    select: { id: true, authorId: true },
  });

  if (!article) {
    throw new HttpError(404, "Article not found", "ARTICLE_NOT_FOUND");
  }

  const analysis = await prisma.article_ai_analysis.upsert({
    where: { articleId },
    create: {
      articleId,
      friendlinessScore: result.scores.friendlinessScore,
      rationalityScore: result.scores.rationalityScore,
      legalityScore: result.scores.legalityScore,
      professionalismScore: result.scores.professionalismScore,
    },
    update: {
      friendlinessScore: result.scores.friendlinessScore,
      rationalityScore: result.scores.rationalityScore,
      legalityScore: result.scores.legalityScore,
      professionalismScore: result.scores.professionalismScore,
      analyzedAt: new Date(),
    },
  });

  const uniqueTags = new Map<string, (typeof result.tags)[number]>();
  for (const tag of result.tags) {
    uniqueTags.set(tag.name, tag);
  }

  const tagIds: number[] = [];
  for (const tag of uniqueTags.values()) {
    const dbTag = await prisma.article_ai_tag.upsert({
      where: { name: tag.name },
      create: { name: tag.name },
      update: {},
    });
    tagIds.push(dbTag.id);

    await prisma.article_ai_tag_on_article.upsert({
      where: {
        articleId_tagId: {
          articleId,
          tagId: dbTag.id,
        },
      },
      create: {
        articleId,
        tagId: dbTag.id,
        confidence: tag.confidence,
        weight: tag.weight,
      },
      update: {
        confidence: tag.confidence,
        weight: tag.weight,
      },
    });
  }

  await prisma.article_ai_tag_on_article.deleteMany({
    where: {
      articleId,
      tagId: { notIn: tagIds },
    },
  });

  await prisma.article.update({
    where: { id: articleId },
    data: {
      status: statusFromDecision(result.decision),
      reviewDecision: result.decision,
      riskLevel: result.riskLevel,
      reviewReason: truncate(result.reason, 512),
      reviewSuggestion: truncate(result.suggestion, 512),
      reviewedAt: new Date(),
    },
  });

  await refreshUserRating(article.authorId);

  return {
    analysisId: analysis.id,
    articleId,
    updatedUserId: article.authorId,
    tagCount: tagIds.length,
  };
}

export async function getArticleAnalysis(articleId: number) {
  const analysis = await prisma.article_ai_analysis.findUnique({
    where: { articleId },
    include: {
      article: {
        select: {
          id: true,
          authorId: true,
          posttime: true,
        },
      },
    },
  });

  if (!analysis) {
    throw new HttpError(404, "Analysis not found", "ANALYSIS_NOT_FOUND");
  }

  const tags = await prisma.article_ai_tag_on_article.findMany({
    where: { articleId },
    include: { article_ai_tag: true },
    orderBy: [{ weight: "desc" }, { confidence: "desc" }],
  });

  return {
    ...analysis,
    tags: tags.map((item) => ({
      name: item.article_ai_tag.name,
      confidence: item.confidence,
      weight: item.weight,
      createdAt: item.createdAt,
    })),
  };
}

async function refreshUserRating(userId: number): Promise<void> {
  const rows = await prisma.$queryRaw<UserAverageRow[]>`
    SELECT
      AVG(aia.professionalismScore) AS avgProfessionalism,
      AVG(aia.friendlinessScore) AS avgFriendliness,
      SUM(CASE WHEN a.status = 'LOW_PRIORITY' THEN 1 ELSE 0 END) AS lowPriorityCount,
      SUM(CASE WHEN a.status = 'REVIEW_REQUIRED' THEN 1 ELSE 0 END) AS reviewRequiredCount,
      SUM(CASE WHEN a.status = 'REJECTED' THEN 1 ELSE 0 END) AS rejectedCount
    FROM article a
    INNER JOIN article_ai_analysis aia ON aia.articleId = a.id
    WHERE a.authorId = ${userId}
  `;

  const row = rows[0];
  if (!row) return;
  const penalty =
    Number(row.lowPriorityCount ?? 0) * 3 +
    Number(row.reviewRequiredCount ?? 0) * 8 +
    Number(row.rejectedCount ?? 0) * 18;

  await prisma.user.update({
    where: { id: userId },
    data: {
      professionalism: clampRating(Math.round((row.avgProfessionalism ?? 0) - penalty)),
      friendliness: clampRating(Math.round((row.avgFriendliness ?? 0) - penalty * 0.6)),
    },
  });
}

function statusFromDecision(decision: string): "PUBLISHED" | "LOW_PRIORITY" | "REVIEW_REQUIRED" | "REJECTED" {
  if (decision === "ALLOW") return "PUBLISHED";
  if (decision === "LOW_PRIORITY") return "LOW_PRIORITY";
  if (decision === "REJECT") return "REJECTED";
  return "REVIEW_REQUIRED";
}

function truncate(value: string | undefined, max: number): string | null {
  if (!value) return null;
  return value.length > max ? value.slice(0, max) : value;
}

function clampRating(value: number): number {
  return Math.max(0, Math.min(100, value));
}

function fallbackResult(error: unknown): AnalysisResult {
  const reason = error instanceof Error ? error.message : "AI provider failed";
  return {
    scores: {
      friendlinessScore: 55,
      rationalityScore: 50,
      legalityScore: 40,
      professionalismScore: 50,
    },
    riskLevel: "HIGH",
    decision: "REVIEW",
    tags: [
      { name: "内容审核", category: "平台治理", confidence: 0.7, weight: 0.7 },
      { name: "风险预警", category: "安全风险", confidence: 0.65, weight: 0.65 },
    ],
    reason: `模型调用失败，返回保守复核结果：${reason}`,
    suggestion: "建议进入人工复核或稍后重试。",
    provider: "fallback",
    model: "conservative-fallback",
    raw: { error: reason },
  };
}
