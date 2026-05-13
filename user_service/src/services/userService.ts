import { prisma } from "../../lib/prisma.js";
import { HttpError } from "../utils/validation.js";
import { sanitizeUser } from "./authService.js";

interface RatingRow {
  avgProfessionalism: number | null;
  avgFriendliness: number | null;
  avgRationality: number | null;
  avgLegality: number | null;
  articleCount: bigint;
  publishedCount: bigint;
  lowPriorityCount: bigint;
  reviewRequiredCount: bigint;
  rejectedCount: bigint;
}

interface FeedbackRow {
  positiveFeedback: bigint;
  completeReads: bigint;
  negativeFeedback: bigint;
  reports: bigint;
}

export async function getPublicUserById(id: number) {
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) {
    throw new HttpError(404, "User not found", "USER_NOT_FOUND");
  }
  return sanitizeUser(user);
}

export async function searchPublicUsers(query: string, limit: number) {
  const normalized = query.trim();
  if (!normalized) return [];

  const users = await prisma.user.findMany({
    where: {
      username: {
        contains: normalized,
      },
    },
    orderBy: [{ username: "asc" }, { id: "asc" }],
    take: Math.min(Math.max(limit, 1), 20),
  });

  return users.map(sanitizeUser);
}

export async function getUserRating(id: number) {
  const user = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      username: true,
      professionalism: true,
      friendliness: true,
    },
  });

  if (!user) {
    throw new HttpError(404, "User not found", "USER_NOT_FOUND");
  }

  const [rows, feedbackRows] = await Promise.all([
    prisma.$queryRaw<RatingRow[]>`
      SELECT
        AVG(aia.professionalismScore) AS avgProfessionalism,
        AVG(aia.friendlinessScore) AS avgFriendliness,
        AVG(aia.rationalityScore) AS avgRationality,
        AVG(aia.legalityScore) AS avgLegality,
        COUNT(a.id) AS articleCount,
        SUM(CASE WHEN COALESCE(a.status, 'PUBLISHED') = 'PUBLISHED' THEN 1 ELSE 0 END) AS publishedCount,
        SUM(CASE WHEN a.status = 'LOW_PRIORITY' THEN 1 ELSE 0 END) AS lowPriorityCount,
        SUM(CASE WHEN a.status = 'REVIEW_REQUIRED' THEN 1 ELSE 0 END) AS reviewRequiredCount,
        SUM(CASE WHEN a.status = 'REJECTED' THEN 1 ELSE 0 END) AS rejectedCount
      FROM article a
      LEFT JOIN article_ai_analysis aia ON aia.articleId = a.id
      WHERE a.authorId = ${id}
    `,
    prisma.$queryRaw<FeedbackRow[]>`
      SELECT
        SUM(CASE WHEN re.eventType IN ('LIKE', 'COMMENT', 'FAVORITE', 'FOLLOW_AUTHOR') THEN 1 ELSE 0 END) AS positiveFeedback,
        SUM(CASE WHEN re.eventType = 'READ_COMPLETE' THEN 1 ELSE 0 END) AS completeReads,
        SUM(CASE WHEN re.eventType IN ('HIDE', 'REPORT') THEN 1 ELSE 0 END) AS negativeFeedback,
        SUM(CASE WHEN re.eventType = 'REPORT' THEN 1 ELSE 0 END) AS reports
      FROM article a
      LEFT JOIN reco_event re ON re.articleId = a.id
      WHERE a.authorId = ${id}
    `,
  ]);

  const stats = rows[0] ?? {
    avgProfessionalism: null,
    avgFriendliness: null,
    avgRationality: null,
    avgLegality: null,
    articleCount: 0n,
    publishedCount: 0n,
    lowPriorityCount: 0n,
    reviewRequiredCount: 0n,
    rejectedCount: 0n,
  };
  const feedback = feedbackRows[0] ?? {
    positiveFeedback: 0n,
    completeReads: 0n,
    negativeFeedback: 0n,
    reports: 0n,
  };

  const professionalism = Math.round(stats.avgProfessionalism ?? user.professionalism);
  const friendliness = Math.round(stats.avgFriendliness ?? user.friendliness);
  const rationality = Math.round(stats.avgRationality ?? 0);
  const legality = Math.round(stats.avgLegality ?? 0);
  const articleCount = Number(stats.articleCount);
  const publishedCount = Number(stats.publishedCount);
  const lowPriorityCount = Number(stats.lowPriorityCount);
  const reviewRequiredCount = Number(stats.reviewRequiredCount);
  const rejectedCount = Number(stats.rejectedCount);
  const positiveFeedback = Number(feedback.positiveFeedback ?? 0n);
  const completeReads = Number(feedback.completeReads ?? 0n);
  const negativeFeedback = Number(feedback.negativeFeedback ?? 0n);
  const reports = Number(feedback.reports ?? 0n);

  const contentQualityScore = clampScore(
    professionalism * 0.35 + friendliness * 0.25 + rationality * 0.2 + legality * 0.2,
  );
  const complianceScore = clampScore(100 - lowPriorityCount * 4 - reviewRequiredCount * 12 - rejectedCount * 28 - reports * 8);
  const feedbackScore = clampScore(50 + positiveFeedback * 1.2 + completeReads * 0.4 - negativeFeedback * 9);
  const combinedScore = Math.round(contentQualityScore * 0.55 + complianceScore * 0.25 + feedbackScore * 0.2);
  const signals = buildRatingSignals({
    articleCount,
    lowPriorityCount,
    reviewRequiredCount,
    rejectedCount,
    negativeFeedback,
    reports,
    legality,
    feedbackScore,
  });

  return {
    userId: user.id,
    username: user.username,
    stored: {
      professionalism: user.professionalism,
      friendliness: user.friendliness,
    },
    computed: {
      professionalism,
      friendliness,
      rationality,
      legality,
      contentQualityScore,
      complianceScore,
      feedbackScore,
      combinedScore,
      level: levelFromScore(combinedScore),
      articleCount,
      publishedCount,
      lowPriorityCount,
      reviewRequiredCount,
      rejectedCount,
      positiveFeedback,
      completeReads,
      negativeFeedback,
      reports,
      signals,
    },
  };
}

