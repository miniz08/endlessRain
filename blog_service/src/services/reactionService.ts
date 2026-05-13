import { prisma } from "../../lib/prisma.js";
import { HttpError } from "../utils/validation.js";
import { notifyArticleReaction, notifyCommentReaction } from "./notificationService.js";
import { recordRecoEvent } from "./recoEventService.js";

export type ReactionSummary = {
  total: number;
  counts: Array<{ emoji: string; count: number }>;
  myReactions: string[];
};

export async function buildArticleReactionSummaries(
  articleIds: number[],
  userId?: number,
): Promise<Map<number, ReactionSummary>> {
  const result = emptySummaryMap(articleIds);
  if (articleIds.length === 0) return result;

  const counts = await prisma.article_reaction.groupBy({
    by: ["articleId", "emoji"],
    where: { articleId: { in: articleIds } },
    _count: { emoji: true },
  });

  for (const item of counts) {
    const summary = result.get(item.articleId);
    if (!summary) continue;
    const count = item._count.emoji;
    summary.counts.push({ emoji: item.emoji, count });
    summary.total += count;
  }

  if (userId) {
    const mine = await prisma.article_reaction.findMany({
      where: { articleId: { in: articleIds }, userId },
      select: { articleId: true, emoji: true },
    });
    for (const item of mine) {
      result.get(item.articleId)?.myReactions.push(item.emoji);
    }
  }

  sortSummaries(result);
  return result;
}

export async function buildCommentReactionSummaries(
  commentIds: number[],
  userId?: number,
): Promise<Map<number, ReactionSummary>> {
  const result = emptySummaryMap(commentIds);
  if (commentIds.length === 0) return result;

  const counts = await prisma.comment_reaction.groupBy({
    by: ["commentId", "emoji"],
    where: { commentId: { in: commentIds } },
    _count: { emoji: true },
  });

  for (const item of counts) {
    const summary = result.get(item.commentId);
    if (!summary) continue;
    const count = item._count.emoji;
    summary.counts.push({ emoji: item.emoji, count });
    summary.total += count;
  }

  if (userId) {
    const mine = await prisma.comment_reaction.findMany({
      where: { commentId: { in: commentIds }, userId },
      select: { commentId: true, emoji: true },
    });
    for (const item of mine) {
      result.get(item.commentId)?.myReactions.push(item.emoji);
    }
  }

  sortSummaries(result);
  return result;
}

export async function toggleArticleReaction(articleId: number, userId: number, emoji: string) {
  const article = await prisma.article.findUnique({
    where: { id: articleId },
    select: { id: true, status: true },
  });
  if (!article || !isPublicArticleStatus(article.status)) {
    throw new HttpError(404, "Article not found", "ARTICLE_NOT_FOUND");
  }

  const existing = await prisma.article_reaction.findUnique({
    where: {
      articleId_userId_emoji: { articleId, userId, emoji },
    },
  });

  const action = existing ? "removed" : "added";
  if (existing) {
    await prisma.article_reaction.delete({ where: { id: existing.id } });
  } else {
    await prisma.article_reaction.create({ data: { articleId, userId, emoji } });
    await recordRecoEvent({
      userId,
      articleId,
      eventType: "LIKE",
      scene: "article_reaction",
    });
    await notifyArticleReaction(articleId, userId, emoji);
  }

  const summary = (await buildArticleReactionSummaries([articleId], userId)).get(articleId) ?? emptySummary();
  return { action, summary };
}

export async function toggleCommentReaction(commentId: number, userId: number, emoji: string) {
  const comment = await prisma.comment.findUnique({
    where: { id: commentId },
    select: { id: true, articleId: true, status: true },
  });
  if (!comment || comment.status === "deleted") {
    throw new HttpError(404, "Comment not found", "COMMENT_NOT_FOUND");
  }

  const existing = await prisma.comment_reaction.findUnique({
    where: {
      commentId_userId_emoji: { commentId, userId, emoji },
    },
  });

  const action = existing ? "removed" : "added";
  if (existing) {
    await prisma.comment_reaction.delete({ where: { id: existing.id } });
  } else {
    await prisma.comment_reaction.create({ data: { commentId, userId, emoji } });
    if (comment.articleId) {
      await recordRecoEvent({
        userId,
        articleId: comment.articleId,
        eventType: "LIKE",
        scene: "comment_reaction",
      });
    }
    await notifyCommentReaction(commentId, userId, emoji);
  }

  const summary = (await buildCommentReactionSummaries([commentId], userId)).get(commentId) ?? emptySummary();
  return { action, summary };
}

function emptySummaryMap(ids: number[]): Map<number, ReactionSummary> {
  return new Map(ids.map((id) => [id, emptySummary()]));
}

function emptySummary(): ReactionSummary {
  return {
    total: 0,
    counts: [],
    myReactions: [],
  };
}

function sortSummaries(summaries: Map<number, ReactionSummary>): void {
  for (const summary of summaries.values()) {
    summary.counts.sort((a, b) => b.count - a.count || a.emoji.localeCompare(b.emoji));
    summary.myReactions.sort((a, b) => a.localeCompare(b));
  }
}

function isPublicArticleStatus(status?: string | null): boolean {
  return status === undefined || status === null || status === "PUBLISHED" || status === "LOW_PRIORITY";
}
