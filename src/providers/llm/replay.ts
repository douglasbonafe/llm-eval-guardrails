import type { CompletionOptions, CompletionResult, LLMProvider } from "../../types";

/**
 * Replays recorded model outputs keyed by case id. Unlike the mock it never
 * echoes: a case with no recorded output throws, so a stale recording fails the
 * case instead of passing by accident.
 */
export class ReplayLLMProvider implements LLMProvider {
  readonly name: string;
  constructor(
    private readonly outputs: Record<string, string>,
    label = "replay",
  ) {
    this.name = label;
  }

  async complete(options: CompletionOptions): Promise<CompletionResult> {
    const id = options.caseId;
    if (!id) throw new Error("ReplayLLMProvider needs options.caseId (run it through EvalRunner).");
    if (!Object.prototype.hasOwnProperty.call(this.outputs, id)) {
      throw new Error(`No recorded output for case "${id}"`);
    }
    return { text: this.outputs[id], model: this.name };
  }
}

/** Wraps a live provider and records each case's output (used by `record`). */
export class RecordingLLMProvider implements LLMProvider {
  readonly name: string;
  readonly outputs: Record<string, string> = {};
  constructor(private readonly inner: LLMProvider) {
    this.name = inner.name;
  }

  async complete(options: CompletionOptions): Promise<CompletionResult> {
    const res = await this.inner.complete(options);
    if (options.caseId) this.outputs[options.caseId] = res.text;
    return res;
  }
}
