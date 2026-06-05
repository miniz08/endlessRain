import type { AiProvider, AnalysisResult, ScoreSet } from "./types.js";
import { normalizeTags } from "../services/tagMapping.js";
import { decisionFromScores, normalizeScores, riskLevelFromScores } from "../services/scorePolicy.js";
import { HttpError } from "../utils/validation.js";

type ChatMessage = {
  role: "system" | "user";
  content: string;
};

type ProviderTargetConfig = {
  id?: string;
  baseUrl?: string;
  chatPath?: string;
  apiKey?: string;
  apiKeyEnv?: string;
  model?: string;
  models?: string[];
  timeoutMs?: number;
  retryCount?: number;
  jsonMode?: boolean;
  fallbackWithoutResponseFormat?: boolean;
  headers?: Record<string, string>;
};

type ProviderTarget = {
  id: string;
  baseUrl: string;
  chatPath: string;
  apiKey: string;
  models: string[];
  timeoutMs: number;
  retryCount: number;
  jsonMode: boolean;
  fallbackWithoutResponseFormat: boolean;
  headers: Record<string, string>;
};

type ProviderCandidate = {
  target: ProviderTarget;
  model: string;
};

let globalCursor = 0;

export class OpenAiCompatibleProvider implements AiProvider {
  id = "openai-compatible";
  model: string;
  private targets: ProviderTarget[];

  constructor() {
    this.targets = loadProviderTargets();
    this.model = this.targets.flatMap((target) => target.models)[0] ?? process.env.AI_MODEL ?? "Qwen/Qwen2-7B-Instruct";
  }

  async analyze({ content, taxonomy }: { content: string; taxonomy: string }): Promise<AnalysisResult> {
    const candidates = this.targets.flatMap((target) => target.models.map((model) => ({ target, model })));
    if (candidates.length === 0) {
      throw new HttpError(500, "No OpenAI-compatible provider target is configured", "AI_PROVIDER_NOT_CONFIGURED");
    }

    const messages = this.buildMessages(content, taxonomy);
    const start = globalCursor % candidates.length;
    globalCursor = (globalCursor + 1) % candidates.length;
    const errors: string[] = [];

    for (let offset = 0; offset < candidates.length; offset += 1) {
      const candidate = candidates[(start + offset) % candidates.length];
      try {
        const response = await this.requestWithRetry(candidate, messages);
        const messageContent = response?.choices?.[0]?.message?.content;
        if (typeof messageContent !== "string") {
          throw new HttpError(502, "AI response has no message content", "AI_RESPONSE_INVALID");
        }

        const parsed = parseJsonObject(messageContent);
        const scores = normalizeScores(parsed as Partial<Record<keyof ScoreSet, unknown>>);

        return {
          scores,
          riskLevel: riskLevelFromScores(scores),
          decision: decisionFromScores(scores),
          tags: normalizeTags((parsed as Record<string, unknown>).tags),
          reason: readString(parsed, "reason", "模型已完成内容分析。"),
          suggestion: readString(parsed, "suggestion", "请按风险等级执行展示策略。"),
          provider: `${this.id}:${candidate.target.id}`,
          model: candidate.model,
          raw: response,
        };
      } catch (error) {
        errors.push(`${candidate.target.id}/${candidate.model}: ${readErrorMessage(error)}`);
      }
    }

    throw new HttpError(502, `All OpenAI-compatible provider targets failed: ${errors.join(" | ")}`, "AI_PROVIDER_ERROR");
  }

