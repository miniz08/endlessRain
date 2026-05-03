import { Router } from "express";
import { requireAuth } from "../../middlewares/auth.js";
import {
  createCommentController,
  deleteCommentController,
  getCommentReactionsController,
  listArticleCommentsController,
  toggleCommentReactionController,
} from "../controllers/commentController.js";

export const commentRouter = Router();

commentRouter.get("/articles/:articleId/comments", listArticleCommentsController);
commentRouter.post("/articles/:articleId/comments", requireAuth, createCommentController);
commentRouter.get("/comments/:commentId/reactions", getCommentReactionsController);
commentRouter.post("/comments/:commentId/reactions", requireAuth, toggleCommentReactionController);
commentRouter.delete("/comments/:commentId", requireAuth, deleteCommentController);
