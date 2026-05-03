import { prisma } from "../../lib/prisma.js";
import { HttpError } from "../utils/validation.js";

export async function followUser(followerId: number, followingId: number) {
  if (followerId === followingId) {
    throw new HttpError(400, "You cannot follow yourself", "FOLLOW_SELF_NOT_ALLOWED");
  }

  const target = await prisma.user.findUnique({
    where: { id: followingId },
    select: { id: true, username: true, avatar: true, role: true, professionalism: true, friendliness: true },
  });
  if (!target) {
    throw new HttpError(404, "User not found", "USER_NOT_FOUND");
  }

  const follow = await prisma.follow.upsert({
    where: {
      followerId_followingId: {
        followerId,
        followingId,
      },
    },
    create: {
      followerId,
      followingId,
      status: "ACTIVE",
    },
    update: {
      status: "ACTIVE",
      updatedAt: new Date(),
    },
  });

  return {
    following: true,
    follow,
    user: target,
  };
}

export async function unfollowUser(followerId: number, followingId: number) {
  if (followerId === followingId) {
    throw new HttpError(400, "You cannot unfollow yourself", "FOLLOW_SELF_NOT_ALLOWED");
  }

  const existing = await prisma.follow.findUnique({
    where: {
      followerId_followingId: {
        followerId,
        followingId,
      },
    },
  });

  if (!existing || existing.status !== "ACTIVE") {
    return { following: false };
  }

  const follow = await prisma.follow.update({
    where: { id: existing.id },
    data: {
      status: "REMOVED",
      updatedAt: new Date(),
    },
  });

  return {
    following: false,
    follow,
  };
}

export async function listFollowing(input: { userId: number; viewerId?: number; limit: number; cursor?: number }) {
  const rows = await prisma.follow.findMany({
    where: {
      followerId: input.userId,
      status: "ACTIVE",
      ...(input.cursor ? { id: { lt: input.cursor } } : {}),
    },
    orderBy: [{ id: "desc" }],
    take: input.limit + 1,
    include: {
      user_follow_followingIdTouser: {
        select: publicUserSelect(),
      },
    },
  });

  const page = rows.slice(0, input.limit);
  const relationMap = input.viewerId
    ? await getFollowStatusMap(input.viewerId, page.map((row) => row.followingId))
    : new Map<number, boolean>();

  return {
    items: page.map((row) => ({
      id: row.id,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      user: {
        ...row.user_follow_followingIdTouser,
        followedByMe: relationMap.get(row.followingId) ?? false,
      },
    })),
    nextCursor: rows.length > input.limit ? page[page.length - 1]?.id : null,
  };
}

export async function listFollowers(input: { userId: number; viewerId?: number; limit: number; cursor?: number }) {
  const rows = await prisma.follow.findMany({
    where: {
      followingId: input.userId,
      status: "ACTIVE",
      ...(input.cursor ? { id: { lt: input.cursor } } : {}),
    },
    orderBy: [{ id: "desc" }],
    take: input.limit + 1,
    include: {
      user_follow_followerIdTouser: {
        select: publicUserSelect(),
      },
    },
  });

  const page = rows.slice(0, input.limit);
  const relationMap = input.viewerId
    ? await getFollowStatusMap(input.viewerId, page.map((row) => row.followerId))
    : new Map<number, boolean>();

  return {
    items: page.map((row) => ({
      id: row.id,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      user: {
        ...row.user_follow_followerIdTouser,
        followedByMe: relationMap.get(row.followerId) ?? false,
      },
    })),
    nextCursor: rows.length > input.limit ? page[page.length - 1]?.id : null,
  };
}

export async function getActiveFollowingIds(userId: number): Promise<number[]> {
  const rows = await prisma.follow.findMany({
    where: {
      followerId: userId,
      status: "ACTIVE",
    },
    select: { followingId: true },
  });
  return rows.map((row) => row.followingId);
}

export async function getFollowSummary(userId: number, viewerId?: number) {
  const [followingCount, followerCount, viewerRelation] = await Promise.all([
    prisma.follow.count({ where: { followerId: userId, status: "ACTIVE" } }),
    prisma.follow.count({ where: { followingId: userId, status: "ACTIVE" } }),
    viewerId
      ? prisma.follow.findUnique({
          where: {
            followerId_followingId: {
              followerId: viewerId,
              followingId: userId,
            },
          },
          select: { status: true },
        })
      : undefined,
  ]);

  return {
    userId,
    followingCount,
    followerCount,
    followedByMe: viewerRelation?.status === "ACTIVE",
  };
}

async function getFollowStatusMap(viewerId: number, targetIds: number[]): Promise<Map<number, boolean>> {
  if (targetIds.length === 0) return new Map();
  const rows = await prisma.follow.findMany({
    where: {
      followerId: viewerId,
      followingId: { in: targetIds },
      status: "ACTIVE",
    },
    select: { followingId: true },
  });
  return new Map(rows.map((row) => [row.followingId, true]));
}

function publicUserSelect() {
  return {
    id: true,
    username: true,
    avatar: true,
    role: true,
    professionalism: true,
    friendliness: true,
  };
}
