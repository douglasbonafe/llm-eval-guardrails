import type {
  AssertionContext,
  AssertionResult,
  CaseResult,
  EvalCase,
  EvalRunResult,
  EmbeddingProvider,
  LLMProvider,
} from "../types";
import { TraceStore } from "../trace/trace";
import { computeConfidence } from "./confidence";

export interface EvalRunnerOptions {
  llm: LLMProvider;
  embeddings?: EmbeddingProvider;
  traceStore?: TraceStore;
  /** Injectable clock for deterministic timestamps in tests. */
  now?: () => Date;
  /** Injectable id generator for deterministic run ids in tests. */
  runIdGen?: () => string;
}

/**
 * Runs eval cases against the model under test and aggregates results.
 * Every case produces a trace id linking prompt, context, and response.
 */
export class EvalRunner {
  private readonly llm: LLMProvider;
  private readonly embeddings?: EmbeddingProvider;
  readonly traces: TraceStore;
  private readonly now: () => Date;
  private readonly runIdGen: () => string;

  constructor(opts: EvalRunnerOptions) {
    this.llm = opts.llm;
    this.embeddings = opts.embeddings;
    this.traces = opts.traceStore ?? new TraceStore();
    this.now = opts.now ?? (() => new Date());
    this.runIdGen =
      opts.runIdGen ?? (() => `run_${this.now().toISOString().replace(/[^0-9]/g, "").slice(0, 14)}`);
  }

  async run(cases: EvalCase[]): Promise<EvalRunResult> {
    const startedAt = this.now().toISOString();
    const results: CaseResult[] = [];
    for (const c of cases) {
      results.push(await this.runCase(c));
    }
    const finishedAt = this.now().toISOString();

    const passed = results.filter((r) => r.passed).length;
    const total = results.length;
    return {
      runId: this.runIdGen(),
      startedAt,
      finishedAt,
      total,
      passed,
      failed: total - passed,
      passRate: total === 0 ? 0 : passed / total,
      meanScore: avg(results.map((r) => r.score)),
      meanConfidence: avg(results.map((r) => r.confidence)),
      cases: results,
    };
  }

  private async runCase(c: EvalCase): Promise<CaseResult> {
    const started = Date.now();
    const trace = this.traces.start({
      caseId: c.id,
      prompt: c.input,
      context: c.context,
      now: () => this.now().toISOString(),
    });

    try {
      const completion = await this.llm.complete({
        messages: c.input,
        temperature: 0,
      });
      trace.setResponse(completion.text, completion.model);

      const ctx: AssertionContext = {
        output: completion.text,
        context: c.context,
        embeddings: this.embeddings,
        completion,
      };

      const assertionResults: AssertionResult[] = [];
      for (const assertion of c.assertions) {
        assertionResults.push(await assertion.evaluate(ctx));
      }

      const passed = assertionResults.every((a) => a.passed);
      const score = avg(assertionResults.map((a) => a.score));
      const confidence = computeConfidence(assertionResults, completion);
      trace.annotate("passed", passed);
      trace.annotate("score", score);
      trace.annotate("confidence", confidence);

      return {
        caseId: c.id,
        traceId: trace.traceId,
        passed,
        score,
        confidence,
        output: completion.text,
        assertions: assertionResults,
        tags: c.tags,
        durationMs: Date.now() - started,
      };
    } catch (e) {
      const message = (e as Error).message;
      trace.annotate("error", message);
      return {
        caseId: c.id,
        traceId: trace.traceId,
        passed: false,
        score: 0,
        confidence: 0,
        output: "",
        assertions: [],
        tags: c.tags,
        durationMs: Date.now() - started,
        error: message,
      };
    }
  }
}

function avg(xs: number[]): number {
  return xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length;
}
