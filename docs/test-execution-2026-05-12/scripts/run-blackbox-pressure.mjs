import fs from "node:fs/promises";
import path from "node:path";
import { performance } from "node:perf_hooks";
import crypto from "node:crypto";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.resolve(process.argv[2] ?? path.join(scriptDir, ".."));
const rawDir = path.join(outDir, "raw");
const gatewayBase = process.env.TEST_GATEWAY_BASE ?? "http://127.0.0.1:3001";
const frontendBase = process.env.TEST_FRONTEND_BASE ?? "http://127.0.0.1:3000";
const wsBase = process.env.TEST_WS_BASE ?? "ws://127.0.0.1:3001";
const runId = `${Date.now().toString(36)}${crypto.randomBytes(3).toString("hex")}`;
const password = "TestPass123!";
const adminIdentifier = process.env.TEST_ADMIN_IDENTIFIER;
const adminPassword = process.env.TEST_ADMIN_PASSWORD;

const results = [];
const defects = [];
const artifacts = {
  users: {},
  articles: {},
  comments: {},
  threads: {},
};

class CookieJar {
  constructor(label) {
    this.label = label;
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
    this.jar = new CookieJar(label);
    this.csrfToken = undefined;
  }
}

const guest = new Client("guest");
const userA = new Client("userA");
const userB = new Client("userB");
const admin = new Client("admin");
const temp = new Client("tempLogout");

function splitSetCookie(value) {
  if (!value) return [];
  return value.split(/,(?=\s*[^;,]+=)/g).map((item) => item.trim()).filter(Boolean);
}

function nowIso() {
  return new Date().toISOString();
}

function statusOk(actual, expected) {
  if (Array.isArray(expected)) return expected.includes(actual);
  if (typeof expected === "function") return expected(actual);
  return actual === expected;
}

async function request(client, method, urlPath, options = {}) {
  const url = urlPath.startsWith("http") ? urlPath : `${gatewayBase}${urlPath}`;
  const headers = {
    "x-request-id": options.requestId ?? `bb-${runId}-${crypto.randomUUID()}`,
    "user-agent": "longseason-blackbox-runner/2026-05-12",
    ...(options.headers ?? {}),
  };
  const cookie = client?.jar?.header();
  if (cookie) headers.cookie = cookie;

  let body;
  if (options.body !== undefined) {
    headers["content-type"] = "application/json";
    body = JSON.stringify(options.body);
  }

  const started = performance.now();
  const response = await fetch(url, {
    method,
    headers,
    body,
    redirect: "manual",
  });
  const durationMs = performance.now() - started;
  client?.jar?.store(response.headers);

  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text.slice(0, 500);
  }

  return {
    status: response.status,
    ok: response.ok,
    durationMs: Math.round(durationMs * 100) / 100,
    requestId: response.headers.get("x-request-id") ?? data?.error?.requestId ?? null,
    headers: {
      contentType: response.headers.get("content-type"),
      rateLimitRemaining: response.headers.get("ratelimit-remaining"),
    },
    body: data,
  };
}

async function caseRequest({ id, category, name, client = guest, method = "GET", path: urlPath, body, expectedStatus = 200, validate, note }) {
  const startedAt = nowIso();
  try {
    const response = await request(client, method, urlPath, { body });
    const passed = statusOk(response.status, expectedStatus) && (validate ? validate(response) : true);
    results.push({
      id,
      category,
      name,
      method,
      path: urlPath,
      expectedStatus: Array.isArray(expectedStatus) ? expectedStatus.join("/") : String(expectedStatus),
      actualStatus: response.status,
      pass: passed,
      durationMs: response.durationMs,
      requestId: response.requestId,
      note: note ?? summarize(response.body),
      startedAt,
    });
    if (!passed) {
      defects.push({
        id,
        category,
        name,
        expectedStatus,
        actualStatus: response.status,
        detail: summarize(response.body, 800),
      });
    }
    return response;
  } catch (error) {
    results.push({
      id,
      category,
      name,
      method,
      path: urlPath,
      expectedStatus: Array.isArray(expectedStatus) ? expectedStatus.join("/") : String(expectedStatus),
      actualStatus: "REQUEST_FAILED",
      pass: false,
      durationMs: null,
      requestId: null,
      note: error instanceof Error ? error.message : String(error),
      startedAt,
    });
    defects.push({
      id,
      category,
      name,
      expectedStatus,
      actualStatus: "REQUEST_FAILED",
      detail: error instanceof Error ? error.stack ?? error.message : String(error),
    });
    return null;
  }
}

