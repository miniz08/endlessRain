import type { Request, Response } from "express";
import { writeAuditLog } from "../services/auditService.js";
import {
  analyzeAndPersistArticle,
  analyzeText,
  getArticleAnalysis,
  persistArticleAnalysis,
} from "../services/analysisService.js";
import { TAG_TAXONOMY, tagCount } from "../services/tagTaxonomy.js";
import { assertString, optionalBoolean, optionalPositiveInt } from "../utils/validation.js";

export async function analyzeTextController(req: Request, res: Response): Promise<void> {
  const content = assertString(req.body?.content, "content");
  const articleId = optionalPositiveInt(req.body?.articleId, "articleId");
  const persist = optionalBoolean(req.body?.persist, false);

  const result = await analyzeText(content);
  const persisted = persist && articleId ? await persistArticleAnalysis(articleId, result) : undefined;

  await writeAuditLog(
    req,
    persisted ? "AI_ANALYZE_ARTICLE_PERSIST" : "AI_ANALYZE_TEXT",
    "success",
    200,
    `decision=${result.decision}; legality=${result.scores.legalityScore}`,
  );

  res.json({ result, persisted });
}

export async function analyzeArticleController(req: Request, res: Response): Promise<void> {
  const articleId = optionalPositiveInt(req.params.articleId, "articleId");
  if (!articleId) {
    res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "articleId is required" } });
    return;
  }

  const payload = await analyzeAndPersistArticle(articleId);
  await writeAuditLog(
    req,
    "AI_ANALYZE_ARTICLE",
    "success",
    200,
    `article=${articleId}; decision=${payload.result.decision}; legality=${payload.result.scores.legalityScore}`,
  );
  res.json(payload);
}

export async function getArticleAnalysisController(req: Request, res: Response): Promise<void> {
  const articleId = optionalPositiveInt(req.params.articleId, "articleId");
  if (!articleId) {
    res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "articleId is required" } });
    return;
  }

  const analysis = await getArticleAnalysis(articleId);
  res.json({ analysis });
}

export function getTaxonomyController(_req: Request, res: Response): void {
  res.json({
    count: tagCount(),
    categories: TAG_TAXONOMY,
  });
}
