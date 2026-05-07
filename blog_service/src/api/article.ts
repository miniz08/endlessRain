import { Router } from "express";
import { requireAuth } from "../../middlewares/auth.js";
import {
  createArticleController,
  deleteArticleController,
  getArticleController,
  getArticleReactionsController,
  listArticleTagsController,
  listArticlesController,
  toggleArticleReactionController,
} from "../controllers/articleController.js";

export const articleRouter = Router();

articleRouter.get("/", listArticlesController);
articleRouter.post("/", requireAuth, createArticleController);
articleRouter.get("/tags", listArticleTagsController);
articleRouter.get("/:articleId/reactions", getArticleReactionsController);
articleRouter.post("/:articleId/reactions", requireAuth, toggleArticleReactionController);
articleRouter.get("/:articleId", getArticleController);
articleRouter.delete("/:articleId", requireAuth, deleteArticleController);
