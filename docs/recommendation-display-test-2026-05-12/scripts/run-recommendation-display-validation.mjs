import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { performance } from "node:perf_hooks";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const mysql = require("../../../api_gateway/node_modules/mysql2/promise");
const bcrypt = require("../../../user_service/node_modules/bcryptjs");

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.resolve(process.argv[2] ?? path.join(scriptDir, ".."));
const rawDir = path.join(outDir, "raw");
const root = path.resolve(scriptDir, "..", "..", "..");
const gatewayBase = process.env.TEST_GATEWAY_BASE ?? "http://127.0.0.1:3001";
const runId = `rdisp_${Date.now().toString(36)}_${crypto.randomBytes(3).toString("hex")}`;
const prefix = `rd_${runId}`;
const password = "RecoDisplayPass123!";

const topics = [
  { key: "data", label: "数据分析", tags: ["数据分析", "AI模型", "后端架构"] },
  { key: "ai", label: "AI模型", tags: ["AI模型", "数据分析", "内容治理"] },
  { key: "backend", label: "后端架构", tags: ["后端架构", "微服务", "数据分析"] },
  { key: "security", label: "安全审计", tags: ["安全审计", "内容治理", "后端架构"] },
  { key: "frontend", label: "前端体验", tags: ["前端体验", "产品设计", "微服务"] },
  { key: "design", label: "产品设计", tags: ["产品设计", "前端体验", "社区运营"] },
  { key: "travel", label: "旅行记录", tags: ["旅行记录", "社区运营", "生活方式"] },
  { key: "food", label: "生活方式", tags: ["生活方式", "社区运营", "旅行记录"] },
  { key: "film", label: "影像评论", tags: ["影像评论", "产品设计", "社区运营"] },
  { key: "gaming", label: "游戏讨论", tags: ["游戏讨论", "社区运营", "前端体验"] },
  { key: "finance", label: "金融观察", tags: ["金融观察", "数据分析", "安全审计"] },
  { key: "fitness", label: "健康习惯", tags: ["健康习惯", "生活方式", "社区运营"] },
];

const viewerConfigs = [
  {
    key: "data_viewer",
    label: "数据型用户",
    preferredTopics: ["data", "ai", "backend"],
    negativeTopics: ["food", "travel", "gaming"],
    expectedTags: ["数据分析", "AI模型", "后端架构"],
  },
  {
    key: "life_viewer",
    label: "生活型用户",
    preferredTopics: ["design", "travel", "food", "film"],
    negativeTopics: ["security", "finance"],
    expectedTags: ["产品设计", "旅行记录", "生活方式", "影像评论"],
  },
  {
    key: "security_viewer",
    label: "安全型用户",
    preferredTopics: ["security", "backend", "finance"],
    negativeTopics: ["gaming", "food"],
    expectedTags: ["安全审计", "后端架构", "金融观察"],
  },
];

const summary = {
  runId,
  prefix,
  gatewayBase,
  startedAt: new Date().toISOString(),
  endedAt: null,
  seed: {},
  validations: [],
  artifacts: {},
};

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
    "x-request-id": `rdisp-${runId}-${crypto.randomUUID()}`,
    "user-agent": "longseason-recommendation-display-validation/2026-05-12",
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
    data = text.slice(0, 500);
  }

  return {
    status: response.status,
    ok: response.ok,
    durationMs: Math.round((performance.now() - started) * 100) / 100,
    requestId: response.headers.get("x-request-id") ?? data?.error?.requestId ?? null,
    body: data,
  };
}

function validate(id, name, pass, detail = {}) {
  summary.validations.push({
    id,
    name,
    pass,
    detail,
    checkedAt: new Date().toISOString(),
  });
}

function readDotEnv(text) {
  const env = {};
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index < 1) continue;
    let value = trimmed.slice(index + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    env[trimmed.slice(0, index).trim()] = value;
  }
  return env;
}

