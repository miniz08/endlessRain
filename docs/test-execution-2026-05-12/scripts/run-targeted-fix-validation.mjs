import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { performance } from "node:perf_hooks";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.resolve(process.argv[2] ?? path.join(scriptDir, ".."));
const rawDir = path.join(outDir, "raw");
const gatewayBase = process.env.TEST_GATEWAY_BASE ?? "http://127.0.0.1:3001";
const wsBase = process.env.TEST_WS_BASE ?? "ws://127.0.0.1:3001";
const runId = `${Date.now().toString(36)}${crypto.randomBytes(2).toString("hex")}`;
const password = "TestPass123!";

const results = [];

class CookieJar {
  constructor() {
    this.cookies = new Map();
  }

  header() {
    return [...this.cookies.entries()].map(([key, value]) => `${key}=${value}`).join("; ");
  }

  store(headers) {
    const values = typeof headers.getSetCookie === "function"
      ? headers.getSetCookie()
      : splitSetCookie(headers.get("set-cookie"));
    for (const raw of values) {
      const first = raw.split(";")[0];
      const index = first.indexOf("=");
      if (index <= 0) continue;
      const name = first.slice(0, index).trim();
      const value = first.slice(index + 1).trim();
      if (/;\s*max-age=0\b/i.test(raw)) {
        this.cookies.delete(name);
      } else {
        this.cookies.set(name, value);
      }
    }
  }
}

class Client {
  constructor(label) {
    this.label = label;
    this.jar = new CookieJar();
  }
}

function splitSetCookie(value) {
  if (!value) return [];
  return value.split(/,(?=\s*[^;,]+=)/g).map((item) => item.trim()).filter(Boolean);
}

async function request(client, method, route, body) {
  const headers = {
    "x-request-id": `fix-${runId}-${crypto.randomUUID()}`,
    "user-agent": "longseason-targeted-fix-validation/2026-05-12",
  };
  const cookie = client?.jar.header();
  if (cookie) headers.cookie = cookie;

  const init = { method, headers, redirect: "manual" };
  if (body !== undefined) {
    headers["content-type"] = "application/json";
    init.body = JSON.stringify(body);
  }

  const started = performance.now();
  const response = await fetch(`${gatewayBase}${route}`, init);
  client?.jar.store(response.headers);
  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text.slice(0, 400);
  }
  return {
    status: response.status,
    durationMs: Math.round((performance.now() - started) * 100) / 100,
    requestId: response.headers.get("x-request-id") ?? data?.error?.requestId ?? null,
    body: data,
  };
}

function username(prefix) {
  return `${prefix}_${runId}`.slice(0, 32);
}

function userBody(prefix, role) {
  const name = username(prefix);
  return {
    username: name,
    email: `${name}@example.com`,
    password,
    ...(role ? { role } : {}),
  };
}

function record(id, name, pass, detail) {
  results.push({
    id,
    name,
    pass,
    detail,
    checkedAt: new Date().toISOString(),
  });
}

