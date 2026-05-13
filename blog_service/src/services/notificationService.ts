import { prisma } from "../../lib/prisma.js";

export type NotificationType =
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

export type NotificationDto = {
  id: string;
  userId: number;
  type: NotificationType;
  title: string;
  body: string | null;
  actorId: number | null;
  actor?: {
    id: number;
    username: string;
    avatar: string | null;
  } | null;
  articleId: number | null;
  commentId: number | null;
  link: string | null;
  readAt: Date | null;
  createdAt: Date;
};

type NotificationRow = {
  id: bigint;
  userId: number;
  type: NotificationType;
  title: string;
  body: string | null;
  actorId: number | null;
  actorUsername: string | null;
  actorAvatar: string | null;
  articleId: number | null;
  commentId: number | null;
  link: string | null;
  readAt: Date | null;
  createdAt: Date;
};

let ensurePromise: Promise<void> | null = null;

export function ensureNotificationStore(): Promise<void> {
  ensurePromise ??= prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS notification (
      id BIGINT NOT NULL AUTO_INCREMENT,
      userId INT NOT NULL,
      type VARCHAR(64) NOT NULL,
      title VARCHAR(191) NOT NULL,
      body VARCHAR(512) NULL,
      actorId INT NULL,
      articleId INT NULL,
      commentId INT NULL,
      link VARCHAR(512) NULL,
      readAt DATETIME(3) NULL,
      createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      PRIMARY KEY (id),
      INDEX notification_user_created_idx (userId, createdAt),
      INDEX notification_user_read_created_idx (userId, readAt, createdAt),
      INDEX notification_type_created_idx (type, createdAt)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `).then(() => undefined);
  return ensurePromise;
}

export async function listNotifications(input: { userId: number; limit: number; cursor?: number }) {
  await ensureNotificationStore();
  const limit = Math.min(Math.max(input.limit, 1), 50);
  const params: unknown[] = [input.userId];
  let cursorClause = "";
  if (input.cursor) {
    cursorClause = "AND n.id < ?";
    params.push(input.cursor);
  }
  params.push(limit + 1);

  const rows = await prisma.$queryRawUnsafe<NotificationRow[]>(
    `
      SELECT
        n.id, n.userId, n.type, n.title, n.body, n.actorId,
        actor.username AS actorUsername,
        actor.avatar AS actorAvatar,
        n.articleId, n.commentId, n.link, n.readAt, n.createdAt
      FROM notification n
      LEFT JOIN user actor ON actor.id = n.actorId
      WHERE n.userId = ? ${cursorClause}
      ORDER BY n.id DESC
      LIMIT ?
    `,
    ...params,
  );

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  return {
    items: page.map(toDto),
    nextCursor: hasMore ? Number(page[page.length - 1]?.id) : null,
  };
}

export async function getUnreadNotificationCount(userId: number) {
  await ensureNotificationStore();
  const rows = await prisma.$queryRawUnsafe<Array<{ count: bigint }>>(
    "SELECT COUNT(*) AS count FROM notification WHERE userId = ? AND readAt IS NULL",
    userId,
  );
  return Number(rows[0]?.count ?? 0n);
}

export async function markNotificationRead(userId: number, id: number) {
  await ensureNotificationStore();
  await prisma.$executeRawUnsafe(
    "UPDATE notification SET readAt = COALESCE(readAt, CURRENT_TIMESTAMP(3)) WHERE userId = ? AND id = ?",
    userId,
    id,
  );
  return { ok: true };
}

export async function markAllNotificationsRead(userId: number) {
  await ensureNotificationStore();
  await prisma.$executeRawUnsafe(
    "UPDATE notification SET readAt = COALESCE(readAt, CURRENT_TIMESTAMP(3)) WHERE userId = ? AND readAt IS NULL",
    userId,
  );
  return { ok: true };
}

export async function createNotification(input: {
  userId: number;
  type: NotificationType;
  title: string;
  body?: string;
  actorId?: number;
  articleId?: number;
  commentId?: number;
  link?: string;
}) {
  if (input.actorId && input.actorId === input.userId) return;
  await ensureNotificationStore();
  await prisma.$executeRawUnsafe(
    `
      INSERT INTO notification (userId, type, title, body, actorId, articleId, commentId, link)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `,
    input.userId,
    input.type,
    input.title,
    input.body ?? null,
    input.actorId ?? null,
    input.articleId ?? null,
    input.commentId ?? null,
    input.link ?? null,
  );
}

export async function notifyArticlePublished(userId: number, articleId: number) {
  await createNotification({
    userId,
    type: "CONTENT_PUBLISHED",
    title: "动态已发布",
    body: "你的内容已进入信息流，可在详情页查看互动。",
    articleId,
    link: `/article/${articleId}`,
  });
}

export async function notifyArticleReviewResult(input: {
  userId: number;
  articleId: number;
  status: string;
  decision?: string | null;
  riskLevel?: string | null;
  reason?: string | null;
  suggestion?: string | null;
}) {
  const detail = [input.reason, input.suggestion].filter(Boolean).join(" ");
  const body = detail || "系统已完成内容处理。";

  if (input.status === "PUBLISHED") {
    await createNotification({
      userId: input.userId,
      type: "CONTENT_REVIEW_APPROVED",
      title: "动态审核通过",
      body: bodyWithRisk("你的内容已进入公开信息流。", input.riskLevel, body),
      articleId: input.articleId,
      link: `/article/${input.articleId}`,
    });
    return;
  }

  if (input.status === "LOW_PRIORITY") {
    await createNotification({
      userId: input.userId,
      type: "CONTENT_REVIEW_LIMITED",
      title: "动态已发布，展示优先级较低",
      body: bodyWithRisk("你的内容可以公开展示，但推荐优先级会被降低。", input.riskLevel, body),
      articleId: input.articleId,
      link: `/article/${input.articleId}`,
    });
    return;
  }

  if (input.status === "REJECTED") {
    await createNotification({
      userId: input.userId,
      type: "CONTENT_REVIEW_REJECTED",
      title: "动态未通过审核",
      body: bodyWithRisk("该内容暂不进入公开信息流。", input.riskLevel, body),
      articleId: input.articleId,
      link: `/article/${input.articleId}`,
    });
    return;
  }

  await createNotification({
    userId: input.userId,
    type: input.decision === "REVIEW" ? "CONTENT_REVIEW_REQUIRED" : "CONTENT_REVIEW_FAILED",
    title: input.decision === "REVIEW" ? "动态进入复核" : "动态审核暂未完成",
    body: bodyWithRisk("该内容暂不公开展示，请等待复核或稍后重试。", input.riskLevel, body),
    articleId: input.articleId,
    link: `/article/${input.articleId}`,
  });
}

export async function notifyCommentCreated(input: {
  articleId: number;
  commentId: number;
  actorId: number;
  replyToUserId?: number;
}) {
  const [article, actor] = await Promise.all([
    prisma.article.findUnique({
      where: { id: input.articleId },
      select: { authorId: true },
    }),
    prisma.user.findUnique({
      where: { id: input.actorId },
      select: { username: true },
    }),
  ]);

  const actorName = actor?.username ?? "有人";
  if (article?.authorId && article.authorId !== input.actorId) {
    await createNotification({
      userId: article.authorId,
      type: "COMMENT",
      title: `${actorName} 评论了你的动态`,
      body: "点击查看评论内容。",
      actorId: input.actorId,
      articleId: input.articleId,
      commentId: input.commentId,
      link: `/article/${input.articleId}`,
    });
  }

  if (input.replyToUserId && input.replyToUserId !== input.actorId && input.replyToUserId !== article?.authorId) {
    await createNotification({
      userId: input.replyToUserId,
      type: "REPLY",
      title: `${actorName} 回复了你`,
      body: "点击查看回复内容。",
      actorId: input.actorId,
      articleId: input.articleId,
      commentId: input.commentId,
      link: `/article/${input.articleId}`,
    });
  }
}

export async function notifyArticleReaction(articleId: number, actorId: number, emoji: string) {
  const [article, actor] = await Promise.all([
    prisma.article.findUnique({
      where: { id: articleId },
      select: { authorId: true },
    }),
    prisma.user.findUnique({
      where: { id: actorId },
      select: { username: true },
    }),
  ]);
  if (!article || article.authorId === actorId) return;

  await createNotification({
    userId: article.authorId,
    type: "ARTICLE_REACTION",
    title: `${actor?.username ?? "有人"} 对你的动态做出了反应`,
    body: emoji,
    actorId,
    articleId,
    link: `/article/${articleId}`,
  });
}

export async function notifyCommentReaction(commentId: number, actorId: number, emoji: string) {
  const [comment, actor] = await Promise.all([
    prisma.comment.findUnique({
      where: { id: commentId },
      select: { userId: true, articleId: true },
    }),
    prisma.user.findUnique({
      where: { id: actorId },
      select: { username: true },
    }),
  ]);
  if (!comment || comment.userId === actorId) return;

  await createNotification({
    userId: comment.userId,
    type: "COMMENT_REACTION",
    title: `${actor?.username ?? "有人"} 对你的评论做出了反应`,
    body: emoji,
    actorId,
    articleId: comment.articleId ?? undefined,
    commentId,
    link: comment.articleId ? `/article/${comment.articleId}` : undefined,
  });
}

export async function notifyFollowed(followerId: number, followingId: number) {
  const follower = await prisma.user.findUnique({
    where: { id: followerId },
    select: { username: true },
  });

  await createNotification({
    userId: followingId,
    type: "FOLLOW",
    title: `${follower?.username ?? "有人"} 关注了你`,
    body: "新的关注关系会影响关注时间线和推荐画像。",
    actorId: followerId,
    link: `/u/${followerId}`,
  });
}

function toDto(row: NotificationRow): NotificationDto {
  return {
    id: row.id.toString(),
    userId: row.userId,
    type: row.type,
    title: row.title,
    body: row.body,
    actorId: row.actorId,
    actor: row.actorId
      ? {
          id: row.actorId,
          username: row.actorUsername ?? "未知用户",
          avatar: row.actorAvatar,
        }
      : null,
    articleId: row.articleId,
    commentId: row.commentId,
    link: row.link,
    readAt: row.readAt,
    createdAt: row.createdAt,
  };
}

function bodyWithRisk(prefix: string, riskLevel: string | null | undefined, detail: string): string {
  const risk = riskLevel ? `风险等级：${riskLevel}。` : "";
  return `${prefix}${risk}${detail ? ` ${detail}` : ""}`.slice(0, 512);
}
