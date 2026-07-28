import type { CompletionOptions, CompletionResult, LLMProvider } from "../../types";

export type { LLMProvider, CompletionOptions, CompletionResult };

/** Utility: pull the last user message content out of an options object. */
export function lastUserMessage(options: CompletionOptions): string {
  for (let i = options.messages.length - 1; i >= 0; i--) {
    if (options.messages[i].role === "user") return options.messages[i].content;
  }
  return options.messages.at(-1)?.content ?? "";
}
