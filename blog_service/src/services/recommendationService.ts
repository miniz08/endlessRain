import { prisma } from "../../lib/prisma.js";
import { buildArticleReactionSummaries, type ReactionSummary } from "./reactionService.js";
import { recordImpressions, recordRecoRequest } from "./recoEventService.js";
import { extractAuthorAffinity, extractTagVector, getUserProfile, refreshUserProfile } from "./userProfileService.js";
import { summarizeContent } from "./contentSanitizer.js";

type ArticleCandidate = Awaited<ReturnType<typeof loadCandidates>>[number];

type DailyStat = {
  articleId: number;
  impressions: number;
  clicks: number;
  completeReads: number;
  likes: number;
  comments: number;
  favorites: number;
  follows: number;
  hides: number;
  reports: number;
  qualityScore: number;
};

export async function listPersonalizedRecommendations(input: {
  userId?: number;
  limit: number;
  cursor?: number;
  requestId: string;
  scene?: string;
}) {
  const scene = input.scene ?? "home";
  const profile = input.userId ? await ensureProfile(input.userId) : null;
  const tagVector = extractTagVector(profile?.tagVector);
  const authorAffinity = extractAuthorAffinity(profile?.authorAffinity);

  const candidates = await loadCandidates({
    cursor: input.cursor,
    take: Math.max(80, input.limit * 8),
  });
  const articleIds = candidates.map((article) => article.id);
  const [reactionMap, commentCounts, dailyStats, seenMap] = await Promise.all([
    buildArticleReactionSummaries(articleIds, input.userId),
    getCommentCounts(articleIds),
    getDailyStats(articleIds),
    input.userId ? getSeenMap(input.userId, articleIds) : Promise.resolve(new Map<number, number>()),
  ]);

  const ranked = candidates
    .filter(isVisible)
    .map((article) => {
      const score = scoreArticle(article, {
        tagVector,
        authorAffinity,
        dailyStat: dailyStats.get(article.id),
        seenCount: seenMap.get(article.id) ?? 0,
      });
      return {
        article,
        score,
        dto: toArticleDto(article, reactionMap.get(article.id), commentCounts.get(article.id) ?? 0, score),
      };
    })
    .sort((a, b) => b.score.total - a.score.total || b.article.posttime.getTime() - a.article.posttime.getTime());

  const page = ranked.slice(0, input.limit);
  const resultIds = page.map((item) => item.article.id);

  await recordRecoRequest({
    requestId: input.requestId,
    userId: input.userId,
    scene,
    candidateCount: candidates.length,
    resultIds,
    abBucket: "profile-v1",
  });
  await recordImpressions({
    userId: input.userId,
    scene,
    requestId: input.requestId,
    articleIds: resultIds,
  });

  return {
    items: page.map((item) => item.dto),
    nextCursor: ranked.length > input.limit ? page[page.length - 1]?.article.id : null,
    requestId: input.requestId,
    source: "personalized",
    strategy: "ai-tag-profile-v1",
    profileReady: Boolean(profile),
  };
}

async function ensureProfile(userId: number) {
  const profile = await getUserProfile(userId);
  const stale = !profile || Date.now() - profile.updatedAt.getTime() > 6 * 60 * 60 * 1000;
  return stale ? refreshUserProfile(userId) : profile;
}

async function loadCandidates(input: { cursor?: number; take: number }) {
  return prisma.article.findMany({
    where: {
      ...(input.cursor ? { id: { lt: input.cursor } } : {}),
    },
    orderBy: [{ posttime: "desc" }, { id: "desc" }],
    take: input.take,
    include: {
      user: {
        select: {
          id: true,
          username: true,
          avatar: true,
          role: true,
          professionalism: true,
          friendliness: true,
        },
      },
      article_ai_analysis: true,
      article_ai_tag_on_article: {
        include: { article_ai_tag: true },
      },
      article_tag_on_article: {
        include: { article_tag: true },
      },
    },
  });
}

function scoreArticle(
  article: ArticleCandidate,
  context: {
    tagVector: Record<string, number>;
    authorAffinity: Record<string, number>;
    dailyStat?: DailyStat;
    seenCount: number;
  },
) {
  const tagMatch = article.article_ai_tag_on_article.reduce((sum, item) => {
    const tagName = item.article_ai_tag.name;
    const interest = context.tagVector[tagName] ?? 0;
    return sum + interest * (item.weight ?? 0.7) * (item.confidence ?? 0.7);
  }, 0);

  const authorAffinity = context.authorAffinity[String(article.authorId)] ?? 0;
  const authorQuality = ((article.user.professionalism + article.user.friendliness) / 2 - 50) / 50;
  const contentQuality = qualityScore(article, context.dailyStat);
  const freshness = freshnessScore(article.posttime);
  const riskPenalty = riskPenaltyScore(article.article_ai_analysis?.legalityScore);
  const seenPenalty = Math.min(2, context.seenCount * 0.55);

  const total =
    tagMatch * 4 +
    authorAffinity * 2 +
    authorQuality * 1.2 +
    contentQuality +
    freshness -
    riskPenalty -
    seenPenalty;

  return {
    total: round(total),
    tagMatch: round(tagMatch),
    authorAffinity: round(authorAffinity),
    authorQuality: round(authorQuality),
    contentQuality: round(contentQuality),
    freshness: round(freshness),
    riskPenalty: round(riskPenalty),
    seenPenalty: round(seenPenalty),
  };
}

