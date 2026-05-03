import { listArticles } from "./articleService.js";
import { getActiveFollowingIds } from "./followService.js";
import { recordImpressions, recordRecoRequest } from "./recoEventService.js";
import { listPersonalizedRecommendations } from "./recommendationService.js";

export async function listFollowingFeed(input: { userId: number; limit: number; cursor?: number; requestId: string }) {
  const followingIds = await getActiveFollowingIds(input.userId);
  const authorIds = [...new Set([input.userId, ...followingIds])];

  if (authorIds.length === 0) {
    return { items: [], nextCursor: null, source: "following", followingCount: 0 };
  }

  const page = await listArticles({
    viewerId: input.userId,
    authorIds,
    limit: input.limit,
    cursor: input.cursor,
    hideBlocked: true,
  });
  const resultIds = page.items.map((item) => item.id);
  await recordRecoRequest({
    requestId: input.requestId,
    userId: input.userId,
    scene: "following",
    candidateCount: resultIds.length,
    resultIds,
    abBucket: "following-v1",
  });
  await recordImpressions({
    userId: input.userId,
    scene: "following",
    requestId: input.requestId,
    articleIds: resultIds,
  });

  return {
    ...page,
    requestId: input.requestId,
    source: "following",
    followingCount: followingIds.length,
  };
}

export async function listRecommendedFeed(input: { userId?: number; limit: number; cursor?: number; requestId: string }) {
  return listPersonalizedRecommendations({
    userId: input.userId,
    limit: input.limit,
    cursor: input.cursor,
    requestId: input.requestId,
    scene: "home",
  });
}