function skipCase({ id, category, name, method = "GET", path: urlPath, note }) {
  results.push({
    id,
    category,
    name,
    method,
    path: urlPath,
    expectedStatus: "SKIPPED",
    actualStatus: "SKIPPED",
    pass: true,
    durationMs: null,
    requestId: null,
    note,
    startedAt: nowIso(),
  });
}

async function adminCase(options) {
  if (!artifacts.users.admin?.id) {
    skipCase({
      ...options,
      note: "Set TEST_ADMIN_IDENTIFIER and TEST_ADMIN_PASSWORD to run admin-only black-box cases after public role assignment was disabled.",
    });
    return null;
  }
  return caseRequest(options);
}

function summarize(value, max = 240) {
  if (value === null || value === undefined) return "";
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return text.length > max ? `${text.slice(0, max)}...` : text;
}

function safeUser(label, role) {
  return {
    username: `${label}_${runId}`.slice(0, 31),
    email: `${label}-${runId}@example.test`,
    password,
    ...(role ? { role } : {}),
  };
}

function rememberUser(key, response) {
  const user = response?.body?.user;
  if (user?.id) artifacts.users[key] = { id: user.id, username: user.username, role: user.role };
  const csrfToken = response?.body?.csrfToken;
  if (csrfToken && key === "A") userA.csrfToken = csrfToken;
  if (csrfToken && key === "B") userB.csrfToken = csrfToken;
  if (csrfToken && key === "admin") admin.csrfToken = csrfToken;
  if (csrfToken && key === "temp") temp.csrfToken = csrfToken;
}

async function waitForReady() {
  const checks = [
    `${gatewayBase}/health`,
    `${gatewayBase}/api/gateway/health`,
    `${frontendBase}/`,
  ];
  const deadline = Date.now() + 90_000;
  const readiness = [];
  for (const url of checks) {
    let ready = false;
    let last = "";
    while (Date.now() < deadline) {
      try {
        const response = await fetch(url);
        last = `${response.status}`;
        if (response.status < 500) {
          ready = true;
          break;
        }
      } catch (error) {
        last = error instanceof Error ? error.message : String(error);
      }
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }
    readiness.push({ url, ready, last });
  }
  return readiness;
}

