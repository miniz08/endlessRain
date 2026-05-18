import { Router } from "express";
import { requireAdminOrInternal } from "../../middlewares/auth.js";
import {
  analyzeArticleController,
  analyzeTextController,
  getArticleAnalysisController,
  getTaxonomyController,
} from "../controllers/analysisController.js";

export const analysisRouter = Router();

analysisRouter.use(requireAdminOrInternal);
analysisRouter.get("/taxonomy", getTaxonomyController);
analysisRouter.post("/text", analyzeTextController);
analysisRouter.post("/articles/:articleId", analyzeArticleController);
analysisRouter.get("/articles/:articleId", getArticleAnalysisController);