  private buildMessages(content: string, taxonomy: string): ChatMessage[] {
    return [
      {
        role: "system",
        content:
          "你是社交平台内容质量与安全审核器。必须只输出一个 JSON 对象，不要输出 Markdown 或解释性前后缀。四项评分必须是 0-100 的整数，100 表示质量最好或风险最低。其中 legalityScore 同时表示内容合规安全程度以及疑似 AI 生成、模板化或低原创风险，分数越高表示越合规且越不像机器批量生成内容。tags 必须从给定标签库中选择，不要创造新标签。",
      },
      {
        role: "user",
        content: JSON.stringify({
          task: "分析社交平台文章内容，返回四维评分、标签、简短理由和处理建议，并在 legalityScore 中综合判断合规风险与疑似 AI 生成/低原创风险。",
          scoringRules: [
            "friendlinessScore 表示友善程度，正常礼貌内容应较高。",
            "rationalityScore 表示表达是否清晰、有逻辑、有事实依据。",
            "legalityScore 表示合规安全与内容真实性/原创性风险的综合分，分数越高表示违法违规风险越低，且越不像 AI 批量生成或低原创内容。",
            "降低 legalityScore 的原因包括：违法违规、攻击辱骂、垃圾广告、虚假信息、明显模板化、泛泛而谈、缺少具体经验或高度疑似 AI 生成。",
            "不要仅因为文字流畅、格式规范或表达礼貌就判定为 AI 生成；只有存在明显机器生成、批量生成或低原创痕迹时才降低 legalityScore。",
            "如果 legalityScore 因疑似 AI 生成或低原创而降低，请在 reason 或 suggestion 中简要说明。",
            "professionalismScore 表示内容完整度、专业性和表达质量。",
            "普通体验反馈、产品建议、日常记录通常不应被判为高风险。",
          ],
          schema: {
            friendlinessScore: "0-100 integer",
            rationalityScore: "0-100 integer",
            legalityScore: "0-100 integer，合规安全与疑似 AI 生成/低原创风险综合分",
            professionalismScore: "0-100 integer",
            tags: [{ name: "标签库中的标签名", confidence: "0-1 number", weight: "0-1 number" }],
            reason: "简短中文理由",
            suggestion: "简短中文建议",
          },
          taxonomy: JSON.parse(taxonomy),
          content,
        }),
      },
    ];
  }

  private async requestWithRetry(candidate: ProviderCandidate, messages: ChatMessage[]): Promise<any> {
    let lastError: unknown;
    for (let attempt = 0; attempt <= candidate.target.retryCount; attempt += 1) {
      try {
        return await this.request(candidate, messages, candidate.target.jsonMode);
      } catch (error) {
        lastError = error;
        if (shouldRetryWithoutJsonMode(error) && candidate.target.jsonMode && candidate.target.fallbackWithoutResponseFormat) {
          return this.request(candidate, messages, false);
        }
        if (attempt < candidate.target.retryCount) {
          await new Promise((resolve) => setTimeout(resolve, 400 * (attempt + 1)));
        }
      }
    }
    throw lastError;
  }

