import { prisma } from "../../lib/prisma.js";
import { HttpError } from "../utils/validation.js";
import { sanitizeContent } from "./contentSanitizer.js";
import { buildCommentReactionSummaries, type ReactionSummary } from "./reactionService.js";
import { recordRecoEvent } from "./recoEventService.js";

type CommentWithRelations = Awaited<ReturnType<typeof findCommentById>>;

export async function listArticleComments(input: {
  articleId: number;
  viewerId?: number;
  limit: number;
  cursor?: number;
}) {
  const article = await prisma.article.findUnique({
    where: { id: input.articleId },
    select: { id: true },
  });
  if (!article) {
    throw new HttpError(404, "Article not found", "ARTICLE_NOT_FOUND");
  }

  const comments = await prisma.comment.findMany({
    where: {
      articleId: input.articleId,
      status: { not: "deleted" },
      ...(input.cursor ? { id: { gt: input.cursor } } : {}),
    },
    orderBy: [{ posttime: "asc" }, { id: "asc" }],
    take: input.limit + 1,
    include: commentInclude(),
  });

  const page = comments.slice(0, input.limit);
  const reactionMap = await buildCommentReactionSummaries(
    page.map((comment) => comment.id),
    input.viewerId,
  );

  return {
    items: page.map((comment) => toCommentDto(comment, reactionMap.get(comment.id))),
    nextCursor: comments.length > input.limit ? page[page.length - 1]?.id : null,
  };
}

export async function createComment(input: {
  articleId: number;
  userId: number;
  content: string;
  parentId?: number;
  replyToUserId?: number;
}) {
  const article = await prisma.article.findUnique({
    where: { id: input.articleId },
    select: { id: true },
  });
  if (!article) {
    throw new HttpError(404, "Article not found", "ARTICLE_NOT_FOUND");
  }

  if (input.parentId) {
    const parent = await prisma.comment.findUnique({
      where: { id: input.parentId },
      select: { id: true, articleId: true, userId: true, status: true },
    });
    if (!parent || parent.articleId !== input.articleId || parent.status === "deleted") {
      throw new HttpError(400, "parentId does not belong to this article", "INVALID_PARENT_COMMENT");
    }
  }

  if (input.replyToUserId) {
    const user = await prisma.user.findUnique({
      where: { id: input.replyToUserId },
      select: { id: true },
    });
    if (!user) {
      throw new HttpError(400, "replyToUserId does not exist", "REPLY_USER_NOT_FOUND");
    }
  }

  const content = sanitizeContent(input.content);
  if (!content) {
    throw new HttpError(400, "content is required", "VALIDATION_ERROR");
  }

  const comment = await prisma.comment.create({
    data: {
      articleId: input.articleId,
      userId: input.userId,
      content,
      parentId: input.parentId,
      replyToUserId: input.replyToUserId,
      status: "approved",
    },
    include: commentInclude(),
  });

  await recordRecoEvent({
    userId: input.userId,
    articleId: input.articleId,
    eventType: "COMMENT",
    scene: "comment",
  });

  return toCommentDto(comment);
}

export async function deleteComment(commentId: number, actor: { id: number; role: string }) {
  const comment = await prisma.comment.findUnique({
    where: { id: commentId },
    select: { id: true, userId: true, status: true },
  });
  if (!comment || comment.status === "deleted") {
    throw new HttpError(404, "Comment not found", "COMMENT_NOT_FOUND");
  }
  if (comment.userId !== actor.id && actor.role.toLowerCase() !== "admin") {
    throw new HttpError(403, "Only the author or admin can delete this comment", "FORBIDDEN");
  }

  const replyCount = await prisma.comment.count({ where: { parentId: commentId, status: { not: "deleted" } } });
  if (replyCount > 0) {
    await prisma.comment.update({
      where: { id: commentId },
      data: { content: "", status: "deleted" },
    });
    await prisma.comment_reaction.deleteMany({ where: { commentId } });
    return { deleted: true, tombstone: true };
  }

  await prisma.$transaction([
    prisma.comment_reaction.deleteMany({ where: { commentId } }),
    prisma.comment.delete({ where: { id: commentId } }),
  ]);

  return { deleted: true, tombstone: false };
}

async function findCommentById(commentId: number) {
  return prisma.comment.findUnique({
    where: { id: commentId },
    include: commentInclude(),
  });
}

function commentInclude() {
  return {
    user_comment_userIdTouser: {
      select: {
        id: true,
        username: true,
        avatar: true,
        role: true,
        professionalism: true,
        friendliness: true,
      },
    },
    user_comment_replyToUserIdTouser: {
      select: {
        id: true,
        username: true,
        avatar: true,
      },
    },
  };
}

function toCommentDto(
  comment: NonNullable<CommentWithRelations>,
  reactions: ReactionSummary = { total: 0, counts: [], myReactions: [] },
) {
  return {
    id: comment.id,
    content: comment.content,
    posttime: comment.posttime,
    status: comment.status,
    articleId: comment.articleId,
    parentId: comment.parentId,
    replyToUserId: comment.replyToUserId,
    author: comment.user_comment_userIdTouser,
    replyToUser: comment.user_comment_replyToUserIdTouser,
    reactions,
  };
}
