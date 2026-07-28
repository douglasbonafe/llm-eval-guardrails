import { describe, it, expect } from "vitest";
import {
  exactMatch,
  contains,
  notContains,
  matchesRegex,
  jsonSchema,
  semanticSimilarity,
  grounded,
  z,
} from "../../src/assertions/index";
import { LocalEmbeddingProvider } from "../../src/providers/embeddings/local";
import type { AssertionContext } from "../../src/types";

const embeddings = new LocalEmbeddingProvider();
const ctx = (output: string, context?: string[]): AssertionContext => ({ output, context, embeddings });

describe("text assertions", () => {
  it("exactMatch passes/fails and trims by default", async () => {
    expect((await exactMatch("Paris").evaluate(ctx("  Paris  "))).passed).toBe(true);
    expect((await exactMatch("Paris").evaluate(ctx("London"))).passed).toBe(false);
  });

  it("exactMatch honors caseInsensitive", async () => {
    expect((await exactMatch("paris", { caseInsensitive: true }).evaluate(ctx("PARIS"))).passed).toBe(true);
  });

  it("contains reports partial score for missing needles", async () => {
    const r = await contains(["alpha", "beta"]).evaluate(ctx("alpha only"));
    expect(r.passed).toBe(false);
    expect(r.score).toBeCloseTo(0.5, 5);
  });

  it("notContains flags banned substrings", async () => {
    expect((await notContains("password").evaluate(ctx("here is your password"))).passed).toBe(false);
    expect((await notContains("password").evaluate(ctx("all good"))).passed).toBe(true);
  });

  it("matchesRegex validates format", async () => {
    const r = matchesRegex(/^\d{3}-\d{2}$/);
    expect((await r.evaluate(ctx("123-45"))).passed).toBe(true);
    expect((await r.evaluate(ctx("nope"))).passed).toBe(false);
  });
});

describe("jsonSchema assertion", () => {
  const schema = z.object({ name: z.string(), age: z.number() });

  it("passes on valid JSON matching the schema", async () => {
    expect((await jsonSchema(schema).evaluate(ctx('{"name":"Ada","age":36}'))).passed).toBe(true);
  });

  it("strips markdown code fences", async () => {
    const fenced = "```json\n{\"name\":\"Ada\",\"age\":36}\n```";
    expect((await jsonSchema(schema).evaluate(ctx(fenced))).passed).toBe(true);
  });

  it("fails and reports issues on schema violation", async () => {
    const r = await jsonSchema(schema).evaluate(ctx('{"name":"Ada"}'));
    expect(r.passed).toBe(false);
    expect((r.detail?.issues as unknown[]).length).toBeGreaterThan(0);
  });

  it("fails on non-JSON output", async () => {
    expect((await jsonSchema(schema).evaluate(ctx("not json"))).passed).toBe(false);
  });
});

describe("semanticSimilarity assertion", () => {
  it("passes on paraphrase, fails on unrelated", async () => {
    const a = semanticSimilarity("the eiffel tower stands 330 meters tall", { threshold: 0.5 });
    expect((await a.evaluate(ctx("the eiffel tower is 330 meters tall"))).passed).toBe(true);
    expect((await a.evaluate(ctx("bananas contain potassium"))).passed).toBe(false);
  });

  it("throws when no embedding provider is supplied", async () => {
    const a = semanticSimilarity("x");
    await expect(async () => a.evaluate({ output: "y" })).rejects.toThrow(/embedding provider/);
  });
});

describe("groundedness assertion", () => {
  const context = [
    "The Eiffel Tower was completed in 1889 for the World's Fair.",
    "The Eiffel Tower stands 330 meters tall in Paris.",
  ];

  it("passes when claims are supported by context", async () => {
    const out = "The Eiffel Tower stands 330 meters tall. It was completed in 1889.";
    const r = await grounded({ threshold: 0.6, claimSupportThreshold: 0.35 }).evaluate(ctx(out, context));
    expect(r.passed).toBe(true);
  });

  it("flags hallucinated claims with no support in the context", async () => {
    // Note: local (lexical) embeddings catch topically-unsupported claims.
    // Catching same-topic wrong-fact hallucinations (e.g. "900 meters") needs
    // real semantic embeddings or an LLM judge — see README caveats.
    const out = "Penguins are excellent swimmers that live near the Sahara desert.";
    const r = await grounded({ threshold: 0.9, claimSupportThreshold: 0.5 }).evaluate(ctx(out, context));
    expect(r.passed).toBe(false);
    expect((r.detail?.unsupportedClaims as string[]).length).toBeGreaterThan(0);
  });

  it("fails with no context", async () => {
    expect((await grounded().evaluate(ctx("anything", []))).passed).toBe(false);
  });
});