  private async request(candidate: ProviderCandidate, messages: ChatMessage[], jsonMode: boolean): Promise<any> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), candidate.target.timeoutMs);

    try {
      const response = await fetch(`${candidate.target.baseUrl}${candidate.target.chatPath}`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${candidate.target.apiKey}`,
          ...candidate.target.headers,
        },
        body: JSON.stringify({
          model: candidate.model,
          messages,
          temperature: 0.2,
          ...(jsonMode ? { response_format: { type: "json_object" } } : {}),
        }),
        signal: controller.signal,
      });

      const body = await response.text();
      if (!response.ok) {
        const statusCode = response.status === 400 ? 400 : 502;
        throw new HttpError(statusCode, `AI provider returned ${response.status}: ${body.slice(0, 300)}`, "AI_PROVIDER_ERROR");
      }

      return JSON.parse(body);
    } finally {
      clearTimeout(timeout);
    }
  }
}

function loadProviderTargets(): ProviderTarget[] {
  const configured = parseTargetsJson(process.env.AI_PROVIDER_TARGETS);
  const rawTargets =
    configured.length > 0
      ? configured
      : [
          {
            id: process.env.AI_PROVIDER_TARGET_ID ?? "default",
            baseUrl: process.env.AI_BASE_URL ?? "https://api.siliconflow.cn/v1",
            chatPath: process.env.AI_CHAT_PATH ?? "/chat/completions",
            apiKey: process.env.AI_API_KEY,
            model: process.env.AI_MODEL ?? "Qwen/Qwen2-7B-Instruct",
            timeoutMs: Number(process.env.AI_TIMEOUT_MS ?? 20000),
            retryCount: Number(process.env.AI_RETRY_COUNT ?? 1),
          },
        ];

  const targets: ProviderTarget[] = [];
  for (const raw of rawTargets) {
    const id = nonEmptyString(raw.id) ?? "openai-compatible";
    const apiKey = resolveApiKey(raw);
    if (!apiKey) {
      console.warn(`[ai_service] skipping AI provider target ${id}: missing apiKey/apiKeyEnv`);
      continue;
    }

    const models = normalizeModels(raw.models ?? raw.model);
    if (models.length === 0) {
      console.warn(`[ai_service] skipping AI provider target ${id}: missing model/models`);
      continue;
    }

    targets.push({
      id,
      baseUrl: (nonEmptyString(raw.baseUrl) ?? "https://api.siliconflow.cn/v1").replace(/\/$/, ""),
      chatPath: normalizeChatPath(raw.chatPath),
      apiKey,
      models,
      timeoutMs: positiveNumber(raw.timeoutMs, Number(process.env.AI_TIMEOUT_MS ?? 20000)),
      retryCount: Math.max(0, Math.floor(positiveNumber(raw.retryCount, Number(process.env.AI_RETRY_COUNT ?? 1)))),
      jsonMode: raw.jsonMode !== false,
      fallbackWithoutResponseFormat: raw.fallbackWithoutResponseFormat !== false,
      headers: raw.headers && typeof raw.headers === "object" ? raw.headers : {},
    });
  }

  return targets;
}

function parseTargetsJson(value: string | undefined): ProviderTargetConfig[] {
  if (!value?.trim()) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) {
      throw new Error("AI_PROVIDER_TARGETS must be a JSON array");
    }
    return parsed.filter((item): item is ProviderTargetConfig => Boolean(item) && typeof item === "object");
  } catch (error) {
    console.warn(`[ai_service] failed to parse AI_PROVIDER_TARGETS: ${readErrorMessage(error)}`);
    return [];
  }
}

function resolveApiKey(raw: ProviderTargetConfig): string {
  const direct = nonEmptyString(raw.apiKey);
  if (direct) return direct;
  const envName = nonEmptyString(raw.apiKeyEnv);
  if (envName) return process.env[envName] ?? "";
  return "";
}

function normalizeModels(value: unknown): string[] {
  const values = Array.isArray(value) ? value : typeof value === "string" ? value.split(",") : [];
  return values.map((item) => String(item).trim()).filter(Boolean);
}

function normalizeChatPath(value: unknown): string {
  const path = nonEmptyString(value) ?? "/chat/completions";
  return path.startsWith("/") ? path : `/${path}`;
}

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function positiveNumber(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseJsonObject(content: string): Record<string, unknown> {
  try {
    return JSON.parse(content) as Record<string, unknown>;
  } catch {
    const match = content.match(/\{[\s\S]*\}/);
    if (!match) {
      throw new HttpError(502, "AI response is not valid JSON", "AI_JSON_INVALID");
    }
    return JSON.parse(match[0]) as Record<string, unknown>;
  }
}

function readString(record: unknown, key: string, fallback: string): string {
  if (!record || typeof record !== "object") return fallback;
  const value = (record as Record<string, unknown>)[key];
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function shouldRetryWithoutJsonMode(error: unknown): boolean {
  return error instanceof HttpError && (error.statusCode === 400 || error.message.includes("AI provider returned 400"));
}

function readErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