async function connectDatabase() {
  const envText = await fs.readFile(path.join(root, ".env"), "utf8");
  const env = readDotEnv(envText);
  if (!env.DATABASE_URL) throw new Error("DATABASE_URL is missing in .env");
  const url = new URL(env.DATABASE_URL);
  return mysql.createConnection({
    host: url.hostname,
    port: Number(url.port || 3306),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: url.pathname.replace(/^\//, ""),
    multipleStatements: false,
  });
}

async function seedDatabase(connection) {
  const manifest = {
    users: {},
    authors: [],
    articles: [],
    special: {},
    tags: {},
  };
  const passwordHash = await bcrypt.hash(password, 10);
  const now = new Date();
  let usernameIndex = 0;
  let recoEventCount = 0;
  let seenRecordCount = 0;

  await connection.beginTransaction();
  try {
    for (const viewer of viewerConfigs) {
      const user = await insertUser(connection, {
        username: `${prefix}_${viewer.key}`.slice(0, 64),
        email: `${prefix}_${viewer.key}@example.test`,
        passwordHash,
        professionalism: 72,
        friendliness: 78,
      });
      manifest.users[viewer.key] = { ...viewer, ...user };
    }

    const topicAuthors = new Map();
    for (const topic of topics) {
      const authors = [];
      for (const tier of ["high", "mid", "low"]) {
        const quality = tier === "high" ? { professionalism: 94, friendliness: 88 } : tier === "mid" ? { professionalism: 74, friendliness: 72 } : { professionalism: 42, friendliness: 48 };
        const author = await insertUser(connection, {
          username: `${prefix}_author_${topic.key}_${tier}_${usernameIndex++}`.slice(0, 64),
          email: `${prefix}_author_${topic.key}_${tier}_${usernameIndex}@example.test`,
          passwordHash,
          ...quality,
        });
        authors.push({ ...author, topic: topic.key, tier });
        manifest.authors.push({ ...author, topic: topic.key, tier });
      }
      topicAuthors.set(topic.key, authors);
    }

    for (const tag of new Set(topics.flatMap((topic) => topic.tags))) {
      manifest.tags[tag] = await ensureTag(connection, "article_ai_tag", tag);
      await ensureTag(connection, "article_tag", tag);
    }
    const displayProbeTag = `${prefix}_display_low_priority`;
    manifest.special.displayProbeTag = displayProbeTag;
    manifest.tags[displayProbeTag] = await ensureTag(connection, "article_ai_tag", displayProbeTag);
    await ensureTag(connection, "article_tag", displayProbeTag);

    let articleCounter = 0;
    for (let round = 0; round < 8; round += 1) {
      for (const topic of topics) {
        for (const author of topicAuthors.get(topic.key)) {
          const status = round <= 5 ? "PUBLISHED" : round === 6 ? "LOW_PRIORITY" : privateStatusFor(topic.key, author.tier);
          const article = await insertScenarioArticle(connection, {
            topic,
            author,
            status,
            index: round,
            posttime: new Date(now.getTime() - articleCounter * 60_000),
          }, manifest.tags);
          manifest.articles.push(article);
          articleCounter += 1;
        }
      }
    }

    const dataHighAuthor = topicAuthors.get("data").find((author) => author.tier === "high");
    const seenPair = [];
    for (const kind of ["seen_penalty", "unseen_control"]) {
      const article = await insertScenarioArticle(connection, {
        topic: topics.find((topic) => topic.key === "data"),
        author: dataHighAuthor,
        status: "PUBLISHED",
        index: kind,
        posttime: new Date(now.getTime() - (kind === "seen_penalty" ? 5_000 : 10_000)),
        titleHint: kind === "seen_penalty" ? "高频已看对照样本" : "未看对照样本",
      }, manifest.tags);
      seenPair.push(article);
      manifest.articles.push(article);
      articleCounter += 1;
    }
    manifest.special.seenPenaltyArticleId = seenPair[0].id;
    manifest.special.unseenControlArticleId = seenPair[1].id;

    const displayProbeArticle = await insertScenarioArticle(connection, {
      topic: topics.find((topic) => topic.key === "design"),
      author: topicAuthors.get("design").find((author) => author.tier === "high"),
      status: "LOW_PRIORITY",
      index: "display_probe",
      posttime: new Date(now.getTime() - 15_000),
      tags: [displayProbeTag],
      titleHint: "低优先级展示流验证样本",
    }, manifest.tags);
    manifest.special.displayProbeArticleId = displayProbeArticle.id;
    manifest.articles.push(displayProbeArticle);

    await insertDailyStats(connection, manifest.articles);
    recoEventCount = await insertRecoEvents(connection, manifest);
    seenRecordCount = await insertSeenRecords(connection, manifest);

    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  }

  summary.seed = {
    viewers: Object.keys(manifest.users).length,
    authors: manifest.authors.length,
    articles: manifest.articles.length,
    publicArticles: manifest.articles.filter((article) => ["PUBLISHED", "LOW_PRIORITY"].includes(article.status)).length,
    lowPriorityArticles: manifest.articles.filter((article) => article.status === "LOW_PRIORITY").length,
    privateArticles: manifest.articles.filter((article) => !["PUBLISHED", "LOW_PRIORITY"].includes(article.status)).length,
    recoEvents: recoEventCount,
    seenRecords: seenRecordCount,
  };
  summary.artifacts.manifest = {
    viewerIds: Object.fromEntries(Object.entries(manifest.users).map(([key, value]) => [key, value.id])),
    seenPenaltyArticleId: manifest.special.seenPenaltyArticleId,
    unseenControlArticleId: manifest.special.unseenControlArticleId,
    displayProbeArticleId: manifest.special.displayProbeArticleId,
    displayProbeTag: manifest.special.displayProbeTag,
  };
  return manifest;
}

async function insertUser(connection, input) {
  const [result] = await connection.execute(
    `INSERT INTO user (username, email, password, avatar, role, professionalism, friendliness, createdAt, updatedAt, bio)
     VALUES (?, ?, ?, NULL, 'user', ?, ?, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3), ?)`,
    [input.username, input.email, input.passwordHash, input.professionalism, input.friendliness, `推荐展示验证批次 ${runId}`],
  );
  return { id: result.insertId, username: input.username, email: input.email };
}

async function ensureTag(connection, table, name) {
  await connection.execute(`INSERT INTO ${table} (name) VALUES (?) ON DUPLICATE KEY UPDATE name = VALUES(name)`, [name]);
  const [rows] = await connection.execute(`SELECT id FROM ${table} WHERE name = ?`, [name]);
  return rows[0].id;
}

async function insertScenarioArticle(connection, input, tagIds) {
  const { topic, author, status, index, posttime } = input;
  const articleTags = input.tags ?? topic.tags;
  const scores = scoresFor(status, author.tier, topic.key);
  const decision = decisionForStatus(status);
  const content = [
    `[batch:${runId}]`,
    `[topic:${topic.key}]`,
    input.titleHint ?? `${topic.label} 推荐验证样本 ${index}`,
    `作者层级=${author.tier}，文章状态=${status}。`,
    `这段内容用于验证用户画像、AI 标签、作者评分、风险状态和展示过滤之间的关系。`,
  ].join(" ");

  const [articleResult] = await connection.execute(
    `INSERT INTO article (content, tag, status, reviewDecision, riskLevel, reviewReason, reviewSuggestion, reviewedAt, posttime, authorId)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      content,
      topic.label,
      status,
      decision,
      riskLevelFor(scores.legalityScore),
      `测试批次 ${runId} 的 ${topic.label} 样本`,
      status === "LOW_PRIORITY" ? "内容可以公开，但推荐排序应受到风险惩罚。" : "用于推荐与展示验证。",
      status === "PENDING_REVIEW" ? null : posttime,
      posttime,
      author.id,
    ],
  );
  const articleId = articleResult.insertId;

  if (status !== "PENDING_REVIEW") {
    await connection.execute(
      `INSERT INTO article_ai_analysis (articleId, friendlinessScore, rationalityScore, legalityScore, professionalismScore, analyzedAt)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [articleId, scores.friendlinessScore, scores.rationalityScore, scores.legalityScore, scores.professionalismScore, posttime],
    );
  }

  for (const [tagIndex, tag] of articleTags.entries()) {
    await connection.execute(
      `INSERT INTO article_ai_tag_on_article (articleId, tagId, confidence, weight, createdAt)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE confidence = VALUES(confidence), weight = VALUES(weight)`,
      [articleId, tagIds[tag], 0.92 - tagIndex * 0.08, 1 - tagIndex * 0.12, posttime],
    );
    await connection.execute(
      `INSERT INTO article_tag_on_article (articleId, tagId, weight, createdAt)
       VALUES (?, (SELECT id FROM article_tag WHERE name = ?), ?, ?)
       ON DUPLICATE KEY UPDATE weight = VALUES(weight)`,
      [articleId, tag, tagIndex === 0 ? 1 : 0.75, posttime],
    );
  }

  return {
    id: articleId,
    topic: topic.key,
    primaryTag: topic.label,
    tags: articleTags,
    authorId: author.id,
    authorTier: author.tier,
    status,
    legalityScore: scores.legalityScore,
    posttime: posttime.toISOString(),
  };
}

