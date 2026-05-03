import { Router } from "express";
import { requireReviewerOrInternal } from "../../middlewares/auth.js";
import {
  analyzeArticleController,
  analyzeTextController,
  getArticleAnalysisController,
  getTaxonomyController,
} from "../controllers/analysisController.js";

export const analysisRouter = Router();

analysisRouter.use(requireReviewerOrInternal);
analysisRouter.get("/taxonomy", getTaxonomyController);
analysisRouter.post("/text", analyzeTextController);
analysisRouter.post("/articles/:articleId", analyzeArticleController);
analysisRouter.get("/articles/:articleId", getArticleAnalysisController);
