import { prisma } from "../../lib/prisma.js";
import { HttpError } from "../utils/validation.js";
import { sanitizeUser } from "./authService.js";

interface RatingRow {
  avgProfessionalism: number | null;
  avgFriendliness: number | null;
  avgRationality: number | null;
  avgLegality: number | null;
  articleCount: bigint;
}

export async function getPublicUserById(id: number) {
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) {
    throw new HttpError(404, "User not found", "USER_NOT_FOUND");
  }
  return sanitizeUser(user);
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

  const rows = await prisma.$queryRaw<RatingRow[]>`
    SELECT
      AVG(aia.professionalismScore) AS avgProfessionalism,
      AVG(aia.friendlinessScore) AS avgFriendliness,
      AVG(aia.rationalityScore) AS avgRationality,
      AVG(aia.legalityScore) AS avgLegality,
      COUNT(aia.id) AS articleCount
    FROM article a
    LEFT JOIN article_ai_analysis aia ON aia.articleId = a.id
    WHERE a.authorId = ${id}
  `;

  const stats = rows[0] ?? {
    avgProfessionalism: null,
    avgFriendliness: null,
    avgRationality: null,
    avgLegality: null,
    articleCount: 0n,
  };

  const professionalism = Math.round(stats.avgProfessionalism ?? user.professionalism);
  const friendliness = Math.round(stats.avgFriendliness ?? user.friendliness);
  const rationality = Math.round(stats.avgRationality ?? 0);
  const legality = Math.round(stats.avgLegality ?? 0);
  const combinedScore = Math.round(professionalism * 0.45 + friendliness * 0.35 + rationality * 0.1 + legality * 0.1);

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
      combinedScore,
      level: levelFromScore(combinedScore),
      articleCount: Number(stats.articleCount),
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

function levelFromScore(score: number): "A" | "B" | "C" | "D" {
  if (score >= 85) return "A";
  if (score >= 70) return "B";
  if (score >= 50) return "C";
  return "D";
}
