<template>
  <div class="page">
    <div v-if="!user" class="panel">
      <h2>私信</h2>
      <p class="muted">登录后可以使用单对单聊天。</p>
      <NuxtLink to="/login">
        <button class="primary">登录</button>
      </NuxtLink>
    </div>

    <div v-else class="chat-layout">
      <aside class="panel chat-sidebar">
        <div class="row" style="justify-content: space-between">
          <h2 style="margin: 0">私信</h2>
          <span class="status-dot" :class="socketStatusClass"></span>
        </div>

        <form class="inline-form chat-search-form" @submit.prevent="searchUsers">
          <input v-model.trim="searchQuery" placeholder="搜索用户名" autocomplete="off" />
          <button class="primary" :disabled="searching || searchQuery.length < 1">
            {{ searching ? "搜索中" : "搜索" }}
          </button>
        </form>
        <p v-if="searchError" class="error">{{ searchError }}</p>

        <div v-if="searchResults.length > 0" class="user-list chat-search-results">
          <button
            v-for="candidate in searchResults"
            :key="candidate.id"
            class="user-item search-user-item"
            type="button"
            :disabled="candidate.id === user.id"
            @click="startThreadWithUser(candidate)"
          >
            <span class="row">
              <span class="avatar">
                <img v-if="avatarUrl(candidate.avatar)" :src="avatarUrl(candidate.avatar)" alt="" />
                <span v-else>{{ candidate.username.slice(0, 1).toUpperCase() }}</span>
              </span>
              <span>{{ candidate.username }}</span>
            </span>
            <small class="muted">{{ candidate.id === user.id ? "自己" : "私聊" }}</small>
          </button>
        </div>

        <div class="thread-list">
          <button
            v-for="thread in threads"
            :key="thread.id"
            class="thread-item"
            :class="{ active: activeThread?.id === thread.id }"
            @click="openThread(thread)"
          >
            <span class="avatar">
              <img v-if="avatarUrl(thread.counterpart.avatar)" :src="avatarUrl(thread.counterpart.avatar)" alt="" />
              <span v-else>{{ thread.counterpart.username.slice(0, 1).toUpperCase() }}</span>
            </span>
            <span>
              <strong>{{ thread.counterpart.username }}</strong>
              <small>{{ messagePreview(thread.lastMessage?.content) || "暂无消息" }}</small>
            </span>
          </button>
        </div>
      </aside>

      <section class="panel chat-main">
        <div v-if="!activeThread" class="empty">选择或创建一个会话</div>
        <template v-else>
          <div class="row chat-title">
            <NuxtLink class="avatar chat-peer-avatar" :to="`/u/${activeThread.counterpart.id}`" title="查看用户主页">
              <img v-if="avatarUrl(activeThread.counterpart.avatar)" :src="avatarUrl(activeThread.counterpart.avatar)" alt="" />
              <span v-else>{{ activeThread.counterpart.username.slice(0, 1).toUpperCase() }}</span>
            </NuxtLink>
            <div>
              <h3 style="margin: 0">{{ activeThread.counterpart.username }}</h3>
              <p class="muted" style="margin: 2px 0 0">{{ socketStatusText }}</p>
            </div>
          </div>

          <div class="message-list">
            <div
              v-for="message in messages"
              :key="message.id"
              class="message-row"
              :class="{ mine: message.senderId === user.id }"
            >
              <div class="message-bubble">
                <RichContent class="message-content" :content="message.content" compact />
                <span>{{ formatTime(message.createdAt) }}</span>
              </div>
            </div>
            <div v-if="messages.length === 0" class="empty">暂无消息</div>
          </div>

          <p v-if="chatError" class="error">{{ chatError }}</p>
          <form class="chat-composer" @submit.prevent="sendMessage">
            <div class="emoji-picker">
              <button
                v-for="emoji in emojis"
                :key="emoji"
                type="button"
                :title="`插入 ${emoji}`"
                @click="insertEmoji(emoji)"
              >
                {{ emoji }}
              </button>
              <button type="button" class="media-button" :disabled="uploadingKind === 'chat'" @click="pickChatImage('chat')">
                {{ uploadingKind === "chat" ? "上传中" : "图片" }}
              </button>
              <button type="button" class="media-button" :disabled="uploadingKind === 'sticker'" @click="pickChatImage('sticker')">
                {{ uploadingKind === "sticker" ? "上传中" : "表情包" }}
              </button>
              <input ref="chatImageInput" type="file" accept="image/png,image/jpeg,image/gif,image/webp" hidden @change="handleChatImageUpload($event, 'chat')" />
              <input ref="chatStickerInput" type="file" accept="image/png,image/jpeg,image/gif,image/webp" hidden @change="handleChatImageUpload($event, 'sticker')" />
            </div>
            <div class="inline-form">
              <input ref="draftInput" v-model="draft" maxlength="5000" placeholder="输入消息" />
              <button class="primary" :disabled="sending || !draft.trim()">
                {{ sending ? "发送中" : "发送" }}
              </button>
            </div>
          </form>
        </template>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { ChatMessage, ChatThread, PublicUser } from "~/types/social";
