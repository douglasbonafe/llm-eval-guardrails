import type { CompletionOptions, CompletionResult, LLMProvider } from "../../types";
import { lastUserMessage } from "./base";

export type MockResponder =
  | string
  | Record<string, string>
  | ((options: CompletionOptions) => string);

/**
 * Deterministic LLM provider with no network dependency. Powers the default
 * test suite and lets users demo the whole framework with zero API keys.
 *
 * Responder resolution:
 *   - string   -> always returns that string
 *   - object   -> looks up the last user message in the map (else echoes it)
 *   - function -> full control over the reply
 *   - undefined-> echoes the last user message
 */
export class MockLLMProvider implements LLMProvider {
  readonly name = "mock";

  constructor(private readonly responder?: MockResponder) {}

  async complete(options: CompletionOptions): Promise<CompletionResult> {
    const text = this.resolve(options);
    return {
      text,
      model: options.model ?? "mock-model",
      usage: {
        promptTokens: this.approxTokens(options.messages.map((m) => m.content).join(" ")),
        completionTokens: this.approxTokens(text),
      },
      // A deterministic pseudo-logprob so confidence math is exercised in tests.
      avgLogprob: this.pseudoLogprob(text),
    };
  }

  private resolve(options: CompletionOptions): string {
    const r = this.responder;
    if (typeof r === "function") return r(options);
    if (typeof r === "string") return r;
    const user = lastUserMessage(options);
    if (r && typeof r === "object") return r[user] ?? user;
    return user;
  }

  private approxTokens(s: string): number {
    return Math.max(1, Math.round(s.length / 4));
  }

  private pseudoLogprob(text: string): number {
    // Deterministic value in a plausible logprob range (-1..0), longer and more
    // varied text -> slightly less "confident". Purely for exercising the math.
    const unique = new Set(text.toLowerCase().replace(/\s+/g, "")).size;
    const spread = Math.min(1, unique / 40);
    return -0.05 - spread * 0.5;
  }
}
