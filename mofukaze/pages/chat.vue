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

        <form class="inline-form" @submit.prevent="startThread">
          <input v-model.number="peerId" type="number" min="1" placeholder="用户 ID" />
          <button class="primary" :disabled="!peerId">开始</button>
        </form>

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
              <small>{{ thread.lastMessage?.content || "暂无消息" }}</small>
            </span>
          </button>
        </div>
      </aside>

      <section class="panel chat-main">
        <div v-if="!activeThread" class="empty">选择或创建一个会话</div>
        <template v-else>
          <div class="row chat-title">
            <span class="avatar">
              <img v-if="avatarUrl(activeThread.counterpart.avatar)" :src="avatarUrl(activeThread.counterpart.avatar)" alt="" />
              <span v-else>{{ activeThread.counterpart.username.slice(0, 1).toUpperCase() }}</span>
            </span>
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
                <p>{{ message.content }}</p>
                <span>{{ formatTime(message.createdAt) }}</span>
              </div>
            </div>
            <div v-if="messages.length === 0" class="empty">暂无消息</div>
          </div>

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
import type { ChatMessage, ChatThread } from "~/types/social";
import { REACTION_EMOJIS } from "~/utils/reactionEmojis";

const config = useRuntimeConfig();
const { chatApi } = useApi();
const { user, refreshMe } = useAuth();
const threads = ref<ChatThread[]>([]);
const activeThread = ref<ChatThread | null>(null);
const messages = ref<ChatMessage[]>([]);
const peerId = ref<number | null>(null);
const draft = ref("");
const draftInput = ref<HTMLInputElement | null>(null);
const sending = ref(false);
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
  connectSocket();
});

onBeforeUnmount(() => {
  socket?.close();
});

async function loadThreads() {
  const payload = await chatApi<{ items: ChatThread[] }>("/chat/threads?limit=50");
  threads.value = payload.items;
}

async function startThread() {
  if (!peerId.value) return;
  const payload = await chatApi<{ item: ChatThread }>("/chat/threads", {
    method: "POST",
    body: { peerId: peerId.value },
  });
  upsertThread(payload.item);
  peerId.value = null;
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

function upsertThread(thread: ChatThread) {
  threads.value = [thread, ...threads.value.filter((item) => item.id !== thread.id)];
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