import { REACTION_EMOJIS } from "~/utils/reactionEmojis";

const config = useRuntimeConfig();
const route = useRoute();
const router = useRouter();
const { chatApi, userApi } = useApi();
const { user, refreshMe } = useAuth();
const { uploadImage } = useMediaUpload();
const threads = ref<ChatThread[]>([]);
const activeThread = ref<ChatThread | null>(null);
const messages = ref<ChatMessage[]>([]);
const searchQuery = ref("");
const searchResults = ref<PublicUser[]>([]);
const searching = ref(false);
const searchError = ref("");
const chatError = ref("");
const draft = ref("");
const draftInput = ref<HTMLInputElement | null>(null);
const chatImageInput = ref<HTMLInputElement | null>(null);
const chatStickerInput = ref<HTMLInputElement | null>(null);
const sending = ref(false);
const uploadingKind = ref<"" | "chat" | "sticker">("");
const socketStatus = ref<"idle" | "connecting" | "open" | "closed" | "error">("idle");
const emojis = REACTION_EMOJIS.slice(0, 10);
let socket: WebSocket | null = null;

const socketStatusText = computed(() => {
  if (socketStatus.value === "open") return "实时连接";
  if (socketStatus.value === "connecting") return "连接中";
  if (socketStatus.value === "error") return "连接异常，发送将降级为 HTTP";
  return "未连接";
});

const socketStatusClass = computed(() => {
  if (socketStatus.value === "open") return "risk-low";
  if (socketStatus.value === "connecting") return "risk-mid";
  return "risk-high";
});

onMounted(async () => {
  await refreshMe();
  if (!user.value) return;
  await loadThreads();
  await openInitialPeer();
  connectSocket();
});

onBeforeUnmount(() => {
  socket?.close();
});

async function loadThreads() {
  const payload = await chatApi<{ items: ChatThread[] }>("/chat/threads?limit=50");
  threads.value = payload.items;
}

async function searchUsers() {
  if (!searchQuery.value.trim()) return;
  searching.value = true;
  searchError.value = "";
  try {
    const query = new URLSearchParams({ q: searchQuery.value.trim(), limit: "8" });
    const payload = await userApi<{ items: PublicUser[] }>(`/users/search?${query.toString()}`);
    searchResults.value = payload.items;
    if (payload.items.length === 0) {
      searchError.value = "没有找到匹配用户";
    }
  } catch (err) {
    searchError.value = err instanceof Error ? err.message : "用户搜索失败";
  } finally {
    searching.value = false;
  }
}

async function startThreadWithUser(target: Pick<PublicUser, "id" | "username" | "avatar" | "role">) {
  if (target.id === user.value?.id) return;
  const payload = await chatApi<{ item: ChatThread }>("/chat/threads", {
    method: "POST",
    body: { peerId: target.id },
  });
  upsertThread(payload.item);
  searchQuery.value = "";
  searchResults.value = [];
  searchError.value = "";
  await openThread(payload.item);
}

async function openThread(thread: ChatThread) {
  activeThread.value = thread;
  const payload = await chatApi<{ items: ChatMessage[] }>(`/chat/threads/${thread.id}/messages?limit=80`);
  messages.value = payload.items;
}

async function sendMessage() {
  if (!activeThread.value || !draft.value.trim()) return;
  sending.value = true;
  const payload = {
    type: "send_message",
    threadId: activeThread.value.id,
    content: draft.value,
    clientId: createClientId(),
  };

  try {
    if (socket?.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(payload));
    } else {
      const response = await chatApi<{ item: ChatMessage }>(`/chat/threads/${activeThread.value.id}/messages`, {
        method: "POST",
        body: { content: draft.value },
      });
      handleIncomingMessage(response.item);
    }
    draft.value = "";
  } finally {
    sending.value = false;
  }
}

