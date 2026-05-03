import type { Request, Response } from "express";
import { createComment, deleteComment, listArticleComments } from "../services/commentService.js";
import { writeAuditLog } from "../services/auditService.js";
import { buildCommentReactionSummaries, toggleCommentReaction } from "../services/reactionService.js";
import { assertEmoji, assertString, optionalPositiveInt, parsePagination, positiveInt } from "../utils/validation.js";

export async function listArticleCommentsController(req: Request, res: Response): Promise<void> {
  const articleId = positiveInt(req.params.articleId, "articleId");
  const pagination = parsePagination(req.query, 50, 100);
  const payload = await listArticleComments({
    articleId,
    viewerId: req.auth?.id,
    ...pagination,
  });
  res.json(payload);
}

export async function createCommentController(req: Request, res: Response): Promise<void> {
  const articleId = positiveInt(req.params.articleId, "articleId");
  const content = assertString(req.body?.content, "content", 3000);
  const parentId = optionalPositiveInt(req.body?.parentId, "parentId");
  const replyToUserId = optionalPositiveInt(req.body?.replyToUserId, "replyToUserId");

  const comment = await createComment({
    articleId,
    userId: req.auth!.id,
    content,
    parentId,
    replyToUserId,
  });

  await writeAuditLog(req, "COMMENT_CREATE", "success", 201, `article=${articleId}; comment=${comment.id}`);
  res.status(201).json({ comment });
}

export async function deleteCommentController(req: Request, res: Response): Promise<void> {
  const commentId = positiveInt(req.params.commentId, "commentId");
  const payload = await deleteComment(commentId, req.auth!);
  await writeAuditLog(req, "COMMENT_DELETE", "success", 200, `comment=${commentId}`);
  res.json(payload);
}

export async function getCommentReactionsController(req: Request, res: Response): Promise<void> {
  const commentId = positiveInt(req.params.commentId, "commentId");
  const summary = (await buildCommentReactionSummaries([commentId], req.auth?.id)).get(commentId);
  res.json({ summary });
}

export async function toggleCommentReactionController(req: Request, res: Response): Promise<void> {
  const commentId = positiveInt(req.params.commentId, "commentId");
  const emoji = assertEmoji(req.body?.emoji);
  const payload = await toggleCommentReaction(commentId, req.auth!.id, emoji);
  await writeAuditLog(req, "COMMENT_REACTION_TOGGLE", "success", 200, `comment=${commentId}; emoji=${emoji}; action=${payload.action}`);
  res.json(payload);
}