async function waitForGateway() {
  const deadline = Date.now() + 30_000;
  let last = "";
  while (Date.now() < deadline) {
    try {
      const response = await request(null, "GET", "/health");
      if (response.status === 200) return;
      last = `status=${response.status}`;
    } catch (error) {
      last = error instanceof Error ? error.message : String(error);
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(`gateway not ready: ${last}`);
}

async function validateRoleEscalationBlocked() {
  const response = await request(new Client("roleRisk"), "POST", "/api/auth/register", userBody("fix_role", "admin"));
  record(
    "FIX-SEC-001",
    "public registration rejects client-supplied role",
    response.status === 400 && response.body?.error?.code === "ROLE_NOT_ALLOWED",
    { status: response.status, body: response.body },
  );
}

async function registerNormal(label) {
  const client = new Client(label);
  const response = await request(client, "POST", "/api/auth/register", userBody(`fix_${label}`));
  const pass = response.status === 201 && response.body?.user?.role === "user";
  record(`FIX-AUTH-${label.toUpperCase()}`, `normal registration creates user role for ${label}`, pass, {
    status: response.status,
    user: response.body?.user,
  });
  if (!pass) throw new Error(`${label} registration failed`);
  return { client, user: response.body.user };
}

async function validateWebSocketRealtime(userA, userB) {
  const threadResponse = await request(userA.client, "POST", "/api/chat/threads", { peerId: userB.user.id });
  const threadId = threadResponse.body?.item?.id;
  record("FIX-WS-THREAD", "chat thread can be created through gateway", threadResponse.status === 201 && Boolean(threadId), {
    status: threadResponse.status,
    body: threadResponse.body,
  });
  if (!threadId) throw new Error("thread creation failed");

  const WebSocket = require("../../../chat_service/node_modules/ws");
  const bMessages = [];
  const aMessages = [];
  const bSocket = await openWebSocket(WebSocket, userB.client, bMessages);
  const aSocket = await openWebSocket(WebSocket, userA.client, aMessages);

  const ready = await waitFor(
    () => aMessages.some((message) => message.type === "ready") && bMessages.some((message) => message.type === "ready"),
    7000,
  );
  record("FIX-WS-READY", "authenticated websocket clients receive ready through gateway", ready, {
    aMessages,
    bMessages,
  });

  const clientId = `fix-ws-${runId}`;
  aSocket.send(JSON.stringify({
    type: "send_message",
    threadId,
    content: "targeted websocket validation message",
    clientId,
  }));
  const delivered = await waitFor(
    () => bMessages.some((message) => message.type === "message_created" && message.clientId === clientId),
    7000,
  );
  record("FIX-WS-DELIVERY", "websocket message is delivered through gateway", delivered, {
    clientId,
    bMessages,
  });

  aSocket.close();
  bSocket.close();
}

function openWebSocket(WebSocket, client, messages) {
  return new Promise((resolve, reject) => {
    const token = client.jar.cookies.get("ls_access_token");
    const ws = new WebSocket(`${wsBase}/api/chat/ws?token=${encodeURIComponent(token)}`, {
      headers: {
        cookie: client.jar.header(),
        "x-request-id": `fix-ws-${runId}-${crypto.randomUUID()}`,
      },
    });
    const timer = setTimeout(() => reject(new Error("websocket open timeout")), 5000);
    ws.on("message", (raw) => {
      try {
        messages.push(JSON.parse(raw.toString("utf8")));
      } catch {
        messages.push({ raw: raw.toString("utf8") });
      }
    });
    ws.on("open", () => {
      clearTimeout(timer);
      resolve(ws);
    });
    ws.on("unexpected-response", (_request, response) => {
      clearTimeout(timer);
      reject(new Error(`unexpected response ${response.statusCode}`));
    });
    ws.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
}

async function validateRecommendedFeedPressure(userA) {
  const total = 160;
  const concurrency = 16;
  const durations = [];
  const statuses = new Map();
  let index = 0;

  async function worker() {
    while (index < total) {
      index += 1;
      const response = await request(userA.client, "GET", "/api/feeds/recommended?limit=10");
      durations.push(response.durationMs);
      statuses.set(response.status, (statuses.get(response.status) ?? 0) + 1);
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  durations.sort((a, b) => a - b);
  const success = statuses.get(200) ?? 0;
  const failed = total - success;
  record("FIX-PRESSURE-RECO", "recommended feed has no 500 under focused concurrent load", failed === 0, {
    total,
    concurrency,
    statuses: Object.fromEntries(statuses),
    p95Ms: durations[Math.floor(durations.length * 0.95)] ?? null,
    maxMs: durations.at(-1) ?? null,
  });
}

async function waitFor(predicate, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return true;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return false;
}

await fs.mkdir(rawDir, { recursive: true });
const startedAt = new Date().toISOString();
let error = null;

try {
  await waitForGateway();
  await validateRoleEscalationBlocked();
  const userA = await registerNormal("a");
  const userB = await registerNormal("b");
  await validateWebSocketRealtime(userA, userB);
  await validateRecommendedFeedPressure(userA);
} catch (caught) {
  error = caught instanceof Error ? { message: caught.message, stack: caught.stack } : { message: String(caught) };
}

const summary = {
  runId,
  gatewayBase,
  wsBase,
  startedAt,
  endedAt: new Date().toISOString(),
  passed: results.filter((item) => item.pass).length,
  failed: results.filter((item) => !item.pass).length + (error ? 1 : 0),
  error,
  results,
};

await fs.writeFile(path.join(rawDir, "targeted-fix-validation.json"), JSON.stringify(summary, null, 2), "utf8");
console.log(JSON.stringify(summary, null, 2));

if (summary.failed > 0) {
  process.exitCode = 1;
}
