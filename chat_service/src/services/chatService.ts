import { prisma } from "../lib/prisma.js";
import { HttpError, buildMessageContent } from "../utils/validation.js";

type PublicUser = {
  id: number;
  username: string;
  avatar: string | null;
  role: string;
};

export type ChatMessageDto = {
  id: number;
  threadId: number;
  senderId: number;
  content: string;
  createdAt: Date;
  sender: PublicUser;
};

export type ChatThreadDto = {
  id: number;
  userAId: number;
  userBId: number;
  createdAt: Date;
  counterpart: PublicUser;
  lastMessage: ChatMessageDto | null;
};

const userSelect = {
  id: true,
  username: true,
  avatar: true,
  role: true,
};

const messageInclude = {
  user: {
    select: userSelect,
  },
};

function threadInclude() {
  return {
    user_chat_thread_userAIdTouser: {
      select: userSelect,
    },
    user_chat_thread_userBIdTouser: {
      select: userSelect,
    },
    chat_message: {
      orderBy: { id: "desc" as const },
      take: 1,
      include: messageInclude,
    },
  };
}

export async function listThreads(userId: number, options: { limit: number; cursor?: number }): Promise<{
  items: ChatThreadDto[];
  nextCursor?: number;
}> {
  const rows = await prisma.chat_thread.findMany({
    where: {
      AND: [
        options.cursor ? { id: { lt: options.cursor } } : {},
        {
          OR: [{ userAId: userId }, { userBId: userId }],
        },
      ],
    },
    orderBy: { id: "desc" },
    take: options.limit + 1,
    include: threadInclude(),
  });

  const hasMore = rows.length > options.limit;
  const page = hasMore ? rows.slice(0, options.limit) : rows;
  return {
    items: page.map((thread) => toThreadDto(thread, userId)),
    nextCursor: hasMore ? page[page.length - 1]?.id : undefined,
  };
}

export async function getOrCreateThread(userId: number, peerId: number): Promise<ChatThreadDto> {
  if (userId === peerId) {
    throw new HttpError(400, "Cannot create a chat thread with yourself", "SELF_THREAD_NOT_ALLOWED");
  }

  const peer = await prisma.user.findUnique({
    where: { id: peerId },
    select: { id: true },
  });

  if (!peer) {
    throw new HttpError(404, "Peer user not found", "PEER_NOT_FOUND");
  }

  const { userAId, userBId } = orderedPair(userId, peerId);
  const thread = await prisma.chat_thread.upsert({
    where: {
      userAId_userBId: {
        userAId,
        userBId,
      },
    },
    create: {
      userAId,
      userBId,
    },
    update: {},
    include: threadInclude(),
  });

  return toThreadDto(thread, userId);
}

export async function listMessages(
  userId: number,
  threadId: number,
  options: { limit: number; cursor?: number },
): Promise<{
  items: ChatMessageDto[];
  nextCursor?: number;
}> {
  await assertThreadParticipant(threadId, userId);

  const rows = await prisma.chat_message.findMany({
    where: {
      threadId,
      ...(options.cursor ? { id: { lt: options.cursor } } : {}),
    },
    orderBy: { id: "desc" },
    take: options.limit + 1,
    include: messageInclude,
  });

  const hasMore = rows.length > options.limit;
  const page = hasMore ? rows.slice(0, options.limit) : rows;
  return {
    items: page.reverse().map(toMessageDto),
    nextCursor: hasMore ? page[page.length - 1]?.id : undefined,
  };
}

export async function createMessage(input: {
  senderId: number;
  threadId: number;
  content: unknown;
  emoji?: unknown;
}): Promise<{
  message: ChatMessageDto;
  participantIds: number[];
}> {
  const thread = await assertThreadParticipant(input.threadId, input.senderId);
  const content = buildMessageContent(input.content, input.emoji);

  const message = await prisma.chat_message.create({
    data: {
      threadId: input.threadId,
      senderId: input.senderId,
      content,
    },
    include: messageInclude,
  });

  return {
    message: toMessageDto(message),
    participantIds: [thread.userAId, thread.userBId],
  };
}

export async function assertThreadParticipant(threadId: number, userId: number): Promise<{
  id: number;
  userAId: number;
  userBId: number;
}> {
  const thread = await prisma.chat_thread.findFirst({
    where: {
      id: threadId,
      OR: [{ userAId: userId }, { userBId: userId }],
    },
    select: { id: true, userAId: true, userBId: true },
  });

  if (!thread) {
    throw new HttpError(404, "Chat thread not found", "THREAD_NOT_FOUND");
  }

  return thread;
}

function orderedPair(userId: number, peerId: number): { userAId: number; userBId: number } {
  return userId < peerId ? { userAId: userId, userBId: peerId } : { userAId: peerId, userBId: userId };
}

function toThreadDto(thread: any, currentUserId: number): ChatThreadDto {
  const counterpart =
    thread.userAId === currentUserId
      ? thread.user_chat_thread_userBIdTouser
      : thread.user_chat_thread_userAIdTouser;

  return {
    id: thread.id,
    userAId: thread.userAId,
    userBId: thread.userBId,
    createdAt: thread.createdAt,
    counterpart: toPublicUser(counterpart),
    lastMessage: thread.chat_message?.[0] ? toMessageDto(thread.chat_message[0]) : null,
  };
}

function toMessageDto(message: any): ChatMessageDto {
  return {
    id: message.id,
    threadId: message.threadId,
    senderId: message.senderId,
    content: message.content,
    createdAt: message.createdAt,
    sender: toPublicUser(message.user),
  };
}

function toPublicUser(user: any): PublicUser {
  return {
    id: user.id,
    username: user.username,
    avatar: user.avatar ?? null,
    role: user.role,
  };
}
