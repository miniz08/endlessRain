import crypto from "node:crypto";
import { prisma } from "../../lib/prisma.js";
import { HttpError } from "../utils/validation.js";
import { refreshUserProfile } from "./userProfileService.js";

export type RecoEventType =
  | "IMPRESSION"
  | "CLICK"
  | "DWELL"
  | "READ_COMPLETE"
  | "LIKE"
  | "COMMENT"
  | "FAVORITE"
  | "FOLLOW_AUTHOR"
  | "HIDE"
  | "REPORT";

export type RecoEventInput = {
  userId?: number;
  articleId: number;
  eventType: RecoEventType;
  dwellMs?: number;
  position?: number;
  scene?: string;
  requestId?: string;
  sessionId?: string;
};

const profileTriggerEvents = new Set<RecoEventType>([
  "CLICK",
  "DWELL",
  "READ_COMPLETE",
  "LIKE",
  "COMMENT",
  "FAVORITE",
  "FOLLOW_AUTHOR",
  "HIDE",
  "REPORT",
]);

export async function recordRecoEvent(input: RecoEventInput) {
  const article = await prisma.article.findUnique({
    where: { id: input.articleId },
    select: { id: true, status: true },
  });
  if (!article || !isPublicArticleStatus(article.status)) {
    throw new HttpError(404, "Article not found", "ARTICLE_NOT_FOUND");
  }

  const requestId = input.requestId?.trim() || crypto.randomUUID();
  const event = await prisma.reco_event.create({
    data: {
      userId: input.userId,
      articleId: input.articleId,
      eventType: input.eventType,
      dwellMs: input.dwellMs,
      position: input.position,
      scene: input.scene ?? "home",
      requestId,
      sessionId: input.sessionId,
    },
  });

  await updateDailyStat(input);
  if (input.eventType === "IMPRESSION" && input.userId) {
    await markSeen(input.userId, input.articleId);
  }

  if (input.userId && profileTriggerEvents.has(input.eventType)) {
    await refreshUserProfile(input.userId);
  }

  return event;
}

export async function recordRecoEvents(inputs: RecoEventInput[]): Promise<void> {
  for (const input of inputs) {
    await recordRecoEvent(input);
  }
}

export async function recordRecoRequest(input: {
  requestId: string;
  userId?: number;
  scene: string;
  candidateCount: number;
  resultIds: number[];
  abBucket?: string;
}): Promise<void> {
  await prisma.reco_request_log.upsert({
    where: { requestId: input.requestId },
    create: {
      requestId: input.requestId,
      userId: input.userId,
      scene: input.scene,
      candidateCount: input.candidateCount,
      resultIds: input.resultIds,
      abBucket: input.abBucket,
    },
    update: {
      userId: input.userId,
      scene: input.scene,
      candidateCount: input.candidateCount,
      resultIds: input.resultIds,
      abBucket: input.abBucket,
    },
  });
}

export async function recordImpressions(input: {
  userId?: number;
  scene: string;
  requestId: string;
  articleIds: number[];
}): Promise<void> {
  const rows = input.articleIds.map((articleId, index) => ({
    userId: input.userId,
    articleId,
    eventType: "IMPRESSION" as const,
    position: index + 1,
    scene: input.scene,
    requestId: input.requestId,
  }));

  for (const row of rows) {
    await recordRecoEvent(row);
  }
}

export async function recordFollowAuthorEvent(input: {
  userId: number;
  followingId: number;
  requestId?: string;
  articleId?: number;
}): Promise<void> {
  const article =
    input.articleId !== undefined
      ? await prisma.article.findFirst({
          where: { id: input.articleId, authorId: input.followingId },
          select: { id: true },
        })
      : await prisma.article.findFirst({
          where: { authorId: input.followingId },
          orderBy: [{ posttime: "desc" }, { id: "desc" }],
          select: { id: true },
        });

  if (!article) return;

  await recordRecoEvent({
    userId: input.userId,
    articleId: article.id,
    eventType: "FOLLOW_AUTHOR",
    scene: "follow",
    requestId: input.requestId,
  });
}