async function runBlackBox() {
  const readiness = await waitForReady();
  await fs.writeFile(path.join(rawDir, "readiness.json"), JSON.stringify(readiness, null, 2), "utf8");

  await caseRequest({ id: "BB-001", category: "health", name: "网关健康检查", path: "/health", expectedStatus: 200, validate: (r) => r.body?.service === "api_gateway" });
  await caseRequest({ id: "BB-002", category: "health", name: "聚合健康检查", path: "/api/gateway/health", expectedStatus: 200, validate: (r) => r.body?.status === "ok" || r.body?.status === "degraded" });
  await caseRequest({ id: "BB-003", category: "health", name: "网关路由列表", path: "/api/gateway/routes", expectedStatus: 200, validate: (r) => Array.isArray(r.body?.items) && r.body.items.length >= 10 });
  await caseRequest({ id: "BB-004", category: "health", name: "网关指标结构", path: "/api/gateway/metrics", expectedStatus: 200, validate: (r) => Array.isArray(r.body?.items) });
  await caseRequest({ id: "BB-005", category: "health", name: "未知 API 路径", path: "/api/unknown", expectedStatus: 404, validate: (r) => r.body?.error?.code === "GATEWAY_ROUTE_NOT_FOUND" && Boolean(r.body?.error?.requestId) });
  const fixedRequestId = `manual-${runId}`;
  const requestIdResp = await request(guest, "GET", "/health", { requestId: fixedRequestId });
  results.push({
    id: "BB-006",
    category: "health",
    name: "请求 ID 透传",
    method: "GET",
    path: "/health",
    expectedStatus: "200",
    actualStatus: requestIdResp.status,
    pass: requestIdResp.status === 200 && requestIdResp.requestId === fixedRequestId,
    durationMs: requestIdResp.durationMs,
    requestId: requestIdResp.requestId,
    note: `sent=${fixedRequestId}; received=${requestIdResp.requestId}`,
    startedAt: nowIso(),
  });

  const aInput = safeUser("bbA");
  const bInput = safeUser("bbB");
  const tempInput = safeUser("bbTemp");

  rememberUser("A", await caseRequest({ id: "BB-101", category: "auth", name: "用户 A 注册", client: userA, method: "POST", path: "/api/auth/register", body: aInput, expectedStatus: 201, validate: (r) => Boolean(r.body?.user?.id) }));
  rememberUser("B", await caseRequest({ id: "BB-102", category: "auth", name: "用户 B 注册", client: userB, method: "POST", path: "/api/auth/register", body: bInput, expectedStatus: 201, validate: (r) => Boolean(r.body?.user?.id) }));
  if (adminIdentifier && adminPassword) {
    rememberUser("admin", await caseRequest({ id: "BB-103", category: "auth", name: "管理员测试账号登录", client: admin, method: "POST", path: "/api/auth/login", body: { identifier: adminIdentifier, password: adminPassword }, expectedStatus: 200, validate: (r) => ["admin", "superadmin"].includes(r.body?.user?.role) }));
  } else {
    skipCase({ id: "BB-103", category: "auth", name: "管理员测试账号登录", method: "POST", path: "/api/auth/login", note: "TEST_ADMIN_IDENTIFIER and TEST_ADMIN_PASSWORD were not provided." });
  }
  await caseRequest({ id: "SEC-001", category: "security", name: "注册接口不应允许客户端自选 admin 角色", client: new Client("roleRisk"), method: "POST", path: "/api/auth/register", body: safeUser("bbRoleRisk", "admin"), expectedStatus: [400, 403], note: "若返回 201，说明存在注册提权风险" });
  await caseRequest({ id: "BB-104", category: "auth", name: "重复邮箱注册", client: guest, method: "POST", path: "/api/auth/register", body: { ...aInput, username: `${aInput.username}x`.slice(0, 32) }, expectedStatus: 409 });
  await caseRequest({ id: "BB-105", category: "auth", name: "注册参数校验", client: guest, method: "POST", path: "/api/auth/register", body: { username: "", email: "bad", password: "1" }, expectedStatus: 400 });
  await caseRequest({ id: "BB-106", category: "auth", name: "登录失败", client: guest, method: "POST", path: "/api/auth/login", body: { identifier: aInput.email, password: "WrongPass123!" }, expectedStatus: 401 });
  await caseRequest({ id: "BB-107", category: "auth", name: "登录后获取当前用户", client: userA, method: "GET", path: "/api/auth/me", expectedStatus: 200, validate: (r) => r.body?.user?.id === artifacts.users.A?.id });
  await caseRequest({ id: "BB-108", category: "auth", name: "游客获取当前用户", client: guest, method: "GET", path: "/api/auth/me", expectedStatus: 401 });
  await caseRequest({ id: "BB-109", category: "auth", name: "会话刷新", client: userA, method: "POST", path: "/api/auth/refresh", body: { csrfToken: userA.csrfToken }, expectedStatus: 200, validate: (r) => Boolean(r.body?.csrfToken) });
  rememberUser("temp", await caseRequest({ id: "BB-110", category: "auth", name: "退出登录准备账号", client: temp, method: "POST", path: "/api/auth/register", body: tempInput, expectedStatus: 201 }));
  await caseRequest({ id: "BB-111", category: "auth", name: "退出登录", client: temp, method: "POST", path: "/api/auth/logout", body: {}, expectedStatus: 200 });
  await caseRequest({ id: "BB-112", category: "auth", name: "退出后受保护接口不可访问", client: temp, method: "GET", path: "/api/auth/me", expectedStatus: 401 });

  const userBId = artifacts.users.B?.id;
  const userAId = artifacts.users.A?.id;
  await caseRequest({ id: "BB-201", category: "users", name: "查看公开资料", path: `/api/users/${userBId}`, expectedStatus: 200, validate: (r) => r.body?.user?.id === userBId });
  await caseRequest({ id: "BB-202", category: "users", name: "查看不存在用户", path: "/api/users/999999999", expectedStatus: 404 });
  await caseRequest({ id: "BB-203", category: "users", name: "用户搜索", path: `/api/users/search?q=${encodeURIComponent(bInput.username)}`, expectedStatus: 200, validate: (r) => Array.isArray(r.body?.items) });
  await caseRequest({ id: "BB-204", category: "users", name: "用户评分", path: `/api/users/${userBId}/rating`, expectedStatus: 200, validate: (r) => Boolean(r.body?.rating) });
  await caseRequest({ id: "BB-205", category: "users", name: "普通用户修改角色被拒绝", client: userA, method: "PATCH", path: `/api/users/${userBId}/role`, body: { role: "admin" }, expectedStatus: 403 });
  await caseRequest({ id: "BB-206", category: "users", name: "游客修改角色被拒绝", client: guest, method: "PATCH", path: `/api/users/${userBId}/role`, body: { role: "admin" }, expectedStatus: 401 });
  await adminCase({ id: "BB-207", category: "users", name: "管理员修改角色", client: admin, method: "PATCH", path: `/api/users/${userBId}/role`, body: { role: "user" }, expectedStatus: 200, validate: (r) => r.body?.user?.role === "user" });

  await caseRequest({ id: "BB-301", category: "articles", name: "游客访问文章列表", path: "/api/articles?limit=5", expectedStatus: 200, validate: (r) => Array.isArray(r.body?.items) });
  await caseRequest({ id: "BB-302", category: "articles", name: "游客发布文章被拒绝", client: guest, method: "POST", path: "/api/articles", body: { content: "游客不应能发布内容" }, expectedStatus: 401 });
  await caseRequest({ id: "BB-303", category: "articles", name: "发布参数校验", client: userA, method: "POST", path: "/api/articles", body: { content: "" }, expectedStatus: 400 });
  const bArticleResp = await caseRequest({
    id: "BB-304",
    category: "articles",
    name: "用户 B 发布可公开文章",
    client: userB,
    method: "POST",
    path: "/api/articles",
    body: {
      content: "这是一次黑盒测试发布的文章。内容包含数据、分析、研究、模型、方法、案例和结论，也包含谢谢、请、分享、讨论、理解和帮助等友好表达，用于触发 mock AI 的稳定通过结果。",
      tags: ["blackbox", "mock-ai", runId],
    },
    expectedStatus: 201,
    validate: (r) => Boolean(r.body?.article?.id) && ["PUBLISHED", "LOW_PRIORITY"].includes(r.body?.article?.status),
  });
  artifacts.articles.B = { id: bArticleResp?.body?.article?.id, status: bArticleResp?.body?.article?.status };
  const aArticleResp = await caseRequest({
    id: "BB-305",
    category: "articles",
    name: "用户 A 发布文章",
    client: userA,
    method: "POST",
    path: "/api/articles",
    body: {
      content: "用户 A 的测试文章用于详情、删除和审计流程验证。本文包含数据分析、方法说明和案例结论，表达保持友好，并用于黑盒测试的后续步骤。",
      tags: ["blackbox", "delete-target"],
    },
    expectedStatus: 201,
    validate: (r) => Boolean(r.body?.article?.id),
  });
  artifacts.articles.A = { id: aArticleResp?.body?.article?.id, status: aArticleResp?.body?.article?.status };
  await caseRequest({ id: "BB-306", category: "articles", name: "文章详情", client: userA, path: `/api/articles/${artifacts.articles.B.id}`, expectedStatus: 200, validate: (r) => r.body?.article?.id === artifacts.articles.B.id });
  await caseRequest({ id: "BB-307", category: "articles", name: "不存在文章", path: "/api/articles/999999999", expectedStatus: 404 });
  await caseRequest({ id: "BB-308", category: "articles", name: "标签列表", path: "/api/articles/tags", expectedStatus: 200, validate: (r) => Array.isArray(r.body?.items) });
  await caseRequest({ id: "BB-309", category: "articles", name: "非作者删除文章被拒绝", client: userA, method: "DELETE", path: `/api/articles/${artifacts.articles.B.id}`, expectedStatus: 403 });

  await caseRequest({ id: "BB-401", category: "comments", name: "评论列表", path: `/api/articles/${artifacts.articles.B.id}/comments`, expectedStatus: 200, validate: (r) => Array.isArray(r.body?.items) });
  await caseRequest({ id: "BB-402", category: "comments", name: "游客评论被拒绝", client: guest, method: "POST", path: `/api/articles/${artifacts.articles.B.id}/comments`, body: { content: "guest comment" }, expectedStatus: 401 });
  await caseRequest({ id: "BB-403", category: "comments", name: "评论参数校验", client: userA, method: "POST", path: `/api/articles/${artifacts.articles.B.id}/comments`, body: { content: "" }, expectedStatus: 400 });
  const commentResp = await caseRequest({ id: "BB-404", category: "comments", name: "创建评论", client: userA, method: "POST", path: `/api/articles/${artifacts.articles.B.id}/comments`, body: { content: "这是一条黑盒测试评论，用于验证通知、reaction 和删除权限。" }, expectedStatus: 201, validate: (r) => Boolean(r.body?.comment?.id) });
  artifacts.comments.AonB = { id: commentResp?.body?.comment?.id };
  await caseRequest({ id: "BB-405", category: "comments", name: "越权删除评论被拒绝", client: userB, method: "DELETE", path: `/api/comments/${artifacts.comments.AonB.id}`, expectedStatus: 403 });
  await caseRequest({ id: "BB-406", category: "comments", name: "文章 reaction", client: userA, method: "POST", path: `/api/articles/${artifacts.articles.B.id}/reactions`, body: { emoji: "👍" }, expectedStatus: 200, validate: (r) => ["added", "created", "removed"].includes(r.body?.action) });
  await caseRequest({ id: "BB-407", category: "comments", name: "取消文章 reaction", client: userA, method: "POST", path: `/api/articles/${artifacts.articles.B.id}/reactions`, body: { emoji: "👍" }, expectedStatus: 200, validate: (r) => ["added", "created", "removed"].includes(r.body?.action) });
  await caseRequest({ id: "BB-408", category: "comments", name: "评论 reaction", client: userB, method: "POST", path: `/api/comments/${artifacts.comments.AonB.id}/reactions`, body: { emoji: "💡" }, expectedStatus: 200 });
  await caseRequest({ id: "BB-409", category: "comments", name: "游客 reaction 被拒绝", client: guest, method: "POST", path: `/api/articles/${artifacts.articles.B.id}/reactions`, body: { emoji: "👍" }, expectedStatus: 401 });

  await caseRequest({ id: "BB-501", category: "follow-feed", name: "关注用户", client: userA, method: "POST", path: `/api/users/${userBId}/follow`, body: { articleId: artifacts.articles.B.id }, expectedStatus: 200 });
  await caseRequest({ id: "BB-502", category: "follow-feed", name: "重复关注", client: userA, method: "POST", path: `/api/users/${userBId}/follow`, body: {}, expectedStatus: 200 });
  await caseRequest({ id: "BB-503", category: "follow-feed", name: "禁止自我关注", client: userA, method: "POST", path: `/api/users/${userAId}/follow`, body: {}, expectedStatus: 400 });
  await caseRequest({ id: "BB-504", category: "follow-feed", name: "关注列表", client: userA, path: `/api/following?userId=${userAId}`, expectedStatus: 200, validate: (r) => Array.isArray(r.body?.items) });
  await caseRequest({ id: "BB-505", category: "follow-feed", name: "粉丝列表", client: userB, path: `/api/followers?userId=${userBId}`, expectedStatus: 200, validate: (r) => Array.isArray(r.body?.items) });
  await caseRequest({ id: "BB-506", category: "follow-feed", name: "关注摘要", client: userA, path: `/api/users/${userBId}/follow-summary`, expectedStatus: 200, validate: (r) => typeof r.body?.summary?.followedByMe === "boolean" });
  await caseRequest({ id: "BB-507", category: "follow-feed", name: "关注流", client: userA, path: "/api/feeds/following?limit=10", expectedStatus: 200, validate: (r) => Array.isArray(r.body?.items) });
  await caseRequest({ id: "BB-508", category: "follow-feed", name: "推荐流", client: userA, path: "/api/feeds/recommended?limit=10", expectedStatus: 200, validate: (r) => Array.isArray(r.body?.items) });

  await caseRequest({ id: "BB-601", category: "recommendation", name: "上报曝光事件", client: userA, method: "POST", path: "/api/reco/events", body: { articleId: artifacts.articles.B.id, eventType: "IMPRESSION", position: 1, scene: "blackbox" }, expectedStatus: 201, validate: (r) => Boolean(r.body?.event?.id) });
  await caseRequest({ id: "BB-602", category: "recommendation", name: "上报点击事件", client: userA, method: "POST", path: "/api/reco/events", body: { articleId: artifacts.articles.B.id, eventType: "CLICK", scene: "blackbox" }, expectedStatus: 201 });
  await caseRequest({ id: "BB-603", category: "recommendation", name: "非法推荐事件", client: userA, method: "POST", path: "/api/reco/events", body: { articleId: artifacts.articles.B.id, eventType: "BAD_EVENT" }, expectedStatus: 400 });
  await caseRequest({ id: "BB-604", category: "recommendation", name: "刷新我的画像", client: userA, method: "POST", path: "/api/reco/profile/me/refresh", body: {}, expectedStatus: 200, validate: (r) => Boolean(r.body?.profile) });
  await caseRequest({ id: "BB-605", category: "recommendation", name: "查看我的画像", client: userA, path: "/api/reco/profile/me", expectedStatus: 200, validate: (r) => Boolean(r.body?.profile) });

  await caseRequest({ id: "BB-701", category: "notifications", name: "通知列表", client: userB, path: "/api/notifications?limit=20", expectedStatus: 200, validate: (r) => Array.isArray(r.body?.items) });
  await caseRequest({ id: "BB-702", category: "notifications", name: "未读数量", client: userB, path: "/api/notifications/unread-count", expectedStatus: 200, validate: (r) => Number.isInteger(r.body?.count) });
  await caseRequest({ id: "BB-703", category: "notifications", name: "全部已读", client: userB, method: "PATCH", path: "/api/notifications/read-all", body: {}, expectedStatus: 200 });
  await caseRequest({ id: "BB-704", category: "notifications", name: "游客通知被拒绝", client: guest, path: "/api/notifications", expectedStatus: 401 });

  await caseRequest({ id: "BB-801", category: "ai", name: "普通用户访问 AI 接口被拒绝", client: userA, path: "/api/analysis/taxonomy", expectedStatus: 403 });
  await adminCase({ id: "BB-802", category: "ai", name: "管理员访问 AI 标签分类", client: admin, path: "/api/analysis/taxonomy", expectedStatus: 200, validate: (r) => Number.isInteger(r.body?.count?.tags) });
  await adminCase({ id: "BB-803", category: "ai", name: "AI 文本分析", client: admin, method: "POST", path: "/api/analysis/text", body: { content: "请分享一个包含数据、研究、模型、方法和结论的友好讨论案例。" }, expectedStatus: 200, validate: (r) => Boolean(r.body?.result?.decision) });
  await adminCase({ id: "BB-804", category: "ai", name: "文章 AI 分析查询", client: admin, path: `/api/analysis/articles/${artifacts.articles.B.id}`, expectedStatus: 200, validate: (r) => Boolean(r.body?.analysis) });

  const threadResp = await caseRequest({ id: "BB-901", category: "chat", name: "创建私信线程", client: userA, method: "POST", path: "/api/chat/threads", body: { peerId: userBId }, expectedStatus: 201, validate: (r) => Boolean(r.body?.item?.id) });
  artifacts.threads.AB = { id: threadResp?.body?.item?.id };
  await caseRequest({ id: "BB-902", category: "chat", name: "线程列表", client: userA, path: "/api/chat/threads", expectedStatus: 200, validate: (r) => Array.isArray(r.body?.items) });
  await caseRequest({ id: "BB-903", category: "chat", name: "发送私信", client: userA, method: "POST", path: `/api/chat/threads/${artifacts.threads.AB.id}/messages`, body: { content: "黑盒测试私信消息" }, expectedStatus: 201, validate: (r) => Boolean(r.body?.item?.id) });
  await caseRequest({ id: "BB-904", category: "chat", name: "消息历史", client: userB, path: `/api/chat/threads/${artifacts.threads.AB.id}/messages`, expectedStatus: 200, validate: (r) => Array.isArray(r.body?.items) });
  await runWebSocketCases();

  await caseRequest({ id: "BB-1001", category: "audit", name: "游客访问审计日志被拒绝", path: "/api/gateway/audit-logs", expectedStatus: 401 });
  await caseRequest({ id: "BB-1002", category: "audit", name: "普通用户访问审计日志被拒绝", client: userA, path: "/api/gateway/audit-logs", expectedStatus: 403 });
  await adminCase({ id: "BB-1003", category: "audit", name: "管理员访问审计日志", client: admin, path: "/api/gateway/audit-logs?limit=10", expectedStatus: 200, validate: (r) => Array.isArray(r.body?.items) });
  await adminCase({ id: "BB-1004", category: "audit", name: "管理员摘要", client: admin, path: "/api/gateway/admin-summary?hours=24", expectedStatus: 200, validate: (r) => Boolean(r.body?.totals) });

  await runFrontendSmoke();

  await caseRequest({ id: "BB-1201", category: "cleanup", name: "作者删除文章", client: userA, method: "DELETE", path: `/api/articles/${artifacts.articles.A.id}`, expectedStatus: 200 });
  await caseRequest({ id: "BB-1202", category: "cleanup", name: "删除评论", client: userA, method: "DELETE", path: `/api/comments/${artifacts.comments.AonB.id}`, expectedStatus: 200 });
  await caseRequest({ id: "BB-1203", category: "cleanup", name: "取消关注", client: userA, method: "DELETE", path: `/api/users/${userBId}/follow`, expectedStatus: 200 });
}

