import type { AssertionResult, CompletionResult } from "../types";

/**
 * Confidence that a case verdict is reliable (0..1). This is distinct from the
 * pass/fail score: a case can fail with high confidence (clearly wrong) or pass
 * with low confidence (barely over threshold). Guardrails use this to avoid
 * shipping on shaky signals.
 *
 * It blends three signals:
 *   1. margin      — how decisively each assertion cleared/missed its threshold
 *   2. agreement   — how consistent the assertions are with each other
 *   3. modelLogprob— average token probability from the model (when available)
 */
export function computeConfidence(assertions: AssertionResult[], completion?: CompletionResult): number {
  if (assertions.length === 0) return 0;

  // 1. Margin: distance of each score from its decision boundary.
  const margins = assertions.map((a) => {
    const boundary = a.threshold ?? 0.5;
    const range = a.passed ? 1 - boundary : boundary;
    const dist = Math.abs(a.score - boundary);
    return range === 0 ? 1 : Math.min(1, dist / range);
  });
  const margin = mean(margins);

  // 2. Agreement: low variance across assertion scores => high agreement.
  const scores = assertions.map((a) => a.score);
  const agreement = 1 - Math.min(1, variance(scores) * 4);

  // 3. Model logprob -> average token probability.
  let logprobConf: number | undefined;
  if (completion?.avgLogprob !== undefined) {
    logprobConf = Math.max(0, Math.min(1, Math.exp(completion.avgLogprob)));
  }

  const parts: Array<{ value: number; weight: number }> = [
    { value: margin, weight: 0.5 },
    { value: agreement, weight: 0.2 },
  ];
  if (logprobConf !== undefined) parts.push({ value: logprobConf, weight: 0.3 });

  const totalWeight = parts.reduce((s, p) => s + p.weight, 0);
  const weighted = parts.reduce((s, p) => s + p.value * p.weight, 0) / totalWeight;
  return Math.max(0, Math.min(1, weighted));
}

function mean(xs: number[]): number {
  return xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length;
}

function variance(xs: number[]): number {
  if (xs.length === 0) return 0;
  const m = mean(xs);
  return mean(xs.map((x) => (x - m) ** 2));
}
