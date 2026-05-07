import { prisma } from "../../lib/prisma.js";
import { HttpError } from "../utils/validation.js";
import { sanitizeContent, summarizeContent } from "./contentSanitizer.js";
import { buildArticleReactionSummaries, type ReactionSummary } from "./reactionService.js";

type ArticleWithRelations = Awaited<ReturnType<typeof findArticleById>>;

export type ArticleAiProcessing = {
  requested: boolean;
  ok: boolean;
  status: "skipped" | "analyzed" | "failed";
  source: "ai_service" | "none";
  articleId?: number;
  result?: {
    decision?: string;
    riskLevel?: string;
    reason?: string;
    suggestion?: string;
    provider?: string;
    model?: string;
    tags?: Array<{
      name: string;
      category?: string;
      confidence?: number;
      weight?: number;
    }>;
  };
  persisted?: {
    analysisId?: number;
    articleId?: number;
    updatedUserId?: number;
  };
  message?: string;
  error?: string;
};

export async function listArticles(input: {
  viewerId?: number;
  authorId?: number;
  authorIds?: number[];
  tag?: string;
  limit: number;
  cursor?: number;
  hideBlocked?: boolean;
}) {
  const articles = await prisma.article.findMany({
    where: {
      ...(input.authorId ? { authorId: input.authorId } : {}),
      ...(input.authorIds ? { authorId: { in: input.authorIds } } : {}),
      ...(input.tag
        ? {
            OR: [
              { tag: input.tag },
              { article_tag_on_article: { some: { article_tag: { name: input.tag } } } },
              { article_ai_tag_on_article: { some: { article_ai_tag: { name: input.tag } } } },
            ],
          }
        : {}),
      ...(input.cursor ? { id: { lt: input.cursor } } : {}),
    },
    orderBy: [{ posttime: "desc" }, { id: "desc" }],
    take: input.limit + 1,
    include: articleInclude(),
  });

  const visible = input.hideBlocked ? articles.filter((article) => isVisibleInFeed(article)) : articles;
  const page = visible.slice(0, input.limit);
  const reactionMap = await buildArticleReactionSummaries(
    page.map((article) => article.id),
    input.viewerId,
  );
  const commentCounts = await getCommentCounts(page.map((article) => article.id));

  return {
    items: page.map((article) => toArticleDto(article, reactionMap.get(article.id), commentCounts.get(article.id) ?? 0)),
    nextCursor: visible.length > input.limit ? page[page.length - 1]?.id : null,
  };
}

export async function listArticleTags(limit = 80) {
  type TagCountRow = {
    name: string;
    count: bigint | number;
  };

  const [primaryRows, manualRows, aiRows] = await Promise.all([
    prisma.$queryRaw<TagCountRow[]>`
      SELECT tag AS name, COUNT(*) AS count
      FROM article
      GROUP BY tag
      ORDER BY count DESC, tag ASC
      LIMIT ${limit}
    `,
    prisma.$queryRaw<TagCountRow[]>`
      SELECT t.name AS name, COUNT(ta.articleId) AS count
      FROM article_tag t
      INNER JOIN article_tag_on_article ta ON ta.tagId = t.id
      GROUP BY t.id, t.name
      ORDER BY count DESC, t.name ASC
      LIMIT ${limit}
    `,
    prisma.$queryRaw<TagCountRow[]>`
      SELECT t.name AS name, COUNT(ta.articleId) AS count
      FROM article_ai_tag t
      INNER JOIN article_ai_tag_on_article ta ON ta.tagId = t.id
      GROUP BY t.id, t.name
      ORDER BY count DESC, t.name ASC
      LIMIT ${limit}
    `,
  ]);

  const map = new Map<
    string,
    {
      name: string;
      primaryCount: number;
      manualCount: number;
      aiCount: number;
      total: number;
    }
  >();

  function add(rows: TagCountRow[], key: "primaryCount" | "manualCount" | "aiCount") {
    for (const row of rows) {
      const name = row.name?.trim();
      if (!name) continue;
      const current = map.get(name) ?? {
        name,
        primaryCount: 0,
        manualCount: 0,
        aiCount: 0,
        total: 0,
      };
      const count = Number(row.count);
      current[key] += count;
      current.total += count;
      map.set(name, current);
    }
  }

  add(primaryRows, "primaryCount");
  add(manualRows, "manualCount");
  add(aiRows, "aiCount");

  return [...map.values()]
    .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name))
    .slice(0, limit);
}

