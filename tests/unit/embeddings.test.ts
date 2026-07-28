import { describe, it, expect } from "vitest";
import { LocalEmbeddingProvider } from "../../src/providers/embeddings/local";
import { cosineSimilarity } from "../../src/providers/embeddings/base";

describe("LocalEmbeddingProvider", () => {
  const emb = new LocalEmbeddingProvider();

  it("is deterministic across calls", async () => {
    const a = await emb.embedOne("the quick brown fox");
    const b = await emb.embedOne("the quick brown fox");
    expect(a).toEqual(b);
  });

  it("produces unit-norm vectors of the configured dimension", async () => {
    const v = await emb.embedOne("hello world");
    expect(v).toHaveLength(256);
    const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0));
    expect(norm).toBeCloseTo(1, 5);
  });

  it("scores overlapping text higher than unrelated text", async () => {
    const base = await emb.embedOne("the eiffel tower is 330 meters tall");
    const similar = await emb.embedOne("the eiffel tower stands 330 meters tall");
    const different = await emb.embedOne("bananas are a good source of potassium");
    expect(cosineSimilarity(base, similar)).toBeGreaterThan(cosineSimilarity(base, different));
  });
});

describe("cosineSimilarity", () => {
  it("returns 1 for identical vectors", () => {
    expect(cosineSimilarity([1, 2, 3], [1, 2, 3])).toBeCloseTo(1, 6);
  });
  it("returns 0 for orthogonal vectors", () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0, 6);
  });
  it("throws on length mismatch", () => {
    expect(() => cosineSimilarity([1, 2], [1, 2, 3])).toThrow();
  });
});