export async function updateUserRole(id: number, role: string) {
  const user = await prisma.user.update({
    where: { id },
    data: { role },
  });
  return sanitizeUser(user);
}

export async function updateUserProfile(id: number, input: { bio?: string | null; avatar?: string }) {
  const data: { bio?: string | null; avatar?: string; updatedAt: Date } = {
    updatedAt: new Date(),
  };
  if (input.bio !== undefined) data.bio = input.bio;
  if (input.avatar !== undefined) data.avatar = input.avatar;

  const user = await prisma.user.update({
    where: { id },
    data,
  });
  return sanitizeUser(user);
}

function levelFromScore(score: number): "A" | "B" | "C" | "D" {
  if (score >= 85) return "A";
  if (score >= 70) return "B";
  if (score >= 50) return "C";
  return "D";
}

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function buildRatingSignals(input: {
  articleCount: number;
  lowPriorityCount: number;
  reviewRequiredCount: number;
  rejectedCount: number;
  negativeFeedback: number;
  reports: number;
  legality: number;
  feedbackScore: number;
}) {
  const signals: string[] = [];
  if (input.articleCount === 0) signals.push("暂无可评价内容");
  if (input.lowPriorityCount > 0) signals.push(`低优先级内容 ${input.lowPriorityCount} 篇`);
  if (input.reviewRequiredCount > 0) signals.push(`进入复核内容 ${input.reviewRequiredCount} 篇`);
  if (input.rejectedCount > 0) signals.push(`未通过审核内容 ${input.rejectedCount} 篇`);
  if (input.reports > 0) signals.push(`收到举报 ${input.reports} 次`);
  if (input.negativeFeedback > 0) signals.push(`存在隐藏/举报等负向反馈 ${input.negativeFeedback} 次`);
  if (input.legality > 0 && input.legality < 60) signals.push("内容合法性均分偏低");
  if (input.feedbackScore >= 75) signals.push("内容互动反馈较好");
  return signals;
}
