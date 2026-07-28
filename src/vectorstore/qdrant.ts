import { createHash } from "node:crypto";
import type { RetrievalResult, VectorDocument, VectorStore } from "../types";

export interface QdrantConfig {
  url: string;
  apiKey?: string;
  collection?: string;
  dimensions: number;
}

/**
 * Qdrant adapter. `@qdrant/js-client-rest` is an optional dependency, imported
 * lazily so the core framework installs and runs without it.
 */
export class QdrantVectorStore implements VectorStore {
  readonly name = "qdrant";
  private readonly collection: string;
  private client: any;

  constructor(private readonly cfg: QdrantConfig) {
    this.collection = cfg.collection ?? "llm_eval_documents";
  }

  private async init(): Promise<void> {
    if (this.client) return;
    let mod: any;
    try {
      mod = await import("@qdrant/js-client-rest");
    } catch {
      throw new Error(
        "VECTOR_STORE=qdrant needs the optional dep '@qdrant/js-client-rest'. Install with: npm i @qdrant/js-client-rest",
      );
    }
    const QdrantClient = mod.QdrantClient ?? mod.default?.QdrantClient;
    this.client = new QdrantClient({ url: this.cfg.url, apiKey: this.cfg.apiKey });

    const existing = await this.client.getCollections();
    const names = (existing.collections ?? []).map((c: any) => c.name);
    if (!names.includes(this.collection)) {
      await this.client.createCollection(this.collection, {
        vectors: { size: this.cfg.dimensions, distance: "Cosine" },
      });
    }
  }

  /** Qdrant point ids must be uint or UUID; hash string ids to a stable UUID. */
  private toPointId(id: string): string {
    const h = createHash("md5").update(id).digest("hex");
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
  }

  async upsert(docs: VectorDocument[]): Promise<void> {
    await this.init();
    await this.client.upsert(this.collection, {
      wait: true,
      points: docs.map((d) => ({
        id: this.toPointId(d.id),
        vector: d.embedding,
        payload: { originalId: d.id, text: d.text, metadata: d.metadata ?? {} },
      })),
    });
  }

  async search(embedding: number[], topK: number): Promise<RetrievalResult[]> {
    await this.init();
    const res = await this.client.search(this.collection, { vector: embedding, limit: topK, with_payload: true });
    return res.map((hit: any) => ({
      id: hit.payload?.originalId ?? String(hit.id),
      text: hit.payload?.text ?? "",
      score: hit.score,
      metadata: hit.payload?.metadata,
    }));
  }
}