function scoresFor(status, authorTier, topicKey) {
  const base = authorTier === "high" ? 88 : authorTier === "mid" ? 74 : 56;
  const topicBoost = ["data", "ai", "backend", "security", "finance"].includes(topicKey) ? 4 : 0;
  if (status === "LOW_PRIORITY") {
    return {
      friendlinessScore: Math.max(55, base - 10),
      rationalityScore: Math.max(55, base - 8),
      legalityScore: 65,
      professionalismScore: Math.max(55, base + topicBoost - 6),
    };
  }
  if (status === "REJECTED") {
    return { friendlinessScore: 38, rationalityScore: 42, legalityScore: 28, professionalismScore: 40 };
  }
  if (status === "REVIEW_REQUIRED") {
    return { friendlinessScore: 58, rationalityScore: 55, legalityScore: 45, professionalismScore: 54 };
  }
  return {
    friendlinessScore: Math.min(98, base + 2),
    rationalityScore: Math.min(98, base + 3),
    legalityScore: Math.min(98, base + 6),
    professionalismScore: Math.min(98, base + topicBoost + 4),
  };
}

function decisionForStatus(status) {
  if (status === "PUBLISHED") return "ALLOW";
  if (status === "LOW_PRIORITY") return "LOW_PRIORITY";
  if (status === "REJECTED") return "REJECT";
  if (status === "PENDING_REVIEW") return "PENDING";
  return "REVIEW";
}