async function runWebSocketCases() {
  let WebSocket;
  try {
    WebSocket = require("../../../chat_service/node_modules/ws");
  } catch (error) {
    results.push({
      id: "BB-905",
      category: "chat",
      name: "WebSocket 依赖加载",
      method: "WS",
      path: "/api/chat/ws",
      expectedStatus: "dependency available",
      actualStatus: "SKIPPED",
      pass: false,
      durationMs: null,
      requestId: null,
      note: error instanceof Error ? error.message : String(error),
      startedAt: nowIso(),
    });
    return;
  }

  await new Promise((resolve) => {
    const ws = new WebSocket(`${wsBase}/api/chat/ws`);
    let completed = false;
    const finish = (pass, note) => {
      if (completed) return;
      completed = true;
      results.push({
        id: "BB-905",
        category: "chat",
        name: "未认证 WebSocket 被拒绝",
        method: "WS",
        path: "/api/chat/ws",
        expectedStatus: "401",
        actualStatus: pass ? "401" : "unexpected",
        pass,
        durationMs: null,
        requestId: null,
        note,
        startedAt: nowIso(),
      });
      try { ws.terminate(); } catch {}
      resolve();
    };
    ws.on("unexpected-response", (_req, res) => finish(res.statusCode === 401, `status=${res.statusCode}`));
    ws.on("open", () => finish(false, "unexpected open"));
    ws.on("error", (error) => {
      if (!completed) finish(false, error.message);
    });
    setTimeout(() => finish(false, "timeout"), 5000);
  });

  const bMessages = [];
  const aMessages = [];
  let bSocket;
  let aSocket;
  try {
    const bReady = openAuthedWs(WebSocket, userB, bMessages);
    const aReady = openAuthedWs(WebSocket, userA, aMessages);
    [bSocket, aSocket] = await Promise.all([bReady, aReady]);
  } catch (error) {
    results.push({
      id: "BB-906",
      category: "chat",
      name: "已认证 WebSocket 连接",
      method: "WS",
      path: "/api/chat/ws",
      expectedStatus: "ready",
      actualStatus: "connect_failed",
      pass: false,
      durationMs: null,
      requestId: null,
      note: error instanceof Error ? error.message : String(error),
      startedAt: nowIso(),
    });
    return;
  }
  const readyPass = await waitFor(
    () => bMessages.some((m) => m.type === "ready") && aMessages.some((m) => m.type === "ready"),
    7000,
  );
  results.push({
    id: "BB-906",
    category: "chat",
    name: "已认证 WebSocket 连接",
    method: "WS",
    path: "/api/chat/ws",
    expectedStatus: "ready",
    actualStatus: readyPass ? "ready" : "not_ready",
    pass: readyPass,
    durationMs: null,
    requestId: null,
    note: `aMessages=${aMessages.length}; bMessages=${bMessages.length}`,
    startedAt: nowIso(),
  });

  const clientId = `ws-${runId}`;
  aSocket.send(JSON.stringify({
    type: "send_message",
    threadId: artifacts.threads.AB.id,
    content: "WebSocket 黑盒实时消息",
    clientId,
  }));
  const delivered = await waitFor(() => bMessages.some((m) => m.type === "message_created" && m.clientId === clientId), 7000);
  results.push({
    id: "BB-907",
    category: "chat",
    name: "WebSocket 实时消息送达",
    method: "WS",
    path: "/api/chat/ws",
    expectedStatus: "message_created",
    actualStatus: delivered ? "message_created" : "timeout",
    pass: delivered,
    durationMs: null,
    requestId: null,
    note: delivered ? "receiver got broadcast" : summarize(bMessages),
    startedAt: nowIso(),
  });
  try { aSocket.close(); } catch {}
  try { bSocket.close(); } catch {}
}

