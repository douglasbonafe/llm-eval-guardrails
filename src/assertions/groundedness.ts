import { cosineSimilarity } from "../providers/embeddings/base";
import type { Assertion, AssertionContext } from "../types";
import { result } from "./base";

export interface GroundednessOptions {
  /** Per-claim support threshold — a claim counts as grounded if its best
   *  similarity to any context chunk is >= this. Default 0.6. */
  claimSupportThreshold?: number;
  /** Overall pass threshold on the fraction of grounded claims. Default 0.8. */
  threshold?: number;
}

/** Naive sentence/claim splitter. Good enough for faithfulness scoring. */
function splitClaims(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 8);
}

/**
 * RAG groundedness / faithfulness assertion.
 *
 * Breaks the answer into claims and checks each is supported by the retrieved
 * context (max cosine similarity to any context chunk). Flags hallucinations:
 * claims with no supporting context. Requires context and an embedding provider.
 */
export function grounded(opts: GroundednessOptions = {}): Assertion {
  const claimThreshold = opts.claimSupportThreshold ?? 0.6;
  const passThreshold = opts.threshold ?? 0.8;

  return {
    type: "groundedness",
    async evaluate(ctx: AssertionContext) {
      if (!ctx.embeddings) {
        throw new Error("groundedness assertion requires an embedding provider (pass one to the runner).");
      }
      const context = ctx.context ?? [];
      if (context.length === 0) {
        return result("groundedness", false, 0, "No retrieved context provided — cannot verify grounding", {
          threshold: passThreshold,
        });
      }

      const claims = splitClaims(ctx.output);
      if (claims.length === 0) {
        return result("groundedness", false, 0, "No verifiable claims found in output", { threshold: passThreshold });
      }

      const contextVecs = await ctx.embeddings.embed(context);
      const claimVecs = await ctx.embeddings.embed(claims);

      const perClaim = claims.map((claim, i) => {
        let best = -1;
        let bestIdx = -1;
        for (let c = 0; c < contextVecs.length; c++) {
          const sim = cosineSimilarity(claimVecs[i], contextVecs[c]);
          if (sim > best) {
            best = sim;
            bestIdx = c;
          }
        }
        return { claim, support: best, supportedByChunk: bestIdx, grounded: best >= claimThreshold };
      });

      const groundedCount = perClaim.filter((c) => c.grounded).length;
      const fraction = groundedCount / claims.length;
      const passed = fraction >= passThreshold;
      const unsupported = perClaim.filter((c) => !c.grounded).map((c) => c.claim);

      return result(
        "groundedness",
        passed,
        fraction,
        `${groundedCount}/${claims.length} claims grounded (${(fraction * 100).toFixed(0)}%, threshold ${(passThreshold * 100).toFixed(0)}%)`,
        {
          threshold: passThreshold,
          detail: { perClaim, unsupportedClaims: unsupported },
        },
      );
    },
  };
}
