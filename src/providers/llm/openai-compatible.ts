import OpenAI from "openai";
import type { CompletionOptions, CompletionResult, LLMProvider } from "../../types";

export interface OpenAICompatibleConfig {
  apiKey: string;
  /** Override for Groq (https://api.groq.com/openai/v1), DeepSeek (https://api.deepseek.com), etc. */
  baseURL?: string;
  defaultModel: string;
  /** Label used in reports/logs, e.g. "groq". Defaults to "openai-compatible". */
  label?: string;
}

/**
 * Works with OpenAI and any OpenAI-compatible Chat Completions endpoint.
 * Set baseURL to point at Groq or DeepSeek — the wire format is identical.
 */
export class OpenAICompatibleProvider implements LLMProvider {
  readonly name: string;
  private readonly client: OpenAI;
  private readonly defaultModel: string;

  constructor(cfg: OpenAICompatibleConfig) {
    this.name = cfg.label ?? "openai-compatible";
    this.defaultModel = cfg.defaultModel;
    this.client = new OpenAI({ apiKey: cfg.apiKey, baseURL: cfg.baseURL });
  }

  async complete(options: CompletionOptions): Promise<CompletionResult> {
    const model = options.model ?? this.defaultModel;
    const res = await this.client.chat.completions.create({
      model,
      messages: options.messages,
      temperature: options.temperature ?? 0,
      max_tokens: options.maxTokens,
      logprobs: true,
    });

    const choice = res.choices[0];
    const text = choice?.message?.content ?? "";
    const avgLogprob = this.averageLogprob(choice);

    return {
      text,
      model: res.model ?? model,
      usage: {
        promptTokens: res.usage?.prompt_tokens,
        completionTokens: res.usage?.completion_tokens,
        totalTokens: res.usage?.total_tokens,
      },
      avgLogprob,
    };
  }

  private averageLogprob(choice: OpenAI.Chat.Completions.ChatCompletion.Choice | undefined): number | undefined {
    const tokens = choice?.logprobs?.content;
    if (!tokens || tokens.length === 0) return undefined;
    const sum = tokens.reduce((acc, t) => acc + t.logprob, 0);
    return sum / tokens.length;
  }
}
