export type PublicUser = {
  id: number;
  username: string;
  email?: string;
  avatar: string | null;
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
  posttime: string;
  author: PublicUser;
  aiAnalysis: AiAnalysis | null;
  aiTags: Array<{ name: string; confidence: number | null; weight: number | null }>;
  manualTags: Array<{ name: string; weight: number | null }>;
  reactions: ReactionSummary;
  commentCount: number;
  recommendation?: Record<string, number>;
};

export type CreateArticleResponse = {
  article: Article;
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