function riskLevelFor(legalityScore) {
  if (legalityScore >= 80) return "LOW";
  if (legalityScore >= 60) return "MEDIUM";
  if (legalityScore >= 40) return "HIGH";
  return "BLOCK";
}

function privateStatusFor(topicKey, tier) {
  if (tier === "low") return "REJECTED";
  if (["security", "finance", "gaming"].includes(topicKey)) return "REVIEW_REQUIRED";
  return "PENDING_REVIEW";
}

async function insertDailyStats(connection, articles) {
  const statDate = new Date();
  statDate.setUTCHours(0, 0, 0, 0);
  const rows = articles.filter((article) => ["PUBLISHED", "LOW_PRIORITY"].includes(article.status)).map((article) => {
    const tierFactor = article.authorTier === "high" ? 1.6 : article.authorTier === "mid" ? 1.0 : 0.45;
    const riskFactor = article.status === "LOW_PRIORITY" ? 0.5 : 1;
    const impressions = Math.round(80 * tierFactor);
    const clicks = Math.round(20 * tierFactor * riskFactor);
    const completeReads = Math.round(12 * tierFactor * riskFactor);
    const likes = Math.round(10 * tierFactor * riskFactor);
    const comments = Math.round(4 * tierFactor * riskFactor);
    const favorites = Math.round(5 * tierFactor * riskFactor);
    const hides = article.status === "LOW_PRIORITY" ? 4 : article.authorTier === "low" ? 2 : 0;
    const reports = article.status === "LOW_PRIORITY" ? 1 : 0;
    const qualityScore = clicks * 0.2 + completeReads * 1.2 + likes * 1.5 + comments * 2 + favorites * 2.5 - hides * 2 - reports * 5;
    return [article.id, statDate, impressions, clicks, BigInt(completeReads * 28000), completeReads, likes, comments, favorites, 0, hides, reports, qualityScore];
  });

  for (const chunk of chunked(rows, 200)) {
    await connection.query(
      `INSERT INTO reco_article_daily_stat
       (articleId, statDate, impressions, clicks, dwellMsSum, completeReads, likes, comments, favorites, follows, hides, reports, qualityScore, updatedAt, createdAt)
       VALUES ${chunk.map(() => "(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3))").join(",")}`,
      chunk.flat(),
    );
  }
}

