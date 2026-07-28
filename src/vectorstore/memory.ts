import { cosineSimilarity } from "../providers/embeddings/base";
import type { RetrievalResult, VectorDocument, VectorStore } from "../types";

/**
 * In-process vector store using brute-force cosine search. Zero dependencies,
 * zero services — the default so the RAG examples and tests run anywhere.
 * Fine up to a few thousand docs; use pgvector/qdrant beyond that.
 */
export class MemoryVectorStore implements VectorStore {
  readonly name = "memory";
  private readonly docs = new Map<string, VectorDocument>();

  async upsert(docs: VectorDocument[]): Promise<void> {
    for (const d of docs) this.docs.set(d.id, d);
  }

  async search(embedding: number[], topK: number): Promise<RetrievalResult[]> {
    const scored: RetrievalResult[] = [];
    for (const d of this.docs.values()) {
      scored.push({
        id: d.id,
        text: d.text,
        score: cosineSimilarity(embedding, d.embedding),
        metadata: d.metadata,
      });
    }
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, topK);
  }

  size(): number {
    return this.docs.size;
  }
}
