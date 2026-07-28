import type { AppConfig } from "../config";
import type { VectorStore } from "../types";
import { MemoryVectorStore } from "./memory";
import { PgVectorStore } from "./pgvector";
import { QdrantVectorStore } from "./qdrant";

/** Builds a vector store from validated config. `dimensions` must match the embedding provider. */
export function createVectorStore(config: AppConfig, dimensions: number): VectorStore {
  if (config.vectorStore === "pgvector") {
    if (!config.pgvectorUrl) throw new Error("VECTOR_STORE=pgvector requires PGVECTOR_URL. See .env.local.");
    return new PgVectorStore({ connectionString: config.pgvectorUrl, dimensions });
  }
  if (config.vectorStore === "qdrant") {
    if (!config.qdrantUrl) throw new Error("VECTOR_STORE=qdrant requires QDRANT_URL. See .env.local.");
    return new QdrantVectorStore({ url: config.qdrantUrl, apiKey: config.qdrantApiKey, dimensions });
  }
  return new MemoryVectorStore();
}
