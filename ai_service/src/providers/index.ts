import type { AiProvider } from "./types.js";
import { mockProvider } from "./mockProvider.js";
import { OpenAiCompatibleProvider } from "./openaiCompatibleProvider.js";

export function createProvider(): AiProvider {
  const provider = (process.env.AI_PROVIDER ?? "mock").toLowerCase();

  if (provider === "mock") return mockProvider;
  if (provider === "openai-compatible" || provider === "siliconflow" || provider === "deepseek") {
    return new OpenAiCompatibleProvider();
  }

  console.warn(`[ai_service] unknown AI_PROVIDER=${provider}, falling back to mock provider`);
  return mockProvider;
}