async function insertRecoEvents(connection, manifest) {
  const events = [];
  const now = Date.now();
  let offset = 0;
  for (const viewer of viewerConfigs) {
    const user = manifest.users[viewer.key];
    const preferred = manifest.articles
      .filter((article) => ["PUBLISHED", "LOW_PRIORITY"].includes(article.status) && viewer.preferredTopics.includes(article.topic))
      .slice(0, 90);
    const negative = manifest.articles
      .filter((article) => article.status === "PUBLISHED" && viewer.negativeTopics.includes(article.topic))
      .slice(0, 24);

    for (const article of preferred) {
      for (const type of ["CLICK", "DWELL", "READ_COMPLETE", "LIKE"]) {
        events.push(eventRow(user.id, article.id, type, type === "DWELL" ? 42000 : null, `seed-${runId}-${offset}`, new Date(now - offset * 1000)));
        offset += 1;
      }
      if (article.authorTier === "high") {
        events.push(eventRow(user.id, article.id, "FAVORITE", null, `seed-${runId}-${offset}`, new Date(now - offset * 1000)));
        offset += 1;
      }
    }

    for (const article of negative) {
      events.push(eventRow(user.id, article.id, "HIDE", null, `seed-${runId}-${offset}`, new Date(now - offset * 1000)));
      offset += 1;
      if (article.authorTier === "low") {
        events.push(eventRow(user.id, article.id, "REPORT", null, `seed-${runId}-${offset}`, new Date(now - offset * 1000)));
        offset += 1;
      }
    }
  }

  for (const chunk of chunked(events, 500)) {
    await connection.query(
      `INSERT INTO reco_event (userId, articleId, eventType, dwellMs, position, scene, requestId, sessionId, createdAt)
       VALUES ${chunk.map(() => "(?, ?, ?, ?, ?, ?, ?, ?, ?)").join(",")}`,
      chunk.flat(),
    );
  }
  return events.length;
}

function eventRow(userId, articleId, eventType, dwellMs, requestId, createdAt) {
  return [userId, articleId, eventType, dwellMs, null, "seed_profile", requestId, runId, createdAt];
}

async function insertSeenRecords(connection, manifest) {
  const viewer = manifest.users.data_viewer;
  const seenId = manifest.special.seenPenaltyArticleId;
  await connection.execute(
    `INSERT INTO reco_user_seen (userId, articleId, seenCount, lastSeenAt, createdAt)
     VALUES (?, ?, 9, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3))
     ON DUPLICATE KEY UPDATE seenCount = VALUES(seenCount), lastSeenAt = CURRENT_TIMESTAMP(3)`,
    [viewer.id, seenId],
  );
  return 1;
}