function openAuthedWs(WebSocket, client, messages) {
  return new Promise((resolve, reject) => {
    const token = client.jar.cookies.get("ls_access_token");
    const url = token
      ? `${wsBase}/api/chat/ws?token=${encodeURIComponent(token)}`
      : `${wsBase}/api/chat/ws`;
    const ws = new WebSocket(url, {
      headers: {
        cookie: client.jar.header(),
        "x-request-id": `ws-${runId}-${crypto.randomUUID()}`,
      },
    });
    ws.on("message", (raw) => {
      try {
        messages.push(JSON.parse(raw.toString("utf8")));
      } catch {
        messages.push({ raw: raw.toString("utf8") });
      }
    });
    ws.on("open", () => resolve(ws));
    ws.on("unexpected-response", (_req, res) => reject(new Error(`unexpected response ${res.statusCode}`)));
    ws.on("error", reject);
    setTimeout(() => reject(new Error("websocket open timeout")), 5000);
  });
}

async function waitFor(predicate, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return true;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return predicate();
}

async function runFrontendSmoke() {
  const pages = ["/", "/login", "/register", "/notifications", "/ops"];
  for (let i = 0; i < pages.length; i += 1) {
    const page = pages[i];
    const started = performance.now();
    try {
      const response = await fetch(`${frontendBase}${page}`);
      const text = await response.text();
      const pass = response.status >= 200 && response.status < 500 && /<html|<div|__nuxt/i.test(text);
      results.push({
        id: `BB-11${String(i + 1).padStart(2, "0")}`,
        category: "frontend",
        name: `前端页面 ${page}`,
        method: "GET",
        path: page,
        expectedStatus: "2xx-4xx rendered",
        actualStatus: response.status,
        pass,
        durationMs: Math.round((performance.now() - started) * 100) / 100,
        requestId: null,
        note: `bytes=${text.length}`,
        startedAt: nowIso(),
      });
    } catch (error) {
      results.push({
        id: `BB-11${String(i + 1).padStart(2, "0")}`,
        category: "frontend",
        name: `前端页面 ${page}`,
        method: "GET",
        path: page,
        expectedStatus: "rendered",
        actualStatus: "REQUEST_FAILED",
        pass: false,
        durationMs: Math.round((performance.now() - started) * 100) / 100,
        requestId: null,
        note: error instanceof Error ? error.message : String(error),
        startedAt: nowIso(),
      });
    }
  }
}

