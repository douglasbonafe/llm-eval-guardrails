import type { Assertion, AssertionContext } from "../types";
import { result } from "./base";

export interface RubricOptions {
  /** Minimum normalized judge score (0..1). 0.75 means a judge grade of 4/5. Default 0.75. */
  threshold?: number;
}

/**
 * Rubric assertion: a judge (LLM or recorded verdict) grades the output against
 * written criteria. Use it for what string checks cannot see: faithfulness of a
 * summary, tone, whether a review comment is specific. With no judge configured
 * it FAILS rather than skipping, so a gate can never go green by not judging.
 */
export function rubric(criteria: string, opts: RubricOptions = {}): Assertion {
  const threshold = opts.threshold ?? 0.75;
  return {
    type: "rubric",
    async evaluate(ctx: AssertionContext) {
      if (!ctx.judge) {
        return result("rubric", false, 0, "No judge configured for a rubric assertion", { threshold });
      }
      const verdict = await ctx.judge.grade({
        caseId: ctx.caseId ?? "",
        criteria,
        input: ctx.input ?? [],
        output: ctx.output,
        context: ctx.context,
      });
      const passed = verdict.score >= threshold;
      return result("rubric", passed, verdict.score, `${ctx.judge.name}: ${verdict.reason || "(no reason)"} [${(verdict.score * 4 + 1).toFixed(0)}/5]`, {
        threshold,
        detail: { criteria, judge: ctx.judge.name },
      });
    },
  };
}