function chunked(items, size) {
  const chunks = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

async function waitForGateway() {
  const deadline = Date.now() + 45_000;
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

async function runApiValidation(manifest) {
  await waitForGateway();
  const clients = {};
  const recommendationByViewer = {};
  const profileByViewer = {};

  for (const viewer of viewerConfigs) {
    const client = new Client(viewer.key);
    clients[viewer.key] = client;
    const login = await request(client, "POST", "/api/auth/login", {
      identifier: manifest.users[viewer.key].email,
      password,
    });
    validate(`LOGIN-${viewer.key}`, `${viewer.label} can login`, login.status === 200, { status: login.status, userId: login.body?.user?.id });

    const refresh = await request(client, "POST", "/api/reco/profile/me/refresh", {});
    const profile = refresh.body?.profile;
    profileByViewer[viewer.key] = profile;
    const topTags = topKeys(profile?.tagVector?.tags ?? {}, 8);
    validate(`PROFILE-${viewer.key}`, `${viewer.label} profile contains expected tags`, viewer.expectedTags.slice(0, 2).every((tag) => topTags.includes(tag)), {
      status: refresh.status,
      topTags,
      updatedFromEvents: profile?.tagVector?.updatedFromEvents,
    });

    const rec = await request(client, "GET", "/api/feeds/recommended?limit=30");
    recommendationByViewer[viewer.key] = rec.body?.items ?? [];
    const metrics = recommendationMetrics(recommendationByViewer[viewer.key], viewer, manifest);
    validate(`RECO-${viewer.key}`, `${viewer.label} recommendation is personalized`, rec.status === 200 && metrics.batchCount >= 20 && metrics.preferredRatio >= 0.55, {
      status: rec.status,
      ...metrics,
    });
  }

  validateDivergence(recommendationByViewer, manifest);
  await validateDisplayFlow(manifest);
  validateSeenPenalty(recommendationByViewer.data_viewer, manifest);
  await validateRecommendedPressure(clients.data_viewer);

  summary.artifacts.profiles = Object.fromEntries(
    Object.entries(profileByViewer).map(([key, profile]) => [
      key,
      {
        topTags: topKeys(profile?.tagVector?.tags ?? {}, 10),
        updatedFromEvents: profile?.tagVector?.updatedFromEvents,
      },
    ]),
  );
  summary.artifacts.recommendations = Object.fromEntries(
    Object.entries(recommendationByViewer).map(([key, items]) => [
      key,
      items.slice(0, 10).map((item) => summarizeRecommendedItem(item, manifest)),
    ]),
  );
}

function topKeys(record, limit) {
  return Object.entries(record)
    .sort((a, b) => Math.abs(Number(b[1])) - Math.abs(Number(a[1])))
    .slice(0, limit)
    .map(([key]) => key);
}

function recommendationMetrics(items, viewer, manifest) {
  const idMap = new Map(manifest.articles.map((article) => [article.id, article]));
  const batchItems = items.map((item, index) => ({ item, index, meta: idMap.get(item.id) })).filter((entry) => entry.meta);
  const top20 = batchItems.slice(0, 20);
  const preferred = top20.filter((entry) => viewer.preferredTopics.includes(entry.meta.topic));
  const highAuthor = top20.filter((entry) => entry.meta.authorTier === "high");
  const privateItems = batchItems.filter((entry) => !["PUBLISHED", "LOW_PRIORITY"].includes(entry.meta.status));
  const lowPriority = top20.filter((entry) => entry.meta.status === "LOW_PRIORITY");
  return {
    batchCount: batchItems.length,
    preferredCount: preferred.length,
    preferredRatio: top20.length ? Math.round((preferred.length / top20.length) * 100) / 100 : 0,
    highAuthorCount: highAuthor.length,
    lowPriorityInTop20: lowPriority.length,
    privateCount: privateItems.length,
    topTopics: countBy(top20.map((entry) => entry.meta.topic)),
    topItems: top20.slice(0, 5).map((entry) => summarizeRecommendedItem(entry.item, manifest)),
  };
}

function summarizeRecommendedItem(item, manifest) {
  const meta = manifest.articles.find((article) => article.id === item.id);
  return {
    id: item.id,
    topic: meta?.topic,
    status: meta?.status,
    authorTier: meta?.authorTier,
    total: item.recommendation?.total,
    tagMatch: item.recommendation?.tagMatch,
    authorQuality: item.recommendation?.authorQuality,
    riskPenalty: item.recommendation?.riskPenalty,
    seenPenalty: item.recommendation?.seenPenalty,
    tags: item.aiTags?.map((tag) => tag.name).slice(0, 3),
  };
}

function countBy(values) {
  const output = {};
  for (const value of values) output[value] = (output[value] ?? 0) + 1;
  return output;
}

function validateDivergence(recommendationByViewer, manifest) {
  const dataTopics = topTopics(recommendationByViewer.data_viewer, manifest, 20);
  const lifeTopics = topTopics(recommendationByViewer.life_viewer, manifest, 20);
  const securityTopics = topTopics(recommendationByViewer.security_viewer, manifest, 20);
  const dataLifeOverlap = jaccard(dataTopics, lifeTopics);
  const dataSecurityOverlap = jaccard(dataTopics, securityTopics);
  validate("RECO-DIVERGENCE", "different profiles produce different recommendation topic sets", dataLifeOverlap <= 0.55 && dataSecurityOverlap <= 0.65, {
    dataTopics,
    lifeTopics,
    securityTopics,
    dataLifeOverlap,
    dataSecurityOverlap,
  });
}

function topTopics(items, manifest, limit) {
  const idMap = new Map(manifest.articles.map((article) => [article.id, article]));
  return [...new Set(items.slice(0, limit).map((item) => idMap.get(item.id)?.topic).filter(Boolean))];
}

function jaccard(a, b) {
  const aSet = new Set(a);
  const bSet = new Set(b);
  const intersection = [...aSet].filter((item) => bSet.has(item)).length;
  const union = new Set([...aSet, ...bSet]).size;
  return union ? Math.round((intersection / union) * 100) / 100 : 0;
}

async function validateDisplayFlow(manifest) {
  const response = await request(new Client("guest"), "GET", "/api/articles?limit=50");
  const taggedResponse = await request(new Client("guest"), "GET", `/api/articles?limit=50&tag=${encodeURIComponent(manifest.special.displayProbeTag)}`);
  const idMap = new Map(manifest.articles.map((article) => [article.id, article]));
  const batchItems = (response.body?.items ?? []).map((item) => ({ item, meta: idMap.get(item.id) })).filter((entry) => entry.meta);
  const taggedBatchItems = (taggedResponse.body?.items ?? []).map((item) => ({ item, meta: idMap.get(item.id) })).filter((entry) => entry.meta);
  const privateItems = batchItems.filter((entry) => !["PUBLISHED", "LOW_PRIORITY"].includes(entry.meta.status));
  const taggedPrivateItems = taggedBatchItems.filter((entry) => !["PUBLISHED", "LOW_PRIORITY"].includes(entry.meta.status));
  const lowPriorityProbe = taggedBatchItems.find((entry) => entry.meta.id === manifest.special.displayProbeArticleId);
  validate("DISPLAY-PUBLIC-FILTER", "public article display only returns public batch statuses", response.status === 200 && taggedResponse.status === 200 && batchItems.length >= 30 && privateItems.length === 0 && taggedPrivateItems.length === 0 && lowPriorityProbe?.meta.status === "LOW_PRIORITY", {
    status: response.status,
    taggedStatus: taggedResponse.status,
    batchItems: batchItems.length,
    taggedBatchItems: taggedBatchItems.length,
    lowPriorityProbeFound: Boolean(lowPriorityProbe),
    lowPriorityProbeArticleId: manifest.special.displayProbeArticleId,
    displayProbeTag: manifest.special.displayProbeTag,
    privateItems: privateItems.map((entry) => ({ id: entry.item.id, status: entry.meta.status })),
    taggedPrivateItems: taggedPrivateItems.map((entry) => ({ id: entry.item.id, status: entry.meta.status })),
  });
}

function validateSeenPenalty(items, manifest) {
  const seenId = manifest.special.seenPenaltyArticleId;
  const unseenId = manifest.special.unseenControlArticleId;
  const seenIndex = items.findIndex((item) => item.id === seenId);
  const unseenIndex = items.findIndex((item) => item.id === unseenId);
  validate("RECO-SEEN-PENALTY", "seen penalty lowers an otherwise comparable article", unseenIndex !== -1 && (seenIndex === -1 || unseenIndex < seenIndex), {
    seenPenaltyArticleId: seenId,
    unseenControlArticleId: unseenId,
    seenIndex,
    unseenIndex,
    seenItem: seenIndex >= 0 ? summarizeRecommendedItem(items[seenIndex], manifest) : null,
    unseenItem: unseenIndex >= 0 ? summarizeRecommendedItem(items[unseenIndex], manifest) : null,
  });
}

async function validateRecommendedPressure(client) {
  const total = 80;
  const concurrency = 10;
  let cursor = 0;
  const statuses = new Map();
  const durations = [];

  async function worker() {
    while (cursor < total) {
      cursor += 1;
      const response = await request(client, "GET", "/api/feeds/recommended?limit=20");
      statuses.set(response.status, (statuses.get(response.status) ?? 0) + 1);
      durations.push(response.durationMs);
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  durations.sort((a, b) => a - b);
  const success = statuses.get(200) ?? 0;
  validate("RECO-PRESSURE-LARGE-DATA", "recommended feed remains stable with generated large dataset", success === total, {
    total,
    concurrency,
    statuses: Object.fromEntries(statuses),
    p95Ms: percentile(durations, 95),
    maxMs: percentile(durations, 100),
  });
}

function percentile(values, pct) {
  if (!values.length) return null;
  if (pct <= 0) return values[0];
  if (pct >= 100) return values[values.length - 1];
  const index = Math.ceil((pct / 100) * values.length) - 1;
  return Math.round(values[Math.max(0, Math.min(values.length - 1, index))] * 100) / 100;
}

async function writeOutputs() {
  summary.endedAt = new Date().toISOString();
  summary.passed = summary.validations.filter((item) => item.pass).length;
  summary.failed = summary.validations.filter((item) => !item.pass).length;

  await fs.mkdir(rawDir, { recursive: true });
  await fs.writeFile(path.join(rawDir, "recommendation-display-results.json"), JSON.stringify(summary, null, 2), "utf8");
  await fs.writeFile(path.join(outDir, "recommendation-display-validation-report.md"), buildReport(), "utf8");
}

function buildReport() {
  const failed = summary.validations.filter((item) => !item.pass);
  const lines = [
    "# 推荐流与展示流大规模数据验证报告",
    "",
    `执行日期：2026-05-12`,
    `测试批次：\`${runId}\``,
    `测试入口：\`${gatewayBase}\``,
    "",
    "## 1. 测试目标",
    "",
    "本次测试通过直接写入一批带有明确兴趣标签、作者质量、AI 评分、审核状态和推荐事件的数据，验证当前用户画像、AI 评分、推荐排序和公开展示过滤是否能够形成预期效果。",
    "",
    "## 2. 数据规模",
    "",
    `- 画像用户：${summary.seed.viewers}`,
    `- 作者用户：${summary.seed.authors}`,
    `- 文章总数：${summary.seed.articles}`,
    `- 公开或低优先级文章：${summary.seed.publicArticles}`,
    `- 低优先级文章：${summary.seed.lowPriorityArticles}`,
    `- 非公开文章：${summary.seed.privateArticles}`,
    `- 推荐事件：${summary.seed.recoEvents}`,
    `- 已看记录：${summary.seed.seenRecords}`,
    "",
    "## 3. 验证结果",
    "",
    "| 用例 | 结果 | 说明 |",
    "| --- | --- | --- |",
    ...summary.validations.map((item) => `| ${item.id} | ${item.pass ? "通过" : "未通过"} | ${item.name} |`),
    "",
    "## 4. 画像与推荐观察",
    "",
    "### 4.1 用户画像 Top 标签",
    "",
    "```json",
    JSON.stringify(summary.artifacts.profiles, null, 2),
    "```",
    "",
    "### 4.2 推荐 Top10 样本",
    "",
    "```json",
    JSON.stringify(summary.artifacts.recommendations, null, 2),
    "```",
    "",
    "## 5. 结论",
    "",
    failed.length === 0
      ? "本批次验证全部通过。结果表明，在当前数据规模下，用户画像能够被历史推荐事件拉动，推荐流会根据画像标签、作者质量、AI 评分、风险惩罚和已看记录改变排序，公开展示流能够过滤非公开状态内容。"
      : `本批次存在 ${failed.length} 个未通过项，需要继续查看 raw/recommendation-display-results.json 中的 detail 字段。`,
    "",
    "## 6. 原始文件",
    "",
    "- `raw/recommendation-display-results.json`：完整原始结果、画像摘要、推荐样本和每个验证项细节。",
    "- `scripts/run-recommendation-display-validation.mjs`：数据生成与验证脚本。",
    "",
  ];
  return `${lines.join("\n")}\n`;
}

await fs.mkdir(rawDir, { recursive: true });
let connection;
try {
  connection = await connectDatabase();
  const manifest = await seedDatabase(connection);
  await fs.writeFile(path.join(rawDir, "seed-manifest.json"), JSON.stringify({
    runId,
    prefix,
    users: manifest.users,
    authors: manifest.authors,
    articleCount: manifest.articles.length,
    special: manifest.special,
  }, null, 2), "utf8");
  await runApiValidation(manifest);
} catch (error) {
  summary.error = error instanceof Error ? { message: error.message, stack: error.stack } : { message: String(error) };
  validate("RUNNER", "script completed without uncaught error", false, summary.error);
} finally {
  if (connection) await connection.end();
  await writeOutputs();
}

console.log(JSON.stringify({
  runId: summary.runId,
  passed: summary.passed,
  failed: summary.failed,
  report: path.join(outDir, "recommendation-display-validation-report.md"),
}, null, 2));

if (summary.failed > 0) {
  process.exitCode = 1;
}