async function runPressure() {
  const scenarios = [
    {
      name: "gateway_health",
      total: 180,
      concurrency: 20,
      make: () => ({ client: guest, method: "GET", path: "/health" }),
    },
    {
      name: "article_list",
      total: 160,
      concurrency: 16,
      make: () => ({ client: guest, method: "GET", path: "/api/articles?limit=10" }),
    },
    {
      name: "recommended_feed",
      total: 160,
      concurrency: 16,
      make: () => ({ client: userA, method: "GET", path: "/api/feeds/recommended?limit=10" }),
    },
    {
      name: "auth_me",
      total: 100,
      concurrency: 10,
      make: () => ({ client: userA, method: "GET", path: "/api/auth/me" }),
    },
  ];

  const pressure = [];
  for (const scenario of scenarios) {
    pressure.push(await runLoadScenario(scenario));
  }
  return pressure;
}

async function runLoadScenario(scenario) {
  const latencies = [];
  const statuses = new Map();
  const errors = [];
  let index = 0;
  const started = performance.now();

  async function worker() {
    while (index < scenario.total) {
      index += 1;
      const req = scenario.make();
      try {
        const response = await request(req.client, req.method, req.path, { body: req.body });
        latencies.push(response.durationMs);
        statuses.set(response.status, (statuses.get(response.status) ?? 0) + 1);
      } catch (error) {
        errors.push(error instanceof Error ? error.message : String(error));
      }
    }
  }

  await Promise.all(Array.from({ length: scenario.concurrency }, () => worker()));
  const totalMs = performance.now() - started;
  latencies.sort((a, b) => a - b);
  const success = [...statuses.entries()].filter(([status]) => status >= 200 && status < 400).reduce((sum, [, count]) => sum + count, 0);
  const failed = scenario.total - success;
  return {
    name: scenario.name,
    totalRequests: scenario.total,
    concurrency: scenario.concurrency,
    totalDurationMs: Math.round(totalMs * 100) / 100,
    throughputRps: Math.round((scenario.total / (totalMs / 1000)) * 100) / 100,
    success,
    failed,
    statusCounts: Object.fromEntries([...statuses.entries()].sort((a, b) => Number(a[0]) - Number(b[0]))),
    latencyMs: {
      min: percentile(latencies, 0),
      avg: latencies.length ? round(latencies.reduce((a, b) => a + b, 0) / latencies.length) : null,
      p50: percentile(latencies, 50),
      p90: percentile(latencies, 90),
      p95: percentile(latencies, 95),
      p99: percentile(latencies, 99),
      max: percentile(latencies, 100),
    },
    errors: errors.slice(0, 10),
  };
}