export async function getArticle(articleId: number, viewerId?: number) {
  const article = await findArticleById(articleId);
  if (!article) {
    throw new HttpError(404, "Article not found", "ARTICLE_NOT_FOUND");
  }

  const reactions = await buildArticleReactionSummaries([article.id], viewerId);
  const commentCounts = await getCommentCounts([article.id]);
  return toArticleDto(article, reactions.get(article.id), commentCounts.get(article.id) ?? 0);
}

export async function createArticle(input: {
  authorId: number;
  content: string;
  tag?: string;
  tags: string[];
  requestId?: string;
}) {
  const content = sanitizeContent(input.content);
  if (!content) {
    throw new HttpError(400, "content is required", "VALIDATION_ERROR");
  }

  const primaryTag = input.tag ?? input.tags[0] ?? "未分类";
  const article = await prisma.article.create({
    data: {
      authorId: input.authorId,
      content,
      tag: primaryTag,
    },
    include: articleInclude(),
  });

  const manualTags = [...new Set([primaryTag, ...input.tags])].filter(Boolean);
  await syncManualTags(article.id, manualTags);

  const ai = await requestAiAnalysis(article.id, input.requestId);
  const freshArticle = (await findArticleById(article.id)) ?? article;

  return {
    article: toArticleDto(freshArticle, undefined, 0),
    ai,
  };
}

export async function deleteArticle(articleId: number, actor: { id: number; role: string }) {
  const article = await prisma.article.findUnique({
    where: { id: articleId },
    select: { id: true, authorId: true },
  });
  if (!article) {
    throw new HttpError(404, "Article not found", "ARTICLE_NOT_FOUND");
  }
  if (article.authorId !== actor.id && actor.role.toLowerCase() !== "admin") {
    throw new HttpError(403, "Only the author or admin can delete this article", "FORBIDDEN");
  }

  await prisma.$transaction(async (tx) => {
    const comments = await tx.comment.findMany({
      where: { articleId },
      select: { id: true },
      orderBy: { id: "desc" },
    });
    const commentIds = comments.map((comment) => comment.id);

    if (commentIds.length > 0) {
      await tx.comment_reaction.deleteMany({ where: { commentId: { in: commentIds } } });
      for (const comment of comments) {
        await tx.comment.delete({ where: { id: comment.id } });
      }
    }

    await tx.article_reaction.deleteMany({ where: { articleId } });
    await tx.article_ai_tag_on_article.deleteMany({ where: { articleId } });
    await tx.article_tag_on_article.deleteMany({ where: { articleId } });
    await tx.article_ai_analysis.deleteMany({ where: { articleId } });
    await tx.article.delete({ where: { id: articleId } });
  });

  return { deleted: true };
}

async function findArticleById(articleId: number) {
  return prisma.article.findUnique({
    where: { id: articleId },
    include: articleInclude(),
  });
}

function articleInclude() {
  return {
    user: {
      select: {
        id: true,
        username: true,
        avatar: true,
        role: true,
        professionalism: true,
        friendliness: true,
      },
    },
    article_ai_analysis: true,
    article_ai_tag_on_article: {
      include: { article_ai_tag: true },
      orderBy: [{ weight: "desc" as const }, { confidence: "desc" as const }],
    },
    article_tag_on_article: {
      include: { article_tag: true },
      orderBy: [{ weight: "desc" as const }, { createdAt: "asc" as const }],
    },
  };
}