function isVisible(article: ArticleCandidate): boolean {
  const legality = article.article_ai_analysis?.legalityScore;
  return legality === undefined || legality === null || legality >= 40;
}

function qualityScore(article: ArticleCandidate, stat?: DailyStat): number {
  const ai = article.article_ai_analysis;
  const aiQuality = ai
    ? (ai.friendlinessScore + ai.rationalityScore + ai.professionalismScore + ai.legalityScore) / 400
    : 0.45;
  const statQuality = stat ? Math.max(-2, Math.min(4, stat.qualityScore / 8)) : 0;
  const engagement =
    stat && stat.impressions > 0
      ? (stat.clicks * 0.6 + stat.likes + stat.comments * 1.2 + stat.favorites * 1.4 - stat.hides - stat.reports * 2) /
        Math.max(10, stat.impressions)
      : 0;

  return aiQuality * 1.8 + statQuality + engagement;
}

function freshnessScore(posttime: Date): number {
  const ageHours = Math.max(0, (Date.now() - posttime.getTime()) / (60 * 60 * 1000));
  return Math.exp(-ageHours / 72);
}

function riskPenaltyScore(legalityScore?: number): number {
  if (legalityScore === undefined || legalityScore === null) return 0.2;
  if (legalityScore >= 80) return 0;
  if (legalityScore >= 60) return 0.8;
  if (legalityScore >= 40) return 2.2;
  return 100;
}

async function getDailyStats(articleIds: number[]): Promise<Map<number, DailyStat>> {
  if (articleIds.length === 0) return new Map();
  const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
  const rows = await prisma.reco_article_daily_stat.findMany({
    where: {
      articleId: { in: articleIds },
      statDate: { gte: since },
    },
  });

  const map = new Map<number, DailyStat>();
  for (const row of rows) {
    const current = map.get(row.articleId) ?? {
      articleId: row.articleId,
      impressions: 0,
      clicks: 0,
      completeReads: 0,
      likes: 0,
      comments: 0,
      favorites: 0,
      follows: 0,
      hides: 0,
      reports: 0,
      qualityScore: 0,
    };
    current.impressions += row.impressions;
    current.clicks += row.clicks;
    current.completeReads += row.completeReads;
    current.likes += row.likes;
    current.comments += row.comments;
    current.favorites += row.favorites;
    current.follows += row.follows;
    current.hides += row.hides;
    current.reports += row.reports;
    current.qualityScore += row.qualityScore;
    map.set(row.articleId, current);
  }
  return map;
}

async function getSeenMap(userId: number, articleIds: number[]): Promise<Map<number, number>> {
  if (articleIds.length === 0) return new Map();
  const rows = await prisma.reco_user_seen.findMany({
    where: {
      userId,
      articleId: { in: articleIds },
    },
    select: { articleId: true, seenCount: true },
  });
  return new Map(rows.map((row) => [row.articleId, row.seenCount]));
}

async function getCommentCounts(articleIds: number[]): Promise<Map<number, number>> {
  if (articleIds.length === 0) return new Map();
  const rows = await prisma.comment.groupBy({
    by: ["articleId"],
    where: {
      articleId: { in: articleIds },
      status: "approved",
    },
    _count: { _all: true },
  });
  const map = new Map<number, number>();
  for (const row of rows) {
    if (row.articleId) map.set(row.articleId, row._count._all);
  }
  return map;
}

function toArticleDto(
  article: ArticleCandidate,
  reactions: ReactionSummary = { total: 0, counts: [], myReactions: [] },
  commentCount = 0,
  recommendation: ReturnType<typeof scoreArticle>,
) {
  return {
    id: article.id,
    content: article.content,
    excerpt: summarizeContent(article.content),
    tag: article.tag,
    posttime: article.posttime,
    author: article.user,
    aiAnalysis: article.article_ai_analysis,
    aiTags: article.article_ai_tag_on_article.map((item) => ({
      name: item.article_ai_tag.name,
      confidence: item.confidence,
      weight: item.weight,
    })),
    manualTags: article.article_tag_on_article.map((item) => ({
      name: item.article_tag.name,
      weight: item.weight,
    })),
    reactions,
    commentCount,
    recommendation,
  };
}

function round(value: number): number {
  return Math.round(value * 10000) / 10000;
}