async function updateDailyStat(input: RecoEventInput): Promise<void> {
  const statDate = startOfToday();
  const data = metricDelta(input);
  const impressions = data.impressions ?? 0;
  const clicks = data.clicks ?? 0;
  const dwellMsSum = Number(data.dwellMsSum ?? BigInt(0));
  const completeReads = data.completeReads ?? 0;
  const likes = data.likes ?? 0;
  const comments = data.comments ?? 0;
  const favorites = data.favorites ?? 0;
  const follows = data.follows ?? 0;
  const hides = data.hides ?? 0;
  const reports = data.reports ?? 0;
  const qualityScore = qualityDelta(input);

  await prisma.$executeRaw`
    INSERT INTO reco_article_daily_stat (
      articleId, statDate, impressions, clicks, dwellMsSum, completeReads,
      likes, comments, favorites, follows, hides, reports, qualityScore,
      updatedAt, createdAt
    )
    VALUES (
      ${input.articleId}, ${statDate}, ${impressions}, ${clicks}, ${dwellMsSum}, ${completeReads},
      ${likes}, ${comments}, ${favorites}, ${follows}, ${hides}, ${reports}, ${qualityScore},
      CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)
    )
    ON DUPLICATE KEY UPDATE
      updatedAt = CURRENT_TIMESTAMP(3),
      impressions = impressions + ${impressions},
      clicks = clicks + ${clicks},
      dwellMsSum = dwellMsSum + ${dwellMsSum},
      completeReads = completeReads + ${completeReads},
      likes = likes + ${likes},
      comments = comments + ${comments},
      favorites = favorites + ${favorites},
      follows = follows + ${follows},
      hides = hides + ${hides},
      reports = reports + ${reports},
      qualityScore = qualityScore + ${qualityScore}
  `;
}

async function markSeen(userId: number, articleId: number): Promise<void> {
  await prisma.$executeRaw`
    INSERT INTO reco_user_seen (userId, articleId, seenCount, lastSeenAt, createdAt)
    VALUES (${userId}, ${articleId}, 1, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3))
    ON DUPLICATE KEY UPDATE
      seenCount = seenCount + 1,
      lastSeenAt = CURRENT_TIMESTAMP(3)
  `;
}

function metricDelta(input: RecoEventInput) {
  switch (input.eventType) {
    case "IMPRESSION":
      return { impressions: 1 };
    case "CLICK":
      return { clicks: 1 };
    case "DWELL":
      return { dwellMsSum: BigInt(Math.max(0, input.dwellMs ?? 0)) };
    case "READ_COMPLETE":
      return { completeReads: 1 };
    case "LIKE":
      return { likes: 1 };
    case "COMMENT":
      return { comments: 1 };
    case "FAVORITE":
      return { favorites: 1 };
    case "FOLLOW_AUTHOR":
      return { follows: 1 };
    case "HIDE":
      return { hides: 1 };
    case "REPORT":
      return { reports: 1 };
  }
}

function qualityDelta(input: RecoEventInput): number {
  switch (input.eventType) {
    case "CLICK":
      return 0.2;
    case "DWELL":
      return Math.min(1.5, Math.max(0, input.dwellMs ?? 0) / 30000);
    case "READ_COMPLETE":
      return 1.2;
    case "LIKE":
      return 1.5;
    case "COMMENT":
      return 2;
    case "FAVORITE":
      return 2.5;
    case "FOLLOW_AUTHOR":
      return 2;
    case "HIDE":
      return -2;
    case "REPORT":
      return -5;
    default:
      return 0;
  }
}

function startOfToday(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function isPublicArticleStatus(status?: string | null): boolean {
  return status === undefined || status === null || status === "PUBLISHED" || status === "LOW_PRIORITY";
}
