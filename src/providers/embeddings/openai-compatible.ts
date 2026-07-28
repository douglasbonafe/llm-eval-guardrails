import OpenAI from "openai";
import type { EmbeddingProvider } from "../../types";

export interface OpenAIEmbeddingConfig {
  apiKey: string;
  baseURL?: string;
  model: string;
  /** Reported dimension count for the chosen model (text-embedding-3-small = 1536). */
  dimensions?: number;
}

/** Embeddings via OpenAI or any OpenAI-compatible embeddings endpoint. */
export class OpenAIEmbeddingProvider implements EmbeddingProvider {
  readonly name = "openai";
  readonly dimensions: number;
  private readonly client: OpenAI;
  private readonly model: string;

  constructor(cfg: OpenAIEmbeddingConfig) {
    this.model = cfg.model;
    this.dimensions = cfg.dimensions ?? 1536;
    this.client = new OpenAI({ apiKey: cfg.apiKey, baseURL: cfg.baseURL });
  }

  async embed(texts: string[]): Promise<number[][]> {
    const res = await this.client.embeddings.create({ model: this.model, input: texts });
    // Preserve input order (API returns objects with an index field).
    return res.data.sort((a, b) => a.index - b.index).map((d) => d.embedding as number[]);
  }

  async embedOne(text: string): Promise<number[]> {
    const [v] = await this.embed([text]);
    return v;
  }
}
