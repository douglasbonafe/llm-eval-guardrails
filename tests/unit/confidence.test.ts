import { describe, it, expect } from "vitest";
import { computeConfidence } from "../../src/eval/confidence";
import type { AssertionResult } from "../../src/types";

const ar = (passed: boolean, score: number, threshold?: number): AssertionResult => ({
  type: "test",
  passed,
  score,
  threshold,
  message: "",
});

describe("computeConfidence", () => {
  it("returns 0 for no assertions", () => {
    expect(computeConfidence([])).toBe(0);
  });

  it("is higher when assertions clear their threshold decisively", () => {
    const decisive = computeConfidence([ar(true, 0.99, 0.5)]);
    const marginal = computeConfidence([ar(true, 0.51, 0.5)]);
    expect(decisive).toBeGreaterThan(marginal);
  });

  it("penalizes disagreement between assertions", () => {
    const agree = computeConfidence([ar(true, 0.9, 0.5), ar(true, 0.9, 0.5)]);
    const disagree = computeConfidence([ar(true, 0.9, 0.5), ar(false, 0.1, 0.5)]);
    expect(agree).toBeGreaterThan(disagree);
  });

  it("incorporates model logprob when present", () => {
    const withLogprob = computeConfidence([ar(true, 0.8, 0.5)], {
      text: "x",
      model: "m",
      avgLogprob: -0.01,
    });
    expect(withLogprob).toBeGreaterThan(0);
    expect(withLogprob).toBeLessThanOrEqual(1);
  });

  it("stays within [0,1]", () => {
    const c = computeConfidence([ar(true, 1, 0.5), ar(false, 0, 0.5)]);
    expect(c).toBeGreaterThanOrEqual(0);
    expect(c).toBeLessThanOrEqual(1);
  });
});
