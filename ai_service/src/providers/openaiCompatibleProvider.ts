import type { AiProvider, AnalysisResult, ScoreSet } from "./types.js";
import { normalizeTags } from "../services/tagMapping.js";
import { decisionFromScores, normalizeScores, riskLevelFromScores } from "../services/scorePolicy.js";
import { HttpError } from "../utils/validation.js";

type ChatMessage = {
  role: "system" | "user";
  content: string;
};

export class OpenAiCompatibleProvider implements AiProvider {
  id = "openai-compatible";
  model: string;
  private baseUrl: string;
  private chatPath: string;
  private apiKey: string;
  private timeoutMs: number;
  private retryCount: number;

  constructor() {
    this.baseUrl = (process.env.AI_BASE_URL ?? "https://api.siliconflow.cn/v1").replace(/\/$/, "");
    this.chatPath = process.env.AI_CHAT_PATH ?? "/chat/completions";
    this.apiKey = process.env.AI_API_KEY ?? "";
    this.model = process.env.AI_MODEL ?? "Qwen/QwQ-32B";
    this.timeoutMs = Number(process.env.AI_TIMEOUT_MS ?? 20000);
    this.retryCount = Number(process.env.AI_RETRY_COUNT ?? 1);
  }

  async analyze({ content, taxonomy }: { content: string; taxonomy: string }): Promise<AnalysisResult> {
    if (!this.apiKey) {
      throw new HttpError(500, "AI_API_KEY is required for openai-compatible provider", "AI_PROVIDER_NOT_CONFIGURED");
    }

    const messages = this.buildMessages(content, taxonomy);
    const response = await this.requestWithRetry(messages);
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
      provider: this.id,
      model: this.model,
      raw: response,
    };
  }

  private buildMessages(content: string, taxonomy: string): ChatMessage[] {
    return [
      {
        role: "system",
        content:
          "你是社交平台内容质量与安全评级器。你必须只输出 JSON 对象，不要输出 Markdown。评分均为 0-100 的整数，100 表示最好或风险最低。tags 必须从给定标签库中选择。",
      },
      {
        role: "user",
        content: JSON.stringify({
          task: "分析社交平台文本内容，返回四维评分、标签、理由和建议。",
          schema: {
            friendlinessScore: "0-100 integer",
            rationalityScore: "0-100 integer",
            legalityScore: "0-100 integer",
            professionalismScore: "0-100 integer",
            tags: [{ name: "标签库中的小标签名", confidence: "0-1 number", weight: "0-1 number" }],
            reason: "简短中文理由",
            suggestion: "简短中文建议",
          },
          taxonomy: JSON.parse(taxonomy),
          content,
        }),
      },
    ];
  }

  private async requestWithRetry(messages: ChatMessage[]): Promise<any> {
    let lastError: unknown;
    for (let attempt = 0; attempt <= this.retryCount; attempt += 1) {
      try {
        return await this.request(messages);
      } catch (error) {
        lastError = error;
        if (attempt < this.retryCount) {
          await new Promise((resolve) => setTimeout(resolve, 400 * (attempt + 1)));
        }
      }
    }
    throw lastError;
  }

  private async request(messages: ChatMessage[]): Promise<any> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(`${this.baseUrl}${this.chatPath}`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          messages,
          temperature: 0.2,
          response_format: { type: "json_object" },
        }),
        signal: controller.signal,
      });

      const body = await response.text();
      if (!response.ok) {
        throw new HttpError(502, `AI provider returned ${response.status}: ${body.slice(0, 300)}`, "AI_PROVIDER_ERROR");
      }

      return JSON.parse(body);
    } finally {
      clearTimeout(timeout);
    }
  }
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
