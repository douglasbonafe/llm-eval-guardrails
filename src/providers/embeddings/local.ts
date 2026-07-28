import { createHash } from "node:crypto";
import type { EmbeddingProvider } from "../../types";
import { l2normalize } from "./base";

/**
 * Deterministic local embeddings via feature hashing (the "hashing trick").
 *
 * No network, no API key, stable across machines and runs. It captures lexical
 * overlap between texts, which is enough to demo semantic-similarity and RAG
 * groundedness assertions offline and to keep CI green with zero secrets.
 * For production semantic quality, switch EMBEDDING_PROVIDER=openai.
 */
export class LocalEmbeddingProvider implements EmbeddingProvider {
  readonly name = "local";
  readonly dimensions: number;

  constructor(dimensions = 256) {
    this.dimensions = dimensions;
  }

  async embed(texts: string[]): Promise<number[][]> {
    return texts.map((t) => this.hashEmbed(t));
  }

  async embedOne(text: string): Promise<number[]> {
    return this.hashEmbed(text);
  }

  private tokenize(text: string): string[] {
    const tokens = text
      .toLowerCase()
      .replace(/[^a-z0-9À-ſ\s]/g, " ")
      .split(/\s+/)
      .filter(Boolean);
    // Add character bigrams to give short/near-miss texts some signal too.
    const bigrams: string[] = [];
    for (const tok of tokens) {
      for (let i = 0; i < tok.length - 1; i++) bigrams.push("_" + tok.slice(i, i + 2));
    }
    return [...tokens, ...bigrams];
  }

  private hashEmbed(text: string): number[] {
    const vec = new Array<number>(this.dimensions).fill(0);
    for (const token of this.tokenize(text)) {
      const h = createHash("md5").update(token).digest();
      const index = h.readUInt32BE(0) % this.dimensions;
      const sign = (h[4] & 1) === 0 ? 1 : -1;
      vec[index] += sign;
    }
    return l2normalize(vec);
  }
}
