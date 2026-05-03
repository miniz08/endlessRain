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
    select: { id: true },
  });
  if (!article) {
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

  await prisma.reco_article_daily_stat.upsert({
    where: {
      articleId_statDate: {
        articleId: input.articleId,
        statDate,
      },
    },
    create: {
      articleId: input.articleId,
      statDate,
      updatedAt: new Date(),
      qualityScore: qualityDelta(input),
      ...data,
    },
    update: {
      updatedAt: new Date(),
      impressions: { increment: data.impressions ?? 0 },
      clicks: { increment: data.clicks ?? 0 },
      dwellMsSum: { increment: data.dwellMsSum ?? BigInt(0) },
      completeReads: { increment: data.completeReads ?? 0 },
      likes: { increment: data.likes ?? 0 },
      comments: { increment: data.comments ?? 0 },
      favorites: { increment: data.favorites ?? 0 },
      follows: { increment: data.follows ?? 0 },
      hides: { increment: data.hides ?? 0 },
      reports: { increment: data.reports ?? 0 },
      qualityScore: { increment: qualityDelta(input) },
    },
  });
}

async function markSeen(userId: number, articleId: number): Promise<void> {
  await prisma.reco_user_seen.upsert({
    where: {
      userId_articleId: {
        userId,
        articleId,
      },
    },
    create: {
      userId,
      articleId,
      seenCount: 1,
      lastSeenAt: new Date(),
    },
    update: {
      seenCount: { increment: 1 },
      lastSeenAt: new Date(),
    },
  });
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
