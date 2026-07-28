import Anthropic from "@anthropic-ai/sdk";
import type { CompletionOptions, CompletionResult, LLMProvider } from "../../types";

export interface AnthropicConfig {
  apiKey: string;
  defaultModel: string;
}

/** Anthropic Claude provider. */
export class AnthropicProvider implements LLMProvider {
  readonly name = "anthropic";
  private readonly client: Anthropic;
  private readonly defaultModel: string;

  constructor(cfg: AnthropicConfig) {
    this.defaultModel = cfg.defaultModel;
    this.client = new Anthropic({ apiKey: cfg.apiKey });
  }

  async complete(options: CompletionOptions): Promise<CompletionResult> {
    const model = options.model ?? this.defaultModel;

    // Anthropic takes the system prompt as a top-level field, not a message.
    const system = options.messages
      .filter((m) => m.role === "system")
      .map((m) => m.content)
      .join("\n");
    const messages = options.messages
      .filter((m) => m.role !== "system")
      .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));

    const res = await this.client.messages.create({
      model,
      system: system || undefined,
      messages,
      max_tokens: options.maxTokens ?? 1024,
      temperature: options.temperature ?? 0,
    });

    const text = res.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");

    return {
      text,
      model: res.model ?? model,
      usage: {
        promptTokens: res.usage?.input_tokens,
        completionTokens: res.usage?.output_tokens,
        totalTokens:
          (res.usage?.input_tokens ?? 0) + (res.usage?.output_tokens ?? 0) || undefined,
      },
    };
  }
}
