import type { Request, Response } from "express";
import { writeAuditLog } from "../services/auditService.js";
import { createArticle, deleteArticle, getArticle, listArticles, type ArticleAiProcessing } from "../services/articleService.js";
import { buildArticleReactionSummaries, toggleArticleReaction } from "../services/reactionService.js";
import { recordRecoEvent } from "../services/recoEventService.js";
import {
  assertEmoji,
  assertString,
  assertStringArray,
  optionalPositiveInt,
  optionalString,
  parsePagination,
  positiveInt,
} from "../utils/validation.js";

export async function listArticlesController(req: Request, res: Response): Promise<void> {
  const pagination = parsePagination(req.query);
  const payload = await listArticles({
    viewerId: req.auth?.id,
    authorId: optionalPositiveInt(req.query.authorId, "authorId"),
    tag: optionalString(req.query.tag, "tag"),
    ...pagination,
  });
  res.json(payload);
}

export async function getArticleController(req: Request, res: Response): Promise<void> {
  const articleId = positiveInt(req.params.articleId, "articleId");
  const article = await getArticle(articleId, req.auth?.id);
  await recordRecoEvent({
    userId: req.auth?.id,
    articleId,
    eventType: "CLICK",
    scene: "article_detail",
    requestId: req.requestId,
  });
  res.json({ article });
}

export async function createArticleController(req: Request, res: Response): Promise<void> {
  const content = assertString(req.body?.content, "content", 10000);
  const tag = optionalString(req.body?.tag, "tag");
  const tags = assertStringArray(req.body?.tags, "tags", 8);

  const payload = await createArticle({
    authorId: req.auth!.id,
    content,
    tag,
    tags,
    requestId: req.requestId,
  });

  await writeAuditLog(
    req,
    "ARTICLE_CREATE",
    "success",
    201,
    `article=${payload.article.id}; aiStatus=${payload.ai.status}; aiRequested=${payload.ai.requested}`,
  );
  await writeAuditLog(
    req,
    auditActionForAi(payload.ai),
    payload.ai.ok ? "success" : "failure",
    payload.ai.ok ? 200 : 502,
    summarizeAiAudit(payload.ai),
  );
  res.status(201).json({ article: payload.article });
}

export async function deleteArticleController(req: Request, res: Response): Promise<void> {
  const articleId = positiveInt(req.params.articleId, "articleId");
  const payload = await deleteArticle(articleId, req.auth!);
  await writeAuditLog(req, "ARTICLE_DELETE", "success", 200, `article=${articleId}`);
  res.json(payload);
}

export async function getArticleReactionsController(req: Request, res: Response): Promise<void> {
  const articleId = positiveInt(req.params.articleId, "articleId");
  await getArticle(articleId, req.auth?.id);
  const summary = (await buildArticleReactionSummaries([articleId], req.auth?.id)).get(articleId);
  res.json({ summary });
}

export async function toggleArticleReactionController(req: Request, res: Response): Promise<void> {
  const articleId = positiveInt(req.params.articleId, "articleId");
  const emoji = assertEmoji(req.body?.emoji);
  const payload = await toggleArticleReaction(articleId, req.auth!.id, emoji);
  await writeAuditLog(req, "ARTICLE_REACTION_TOGGLE", "success", 200, `article=${articleId}; emoji=${emoji}; action=${payload.action}`);
  res.json(payload);
}

function auditActionForAi(ai: ArticleAiProcessing): string {
  if (ai.status === "analyzed") return "AI_ANALYSIS_ATTACHED";
  if (ai.status === "skipped") return "AI_ANALYSIS_SKIPPED";
  return "AI_ANALYSIS_FAILED";
}

function summarizeAiAudit(ai: ArticleAiProcessing): string {
  const tags = ai.result?.tags?.slice(0, 8).map((tag) => tag.name).join(",") ?? "";
  const decision = ai.result?.decision ?? "unknown";
  const risk = ai.result?.riskLevel ?? "unknown";
  const persisted = ai.persisted?.analysisId ? `analysis=${ai.persisted.analysisId}` : "analysis=none";
  const message = ai.error ?? ai.message ?? "";
  return [
    `article=${ai.articleId ?? "unknown"}`,
    `status=${ai.status}`,
    `decision=${decision}`,
    `risk=${risk}`,
    persisted,
    tags ? `tags=${tags}` : "",
    message ? `message=${message}` : "",
  ]
    .filter(Boolean)
    .join("; ");
}
