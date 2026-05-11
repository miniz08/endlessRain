import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { prisma } from "../../lib/prisma.js";
import { HttpError } from "../utils/validation.js";

export interface PublicUser {
  id: number;
  username: string;
  email: string;
  avatar: string | null;
  bio: string | null;
  role: string;
  professionalism: number;
  friendliness: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface AuthUser {
  id: number;
  username: string;
  email: string;
  role: string;
}

export interface TokenSet {
  accessToken: string;
  refreshToken: string;
  csrfToken: string;
  accessTokenExpiresIn: number;
  refreshTokenExpiresIn: number;
}

interface RequestContext {
  userAgent?: string;
  ipAddress?: string;
}

interface AccessPayload extends jwt.JwtPayload {
  sub: string;
  username: string;
  email: string;
  role: string;
}

const ACCESS_TOKEN_SECONDS = Number(process.env.ACCESS_TOKEN_SECONDS ?? 15 * 60);
const REFRESH_TOKEN_DAYS = Number(process.env.REFRESH_TOKEN_DAYS ?? 30);
const REFRESH_TOKEN_SECONDS = REFRESH_TOKEN_DAYS * 24 * 60 * 60;

function accessSecret(): string {
  return process.env.ACCESS_TOKEN_SECRET ?? process.env.JWT_SECRET ?? "dev-access-token-secret";
}

export function sanitizeUser(user: {
  id: number;
  username: string;
  email: string;
  avatar: string | null;
  bio: string | null;
  role: string;
  professionalism: number;
  friendliness: number;
  createdAt: Date;
  updatedAt: Date;
}): PublicUser {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    avatar: user.avatar,
    bio: user.bio,
    role: user.role,
    professionalism: user.professionalism,
    friendliness: user.friendliness,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

export async function registerUser(input: {
  username: string;
  email: string;
  password: string;
  avatar?: string;
  role?: string;
}): Promise<{ user: PublicUser; tokens: TokenSet }> {
  const existing = await prisma.user.findFirst({
    where: {
      OR: [{ username: input.username }, { email: input.email }],
    },
    select: { id: true, username: true, email: true },
  });

  if (existing) {
    const field = existing.email === input.email ? "email" : "username";
    throw new HttpError(409, `${field} already exists`, "USER_EXISTS");
  }

  const passwordHash = await bcrypt.hash(input.password, 12);
  const user = await prisma.user.create({
    data: {
      username: input.username,
      email: input.email,
      password: passwordHash,
      avatar: input.avatar,
      role: input.role ?? "user",
    },
  });

  const tokens = await issueTokens(user.id, {
    username: user.username,
    email: user.email,
    role: user.role,
  });

  return { user: sanitizeUser(user), tokens };
}

export async function loginUser(
  identifier: string,
  password: string,
  context: RequestContext,
): Promise<{ user: PublicUser; tokens: TokenSet }> {
  const normalized = identifier.toLowerCase();
  const user = await prisma.user.findFirst({
    where: {
      OR: [{ email: normalized }, { username: identifier }],
    },
  });

  if (!user) {
    throw new HttpError(401, "Invalid credentials", "INVALID_CREDENTIALS");
  }

  const ok = await bcrypt.compare(password, user.password);
  if (!ok) {
    throw new HttpError(401, "Invalid credentials", "INVALID_CREDENTIALS");
  }

  const tokens = await issueTokens(
    user.id,
    {
      username: user.username,
      email: user.email,
      role: user.role,
    },
    context,
  );

  return { user: sanitizeUser(user), tokens };
}

export async function refreshTokens(
  refreshToken: string,
  csrfToken: string,
  context: RequestContext,
): Promise<{ user: PublicUser; tokens: TokenSet }> {
  const tokenHash = hashToken(refreshToken);
  const record = await prisma.auth_refresh_token.findUnique({
    where: { tokenHash },
    include: { user: true },
  });

  if (!record || record.revokedAt || record.expiresAt.getTime() <= Date.now()) {
    throw new HttpError(401, "Refresh token is invalid or expired", "REFRESH_TOKEN_INVALID");
  }

  if (record.csrfToken !== csrfToken) {
    throw new HttpError(403, "CSRF token is invalid", "CSRF_INVALID");
  }

  const tokens = createRawTokenSet(record.user.id, {
    username: record.user.username,
    email: record.user.email,
    role: record.user.role,
  });
  const newHash = hashToken(tokens.refreshToken);

  await prisma.$transaction([
    prisma.auth_refresh_token.update({
      where: { id: record.id },
      data: {
        revokedAt: new Date(),
        replacedByTokenHash: newHash,
      },
    }),
    prisma.auth_refresh_token.create({
      data: {
        userId: record.userId,
        tokenHash: newHash,
        csrfToken: tokens.csrfToken,
        expiresAt: new Date(Date.now() + REFRESH_TOKEN_SECONDS * 1000),
        userAgent: context.userAgent,
        ipAddress: context.ipAddress,
      },
    }),
  ]);

  return { user: sanitizeUser(record.user), tokens };
}

export async function revokeRefreshToken(refreshToken: string | undefined): Promise<void> {
  if (!refreshToken) return;
  const tokenHash = hashToken(refreshToken);
  await prisma.auth_refresh_token.updateMany({
    where: {
      tokenHash,
      revokedAt: null,
    },
    data: {
      revokedAt: new Date(),
    },
  });
}

export async function getUserByAccessToken(accessToken: string): Promise<AuthUser> {
  let payload: AccessPayload;
  try {
    payload = jwt.verify(accessToken, accessSecret()) as AccessPayload;
  } catch {
    throw new HttpError(401, "Access token is invalid or expired", "ACCESS_TOKEN_INVALID");
  }

  const id = Number(payload.sub);
  if (!Number.isInteger(id) || id <= 0) {
    throw new HttpError(401, "Access token subject is invalid", "ACCESS_TOKEN_INVALID");
  }

  const user = await prisma.user.findUnique({
    where: { id },
    select: { id: true, username: true, email: true, role: true },
  });

  if (!user) {
    throw new HttpError(401, "User no longer exists", "USER_NOT_FOUND");
  }

  return user;
}

async function issueTokens(
  userId: number,
  user: { username: string; email: string; role: string },
  context: RequestContext = {},
): Promise<TokenSet> {
  const tokens = createRawTokenSet(userId, user);
  await prisma.auth_refresh_token.create({
    data: {
      userId,
      tokenHash: hashToken(tokens.refreshToken),
      csrfToken: tokens.csrfToken,
      expiresAt: new Date(Date.now() + REFRESH_TOKEN_SECONDS * 1000),
      userAgent: context.userAgent,
      ipAddress: context.ipAddress,
    },
  });
  return tokens;
}

function createRawTokenSet(
  userId: number,
  user: { username: string; email: string; role: string },
): TokenSet {
  const accessToken = jwt.sign(
    {
      username: user.username,
      email: user.email,
      role: user.role,
    },
    accessSecret(),
    {
      subject: String(userId),
      expiresIn: ACCESS_TOKEN_SECONDS,
    },
  );

  return {
    accessToken,
    refreshToken: randomToken(),
    csrfToken: randomToken(),
    accessTokenExpiresIn: ACCESS_TOKEN_SECONDS,
    refreshTokenExpiresIn: REFRESH_TOKEN_SECONDS,
  };
}

function randomToken(): string {
  return crypto.randomBytes(32).toString("base64url");
}

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}
