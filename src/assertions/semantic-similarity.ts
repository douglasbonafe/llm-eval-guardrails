import { cosineSimilarity } from "../providers/embeddings/base";
import type { Assertion, AssertionContext } from "../types";
import { result } from "./base";

export interface SemanticSimilarityOptions {
  /** Pass threshold on cosine similarity (0..1). Default 0.8. */
  threshold?: number;
}

/**
 * Passes when the output is semantically close to an expected reference answer,
 * measured by cosine similarity of embeddings. Tolerates paraphrase, unlike
 * exact match. Requires an embedding provider in the assertion context.
 */
export function semanticSimilarity(expected: string, opts: SemanticSimilarityOptions = {}): Assertion {
  const threshold = opts.threshold ?? 0.8;
  return {
    type: "semantic-similarity",
    async evaluate(ctx: AssertionContext) {
      if (!ctx.embeddings) {
        throw new Error("semantic-similarity assertion requires an embedding provider (pass one to the runner).");
      }
      const [a, b] = await ctx.embeddings.embed([ctx.output, expected]);
      const sim = cosineSimilarity(a, b);
      const passed = sim >= threshold;
      return result("semantic-similarity", passed, sim, `Cosine similarity ${sim.toFixed(3)} (threshold ${threshold})`, {
        threshold,
        detail: { expected, similarity: sim },
      });
    },
  };
}
