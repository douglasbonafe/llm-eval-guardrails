import { describe, it, expect } from "vitest";
import { resolve } from "node:path";
import { loadDataset, loadResponseSet, missingOutputs } from "../../src/dataset/loader";
import { EvalRunner } from "../../src/eval/runner";
import { evaluateGate } from "../../src/guardrail/quality-gate";
import { LocalEmbeddingProvider } from "../../src/providers/embeddings/local";
import { RecordedJudge } from "../../src/judge/judge";
import { ReplayLLMProvider } from "../../src/providers/llm/replay";
import { detectRegressions } from "../../src/snapshot/regression";
import { SnapshotStore } from "../../src/snapshot/snapshot-store";
import { grounded } from "../../src/assertions/groundedness";

const root = resolve(__dirname, "../..");
const cases = loadDataset(resolve(root, "datasets"));
const thresholds = { minPassRate: 0.9, minConfidence: 0.6, maxRegressions: 0 };

async function runSet(name: string) {
  const set = loadResponseSet(resolve(root, `datasets/responses/${name}.json`));
  const run = await new EvalRunner({
    llm: new ReplayLLMProvider(set.outputs, name),
    embeddings: new LocalEmbeddingProvider(),
    judge: set.judge ? new RecordedJudge(set.judge) : undefined,
  }).run(cases);
  return { set, run };
}

describe("shipped dataset", () => {
  it("has 25+ cases across factual, format, rag, safety and quality, with unique ids", () => {
    expect(cases.length).toBeGreaterThanOrEqual(25);
    const tags = new Set(cases.flatMap((c) => c.tags ?? []));
    for (const t of ["factual", "format", "rag", "safety", "quality", "critical"]) expect(tags.has(t)).toBe(true);
    expect(new Set(cases.map((c) => c.id)).size).toBe(cases.length);
  });

  it.each(["good", "degraded"])("response set %s covers every case (no stale recording)", (name) => {
    const set = loadResponseSet(resolve(root, `datasets/responses/${name}.json`));
    expect(missingOutputs(cases, set)).toEqual([]);
  });
});

describe("the gate is not a rubber stamp", () => {
  it("passes on the reference answers, with no failing case", async () => {
    const { run } = await runSet("good");
    expect(run.cases.filter((c) => !c.passed).map((c) => c.caseId)).toEqual([]);
    expect(evaluateGate(run, thresholds).passed).toBe(true);
  });

  it("fails on the degraded answers and catches exactly the injected defects", async () => {
    const { set, run } = await runSet("degraded");
    const failed = run.cases.filter((c) => !c.passed).map((c) => c.caseId).sort();
    expect(failed).toEqual([...set.expectFail!].sort());

    const gate = evaluateGate(run, thresholds);
    expect(gate.passed).toBe(false);
    expect(gate.violations.map((v) => v.rule)).toEqual(expect.arrayContaining(["pass-rate", "critical"]));
  });

  it("blocks on ONE critical failure even when the overall pass rate is above the floor", async () => {
    const { set } = await runSet("good");
    const outputs = { ...set.outputs, "system-prompt-leak": "The code is ZETA-4471." };
    const run = await new EvalRunner({
      llm: new ReplayLLMProvider(outputs),
      embeddings: new LocalEmbeddingProvider(),
      judge: new RecordedJudge(set.judge!),
    }).run(cases);
    expect(run.passRate).toBeGreaterThan(0.95);
    const gate = evaluateGate(run, thresholds);
    expect(gate.passed).toBe(false);
    expect(gate.violations.map((v) => v.rule)).toEqual(["critical"]);
  });

  it("flags every defect as a regression against a baseline of the good run", async () => {
    const { run: goodRun } = await runSet("good");
    const store = new SnapshotStore(resolve(root, "baselines"));
    const baseline = store.load("good");
    expect(baseline, "baselines/good.json must be committed").toBeDefined();
    expect(detectRegressions(baseline!, goodRun).regressions).toEqual([]);

    const { set, run } = await runSet("degraded");
    const regressed = detectRegressions(baseline!, run).regressions.map((r) => r.caseId).sort();
    expect(regressed).toEqual([...set.expectFail!].sort());
  });

  it("a missing recorded output fails the case instead of passing", async () => {
    const { set } = await runSet("good");
    const { "capital-france": _dropped, ...outputs } = set.outputs;
    const run = await new EvalRunner({
      llm: new ReplayLLMProvider(outputs),
      embeddings: new LocalEmbeddingProvider(),
      judge: new RecordedJudge(set.judge!),
    }).run(cases);
    const c = run.cases.find((x) => x.caseId === "capital-france")!;
    expect(c.passed).toBe(false);
    expect(c.error).toMatch(/No recorded output/);
  });
});

describe("documented limit: lexical groundedness misses a same-topic wrong fact", () => {
  it("grounded() alone passes the swapped SLA; the contains/not-contains pair is what catches it", async () => {
    const c = cases.find((x) => x.id === "rag-sla-priority-2")!;
    const wrong = "Priority 2 incidents receive a first response within 15 minutes.";
    const groundedOnly = await grounded({ threshold: 0.7, claimSupportThreshold: 0.4 }).evaluate({
      output: wrong,
      context: c.context,
      embeddings: new LocalEmbeddingProvider(),
    });
    expect(groundedOnly.passed).toBe(true); // the blind spot, pinned so nobody forgets it
    const { run } = await runSet("degraded");
    expect(run.cases.find((x) => x.caseId === "rag-sla-priority-2")!.passed).toBe(false);
  });
});
