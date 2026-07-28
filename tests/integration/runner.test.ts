import { describe, it, expect } from "vitest";
import { EvalRunner } from "../../src/eval/runner";
import { MockLLMProvider } from "../../src/providers/llm/mock";
import { LocalEmbeddingProvider } from "../../src/providers/embeddings/local";
import { TraceStore } from "../../src/trace/trace";
import { exactMatch, contains, semanticSimilarity } from "../../src/assertions/index";
import type { EvalCase } from "../../src/types";

function fixedRunner() {
  let n = 0;
  const traceStore = new TraceStore(() => `trace-${++n}`);
  const llm = new MockLLMProvider((o) => {
    const user = [...o.messages].reverse().find((m) => m.role === "user")?.content ?? "";
    const map: Record<string, string> = {
      "capital?": "Paris",
      "greet": "Hello Douglas welcome",
    };
    return map[user] ?? user;
  });
  return new EvalRunner({
    llm,
    embeddings: new LocalEmbeddingProvider(),
    traceStore,
    now: () => new Date("2026-01-01T00:00:00.000Z"),
    runIdGen: () => "run-fixed",
  });
}

const cases: EvalCase[] = [
  { id: "c1", input: [{ role: "user", content: "capital?" }], assertions: [exactMatch("Paris")] },
  { id: "c2", input: [{ role: "user", content: "greet" }], assertions: [contains(["Douglas", "welcome"], { caseInsensitive: true })] },
];

describe("EvalRunner", () => {
  it("runs cases and aggregates pass rate + confidence", async () => {
    const run = await fixedRunner().run(cases);
    expect(run.total).toBe(2);
    expect(run.passed).toBe(2);
    expect(run.passRate).toBe(1);
    expect(run.meanConfidence).toBeGreaterThan(0);
    expect(run.runId).toBe("run-fixed");
  });

  it("links a trace id per case with prompt/context/response", async () => {
    const runner = fixedRunner();
    const run = await runner.run(cases);
    const first = run.cases[0];
    const trace = runner.traces.get(first.traceId);
    expect(trace).toBeDefined();
    expect(trace!.caseId).toBe("c1");
    expect(trace!.response).toBe("Paris");
    expect(trace!.prompt).toEqual(cases[0].input);
  });

  it("captures assertion failures without throwing", async () => {
    const run = await fixedRunner().run([
      { id: "bad", input: [{ role: "user", content: "capital?" }], assertions: [exactMatch("London")] },
    ]);
    expect(run.passed).toBe(0);
    expect(run.cases[0].passed).toBe(false);
  });

  it("records an error result when an assertion has no embeddings", async () => {
    const llm = new MockLLMProvider("hi");
    const runner = new EvalRunner({ llm }); // no embeddings
    const run = await runner.run([
      { id: "needs-emb", input: [{ role: "user", content: "x" }], assertions: [semanticSimilarity("y")] },
    ]);
    expect(run.cases[0].error).toMatch(/embedding provider/);
    expect(run.cases[0].passed).toBe(false);
  });
});