function connectSocket() {
  if (!import.meta.client || socket?.readyState === WebSocket.OPEN || socket?.readyState === WebSocket.CONNECTING) return;
  socketStatus.value = "connecting";
  socket = new WebSocket(buildWsUrl());

  socket.addEventListener("open", () => {
    socketStatus.value = "open";
  });

  socket.addEventListener("close", () => {
    socketStatus.value = "closed";
  });

  socket.addEventListener("error", () => {
    socketStatus.value = "error";
  });

  socket.addEventListener("message", (event) => {
    const payload = JSON.parse(event.data as string) as { type: string; message?: ChatMessage };
    if (payload.type === "message_created" && payload.message) {
      handleIncomingMessage(payload.message);
    }
  });
}

function handleIncomingMessage(message: ChatMessage) {
  if (activeThread.value?.id === message.threadId && !messages.value.some((item) => item.id === message.id)) {
    messages.value.push(message);
  }

  const thread = threads.value.find((item) => item.id === message.threadId);
  if (thread) {
    thread.lastMessage = message;
    threads.value = [thread, ...threads.value.filter((item) => item.id !== thread.id)];
  }
}

async function insertEmoji(emoji: string) {
  const input = draftInput.value;
  if (!input) {
    draft.value += emoji;
    return;
  }

  const start = input.selectionStart ?? draft.value.length;
  const end = input.selectionEnd ?? start;
  draft.value = `${draft.value.slice(0, start)}${emoji}${draft.value.slice(end)}`;
  await nextTick();
  input.focus();
  const cursor = start + emoji.length;
  input.setSelectionRange(cursor, cursor);
}

function pickChatImage(kind: "chat" | "sticker") {
  const input = kind === "chat" ? chatImageInput.value : chatStickerInput.value;
  input?.click();
}

async function handleChatImageUpload(event: Event, kind: "chat" | "sticker") {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;

  uploadingKind.value = kind;
  chatError.value = "";
  try {
    const payload = await uploadImage(file, kind);
    const label = kind === "sticker" ? "表情包" : "图片";
    await insertDraftText(`![${label}](${payload.media.url})`);
  } catch (err) {
    chatError.value = err instanceof Error ? err.message : "图片上传失败";
  } finally {
    uploadingKind.value = "";
    input.value = "";
  }
}

async function insertDraftText(text: string) {
  const input = draftInput.value;
  if (!input) {
    draft.value += text;
    return;
  }

  const start = input.selectionStart ?? draft.value.length;
  const end = input.selectionEnd ?? start;
  draft.value = `${draft.value.slice(0, start)}${text}${draft.value.slice(end)}`;
  await nextTick();
  input.focus();
  const cursor = start + text.length;
  input.setSelectionRange(cursor, cursor);
}

function createClientId() {
  const cryptoApi = globalThis.crypto;
  if (typeof cryptoApi?.randomUUID === "function") {
    return cryptoApi.randomUUID();
  }

  const bytes = new Uint8Array(16);
  cryptoApi?.getRandomValues?.(bytes);
  const random = bytes.some(Boolean)
    ? Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")
    : Math.random().toString(36).slice(2);
  return `msg-${Date.now().toString(36)}-${random}`;
}

function avatarUrl(value?: string | null) {
  if (!value) return "";
  if (value.startsWith("/") || value.startsWith("http://") || value.startsWith("https://")) return value;
  return "";
}

function messagePreview(value?: string | null) {
  if (!value) return "";
  return value.replace(/!\[[^\]]*]\([^)]+\)/g, "[图片]");
}

function upsertThread(thread: ChatThread) {
  threads.value = [thread, ...threads.value.filter((item) => item.id !== thread.id)];
}

async function openInitialPeer() {
  const raw = route.query.userId;
  const targetId = typeof raw === "string" ? Number(raw) : NaN;
  if (!Number.isInteger(targetId) || targetId <= 0 || targetId === user.value?.id) return;

  const existing = threads.value.find((thread) => thread.userAId === targetId || thread.userBId === targetId);
  if (existing) {
    await openThread(existing);
  } else {
    const payload = await userApi<{ user: PublicUser }>(`/users/${targetId}`);
    await startThreadWithUser(payload.user);
  }

  await router.replace({ path: "/chat" });
}

function buildWsUrl() {
  const configured = String(config.public.wsBase || "").replace(/\/$/, "");
  if (configured) return `${configured}/chat/ws`;

  const apiBase = String(config.public.apiBase || "/api").replace(/\/$/, "");
  const url = apiBase.startsWith("http")
    ? new URL(`${apiBase}/chat/ws`)
    : new URL(`${apiBase}/chat/ws`, window.location.origin);

  if (url.port === "3000") {
    url.port = "3001";
  } else if (url.port === "13000") {
    url.port = "13001";
  }
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  return url.toString();
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}
</script>