function toArticleDto(
  article: NonNullable<ArticleWithRelations>,
  reactions: ReactionSummary = { total: 0, counts: [], myReactions: [] },
  commentCount = 0,
) {
  return {
    id: article.id,
    content: article.content,
    excerpt: summarizeContent(article.content),
    tag: article.tag,
    posttime: article.posttime,
    author: article.user,
    aiAnalysis: article.article_ai_analysis,
    aiTags: article.article_ai_tag_on_article.map((item) => ({
      name: item.article_ai_tag.name,
      confidence: item.confidence,
      weight: item.weight,
    })),
    manualTags: article.article_tag_on_article.map((item) => ({
      name: item.article_tag.name,
      weight: item.weight,
    })),
    reactions,
    commentCount,
  };
}

function isVisibleInFeed(article: NonNullable<ArticleWithRelations>): boolean {
  const legalityScore = article.article_ai_analysis?.legalityScore;
  return legalityScore === undefined || legalityScore === null || legalityScore >= 40;
}

async function syncManualTags(articleId: number, tags: string[]): Promise<void> {
  for (const [index, name] of tags.entries()) {
    const tag = await prisma.article_tag.upsert({
      where: { name },
      create: { name },
      update: {},
    });
    await prisma.article_tag_on_article.upsert({
      where: {
        articleId_tagId: {
          articleId,
          tagId: tag.id,
        },
      },
      create: {
        articleId,
        tagId: tag.id,
        weight: index === 0 ? 1 : 0.8,
      },
      update: {
        weight: index === 0 ? 1 : 0.8,
      },
    });
  }
}

async function getCommentCounts(articleIds: number[]): Promise<Map<number, number>> {
  const result = new Map<number, number>();
  if (articleIds.length === 0) return result;
  const rows = await prisma.comment.groupBy({
    by: ["articleId"],
    where: {
      articleId: { in: articleIds },
      status: "approved",
    },
    _count: { _all: true },
  });
  for (const row of rows) {
    if (row.articleId) result.set(row.articleId, row._count._all);
  }
  return result;
}

async function requestAiAnalysis(articleId: number, requestId?: string): Promise<ArticleAiProcessing> {
  if (process.env.AI_ANALYSIS_ON_CREATE === "false") {
    return {
      requested: false,
      ok: true,
      status: "skipped",
      source: "none",
      articleId,
      message: "AI analysis disabled by AI_ANALYSIS_ON_CREATE=false",
    };
  }

  const baseUrl = process.env.AI_SERVICE_URL;
  if (!baseUrl) {
    return {
      requested: false,
      ok: true,
      status: "skipped",
      source: "none",
      articleId,
      message: "AI_SERVICE_URL is not configured",
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Number(process.env.AI_SERVICE_TIMEOUT_MS ?? 5000));

  try {
    const response = await fetch(`${baseUrl.replace(/\/$/, "")}/analysis/articles/${articleId}`, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "x-internal-service-token": process.env.AI_INTERNAL_TOKEN ?? "dev-internal-service-token",
        ...(requestId ? { "x-request-id": requestId } : {}),
      },
    });
    if (!response.ok) {
      return {
        requested: true,
        ok: false,
        status: "failed",
        source: "ai_service",
        articleId,
        error: `AI service returned ${response.status}`,
      };
    }
    const payload = (await response.json()) as {
      articleId?: number;
      result?: ArticleAiProcessing["result"];
      persisted?: ArticleAiProcessing["persisted"];
    };
    return {
      requested: true,
      ok: true,
      status: "analyzed",
      source: "ai_service",
      articleId: payload.articleId ?? articleId,
      result: payload.result,
      persisted: payload.persisted,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "AI service request failed";
    return {
      requested: true,
      ok: false,
      status: "failed",
      source: "ai_service",
      articleId,
      error: message,
    };
  } finally {
    clearTimeout(timeout);
  }
}
