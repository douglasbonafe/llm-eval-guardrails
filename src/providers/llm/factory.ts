import type { AppConfig } from "../../config";
import type { LLMProvider } from "../../types";
import { AnthropicProvider } from "./anthropic";
import { MockLLMProvider, type MockResponder } from "./mock";
import { OpenAICompatibleProvider } from "./openai-compatible";

/** Guess a friendly label from the base URL so reports say "groq"/"deepseek". */
function labelFromBaseUrl(baseUrl?: string): string {
  if (!baseUrl) return "openai";
  if (baseUrl.includes("groq")) return "groq";
  if (baseUrl.includes("deepseek")) return "deepseek";
  return "openai-compatible";
}

/**
 * Builds an LLM provider from validated config.
 * Pass a mockResponder to force deterministic behavior regardless of config.
 */
export function createLLMProvider(config: AppConfig, mockResponder?: MockResponder): LLMProvider {
  if (config.llmProvider === "mock") {
    return new MockLLMProvider(mockResponder);
  }

  if (config.llmProvider === "anthropic") {
    if (!config.anthropicApiKey) {
      throw new Error("LLM_PROVIDER=anthropic requires ANTHROPIC_API_KEY. See .env.local for where to get it.");
    }
    return new AnthropicProvider({
      apiKey: config.anthropicApiKey,
      defaultModel: config.anthropicModel,
    });
  }

  // openai / openai-compatible (OpenAI, Groq, DeepSeek, ...)
  if (!config.llmApiKey) {
    throw new Error(
      "LLM_PROVIDER=openai requires LLM_API_KEY. Free options: Groq (https://console.groq.com/keys) or DeepSeek (https://platform.deepseek.com/api_keys). See .env.local.",
    );
  }
  return new OpenAICompatibleProvider({
    apiKey: config.llmApiKey,
    baseURL: config.llmBaseUrl || undefined,
    defaultModel: config.llmModel,
    label: labelFromBaseUrl(config.llmBaseUrl),
  });
}
