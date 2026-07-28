import type { Assertion, AssertionContext, AssertionResult } from "../types";

export type { Assertion, AssertionContext, AssertionResult };

/** Small helper to build an AssertionResult with sensible defaults. */
export function result(
  type: string,
  passed: boolean,
  score: number,
  message: string,
  extra?: { threshold?: number; detail?: Record<string, unknown> },
): AssertionResult {
  return {
    type,
    passed,
    score: Math.max(0, Math.min(1, score)),
    message,
    threshold: extra?.threshold,
    detail: extra?.detail,
  };
}