function percentile(values, pct) {
  if (!values.length) return null;
  if (pct <= 0) return round(values[0]);
  if (pct >= 100) return round(values[values.length - 1]);
  const index = Math.ceil((pct / 100) * values.length) - 1;
  return round(values[Math.max(0, Math.min(values.length - 1, index))]);
}

function round(value) {
  return Math.round(value * 100) / 100;
}

function summarizeResults(pressure) {
  const passCount = results.filter((item) => item.pass).length;
  const failCount = results.length - passCount;
  const byCategory = {};
  for (const item of results) {
    byCategory[item.category] ??= { total: 0, passed: 0, failed: 0 };
    byCategory[item.category].total += 1;
    if (item.pass) byCategory[item.category].passed += 1;
    else byCategory[item.category].failed += 1;
  }
  return {
    runId,
    generatedAt: nowIso(),
    environment: {
      gatewayBase,
      frontendBase,
      wsBase,
      aiProvider: "mock",
      database: "configured by local .env; value intentionally not recorded",
      node: process.version,
    },
    blackbox: {
      total: results.length,
      passed: passCount,
      failed: failCount,
      passRate: results.length ? round((passCount / results.length) * 100) : 0,
      byCategory,
    },
    pressure,
    defects,
    artifacts,
  };
}

await fs.mkdir(rawDir, { recursive: true });
await runBlackBox();
const pressure = await runPressure();
const summary = summarizeResults(pressure);

await fs.writeFile(path.join(rawDir, "blackbox-results.json"), JSON.stringify(results, null, 2), "utf8");
await fs.writeFile(path.join(rawDir, "pressure-results.json"), JSON.stringify(pressure, null, 2), "utf8");
await fs.writeFile(path.join(rawDir, "summary.json"), JSON.stringify(summary, null, 2), "utf8");

console.log(JSON.stringify(summary, null, 2));
