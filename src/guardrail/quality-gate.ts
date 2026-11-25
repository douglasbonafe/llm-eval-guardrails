import type { EvalRunResult } from "../types";
import type { RegressionReport } from "../snapshot/regression";

export interface GateThresholds {
  minPassRate: number;
  minConfidence: number;
  maxRegressions: number;
  /** Cases tagged "critical" (safety, injection, leaks) that may fail. Default 0. */
  maxCriticalFailures?: number;
}

export interface GateViolation {
  rule: "pass-rate" | "confidence" | "regressions" | "critical";
  message: string;
  actual: number;
  limit: number;
}

export interface GateResult {
  passed: boolean;
  violations: GateViolation[];
  metrics: {
    passRate: number;
    meanConfidence: number;
    regressions: number;
  };
  summary: string;
}

/**
 * The guardrail. Evaluates a run (and optional regression report) against
 * thresholds and returns a pass/fail verdict. Wire the boolean to a CI exit
 * code and it becomes a deploy-blocking quality gate.
 */
export function evaluateGate(
  run: EvalRunResult,
  thresholds: GateThresholds,
  regression?: RegressionReport,
): GateResult {
  const violations: GateViolation[] = [];
  const regressionCount = regression?.regressions.length ?? 0;

  if (run.passRate < thresholds.minPassRate) {
    violations.push({
      rule: "pass-rate",
      message: `Pass rate ${(run.passRate * 100).toFixed(1)}% is below the minimum ${(thresholds.minPassRate * 100).toFixed(1)}%`,
      actual: run.passRate,
      limit: thresholds.minPassRate,
    });
  }

  if (run.meanConfidence < thresholds.minConfidence) {
    violations.push({
      rule: "confidence",
      message: `Mean confidence ${run.meanConfidence.toFixed(2)} is below the minimum ${thresholds.minConfidence.toFixed(2)}`,
      actual: run.meanConfidence,
      limit: thresholds.minConfidence,
    });
  }

  if (regressionCount > thresholds.maxRegressions) {
    const ids = regression?.regressions.map((r) => r.caseId).join(", ");
    violations.push({
      rule: "regressions",
      message: `${regressionCount} regression(s) exceed the max allowed ${thresholds.maxRegressions}: ${ids}`,
      actual: regressionCount,
      limit: thresholds.maxRegressions,
    });
  }

  const maxCritical = thresholds.maxCriticalFailures ?? 0;
  const criticalFailed = run.cases.filter((c) => !c.passed && c.tags?.includes("critical"));
  if (criticalFailed.length > maxCritical) {
    violations.push({
      rule: "critical",
      message: `${criticalFailed.length} critical case(s) failed (max ${maxCritical}): ${criticalFailed.map((c) => c.caseId).join(", ")}`,
      actual: criticalFailed.length,
      limit: maxCritical,
    });
  }

  const passed = violations.length === 0;
  const summary = passed
    ? `Quality gate PASSED — passRate=${(run.passRate * 100).toFixed(1)}%, confidence=${run.meanConfidence.toFixed(2)}, regressions=${regressionCount}`
    : `Quality gate FAILED — ${violations.length} violation(s): ${violations.map((v) => v.rule).join(", ")}`;

  return {
    passed,
    violations,
    metrics: { passRate: run.passRate, meanConfidence: run.meanConfidence, regressions: regressionCount },
    summary,
  };
}
