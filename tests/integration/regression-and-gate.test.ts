import { describe, it, expect } from "vitest";
import { EvalRunner } from "../../src/eval/runner";
import { MockLLMProvider } from "../../src/providers/llm/mock";
import { snapshotFromRun } from "../../src/snapshot/snapshot-store";
import { detectRegressions } from "../../src/snapshot/regression";
import { evaluateGate } from "../../src/guardrail/quality-gate";
import { exactMatch } from "../../src/assertions/index";
import type { EvalCase } from "../../src/types";

const cases: EvalCase[] = [
  { id: "q1", input: [{ role: "user", content: "q1" }], assertions: [exactMatch("good")] },
  { id: "q2", input: [{ role: "user", content: "q2" }], assertions: [exactMatch("good")] },
];

// v1: both answer "good" (both pass). v2: q2 regresses to "bad".
const v1 = new MockLLMProvider("good");
const v2 = new MockLLMProvider((o) => {
  const user = [...o.messages].reverse().find((m) => m.role === "user")?.content ?? "";
  return user === "q2" ? "bad" : "good";
});

describe("regression detection + quality gate", () => {
  it("detects a case that regressed from pass to fail", async () => {
    const baseRun = await new EvalRunner({ llm: v1 }).run(cases);
    const baseline = snapshotFromRun(baseRun, "v1");

    const newRun = await new EvalRunner({ llm: v2 }).run(cases);
    const report = detectRegressions(baseline, newRun);

    expect(report.hasRegressions).toBe(true);
    expect(report.regressions.map((r) => r.caseId)).toContain("q2");
    expect(report.regressions).toHaveLength(1);
  });

  it("gate passes on a clean run and fails on regressions", async () => {
    const baseRun = await new EvalRunner({ llm: v1 }).run(cases);
    const baseline = snapshotFromRun(baseRun, "v1");
    const newRun = await new EvalRunner({ llm: v2 }).run(cases);
    const report = detectRegressions(baseline, newRun);

    const thresholds = { minPassRate: 0.9, minConfidence: 0.3, maxRegressions: 0 };

    const cleanGate = evaluateGate(baseRun, thresholds);
    expect(cleanGate.passed).toBe(true);

    const failedGate = evaluateGate(newRun, thresholds, report);
    expect(failedGate.passed).toBe(false);
    expect(failedGate.violations.some((v) => v.rule === "regressions")).toBe(true);
    expect(failedGate.violations.some((v) => v.rule === "pass-rate")).toBe(true);
  });

  it("gate fails when confidence is below the floor", async () => {
    const run = await new EvalRunner({ llm: v1 }).run(cases);
    const gate = evaluateGate(run, { minPassRate: 0.5, minConfidence: 0.99, maxRegressions: 0 });
    expect(gate.passed).toBe(false);
    expect(gate.violations[0].rule).toBe("confidence");
  });
});
