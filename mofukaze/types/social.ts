export type PublicUser = {
  id: number;
  username: string;
  email?: string;
  avatar: string | null;
  bio?: string | null;
  role: string;
  professionalism: number;
  friendliness: number;
};

export type ReactionSummary = {
  total: number;
  counts: Array<{ emoji: string; count: number }>;
  myReactions: string[];
};

export type AiAnalysis = {
  id?: number;
  articleId?: number;
  friendlinessScore: number;
  rationalityScore: number;
  legalityScore: number;
  professionalismScore: number;
  analyzedAt?: string;
};

export type Article = {
  id: number;
  content: string;
  excerpt: string;
  tag: string;
  status: "PENDING_REVIEW" | "PUBLISHED" | "LOW_PRIORITY" | "REVIEW_REQUIRED" | "REJECTED";
  reviewDecision: string | null;
  riskLevel: string | null;
  reviewReason: string | null;
  reviewSuggestion: string | null;
  reviewedAt: string | null;
  posttime: string;
  author: PublicUser;
  aiAnalysis: AiAnalysis | null;
  aiTags: Array<{ name: string; confidence: number | null; weight: number | null }>;
  manualTags: Array<{ name: string; weight: number | null }>;
  reactions: ReactionSummary;
  commentCount: number;
  recommendation?: Record<string, number>;
};

export type ArticleTagSummary = {
  name: string;
  primaryCount: number;
  manualCount: number;
  aiCount: number;
  total: number;
};

export type CreateArticleResponse = {
  article: Article;
  review: {
    status: Article["status"];
    decision?: string | null;
    riskLevel?: string | null;
    reason?: string | null;
    suggestion?: string | null;
  };
};

export type FeedResponse = {
  items: Article[];
  nextCursor: number | null;
  requestId?: string;
  source: string;
  strategy?: string;
  profileReady?: boolean;
};

export type Comment = {
  id: number;
  content: string;
  posttime: string;
  status: string;
  articleId: number;
  parentId: number | null;
  replyToUserId: number | null;
  author: PublicUser;
  replyToUser?: PublicUser | null;
  reactions: ReactionSummary;
};

export type ChatMessage = {
  id: number;
  threadId: number;
  senderId: number;
  content: string;
  createdAt: string;
  sender: Pick<PublicUser, "id" | "username" | "avatar" | "role">;
};

export type ChatThread = {
  id: number;
  userAId: number;
  userBId: number;
  createdAt: string;
  counterpart: Pick<PublicUser, "id" | "username" | "avatar" | "role">;
  lastMessage: ChatMessage | null;
};

export type UploadedMedia = {
  url: string;
  path: string;
  hash: string;
  size: number;
  mimeType: string;
};

export type NotificationItem = {
  id: string;
  userId: number;
  type:
    | "CONTENT_PUBLISHED"
    | "CONTENT_REVIEW_APPROVED"
    | "CONTENT_REVIEW_LIMITED"
    | "CONTENT_REVIEW_REQUIRED"
    | "CONTENT_REVIEW_REJECTED"
    | "CONTENT_REVIEW_FAILED"
    | "COMMENT"
    | "REPLY"
    | "ARTICLE_REACTION"
    | "COMMENT_REACTION"
    | "FOLLOW";
  title: string;
  body: string | null;
  actorId: number | null;
  actor?: Pick<PublicUser, "id" | "username" | "avatar"> | null;
  articleId: number | null;
  commentId: number | null;
  link: string | null;
  readAt: string | null;
  createdAt: string;
};
