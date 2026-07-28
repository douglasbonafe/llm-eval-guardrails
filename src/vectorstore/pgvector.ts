import type { RetrievalResult, VectorDocument, VectorStore } from "../types";

export interface PgVectorConfig {
  connectionString: string;
  table?: string;
  dimensions: number;
}

/**
 * PostgreSQL + pgvector adapter. `pg` and `pgvector` are optional dependencies;
 * they are imported lazily so the core framework installs and runs without them.
 */
export class PgVectorStore implements VectorStore {
  readonly name = "pgvector";
  private readonly table: string;
  private pool: any;
  private registerType: ((client: any) => Promise<void>) | undefined;
  private toSql: ((v: number[]) => string) | undefined;

  constructor(private readonly cfg: PgVectorConfig) {
    this.table = cfg.table ?? "llm_eval_documents";
  }

  private async init(): Promise<void> {
    if (this.pool) return;
    let pg: any;
    let pgvector: any;
    try {
      pg = await import("pg");
      pgvector = await import("pgvector/pg");
    } catch {
      throw new Error(
        "VECTOR_STORE=pgvector needs the optional deps 'pg' and 'pgvector'. Install with: npm i pg pgvector",
      );
    }
    this.registerType = pgvector.registerType ?? pgvector.default?.registerType;
    this.toSql = pgvector.toSql ?? pgvector.default?.toSql;

    this.pool = new pg.Pool({ connectionString: this.cfg.connectionString });
    const client = await this.pool.connect();
    try {
      await client.query("CREATE EXTENSION IF NOT EXISTS vector");
      if (this.registerType) await this.registerType(client);
      await client.query(
        `CREATE TABLE IF NOT EXISTS ${this.table} (
           id text PRIMARY KEY,
           text text NOT NULL,
           metadata jsonb,
           embedding vector(${this.cfg.dimensions})
         )`,
      );
    } finally {
      client.release();
    }
  }

  async upsert(docs: VectorDocument[]): Promise<void> {
    await this.init();
    const client = await this.pool.connect();
    try {
      if (this.registerType) await this.registerType(client);
      for (const d of docs) {
        await client.query(
          `INSERT INTO ${this.table} (id, text, metadata, embedding)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (id) DO UPDATE
             SET text = EXCLUDED.text, metadata = EXCLUDED.metadata, embedding = EXCLUDED.embedding`,
          [d.id, d.text, d.metadata ?? {}, this.toSql!(d.embedding)],
        );
      }
    } finally {
      client.release();
    }
  }

  async search(embedding: number[], topK: number): Promise<RetrievalResult[]> {
    await this.init();
    const client = await this.pool.connect();
    try {
      if (this.registerType) await this.registerType(client);
      // 1 - cosine_distance = cosine similarity.
      const res = await client.query(
        `SELECT id, text, metadata, 1 - (embedding <=> $1) AS score
           FROM ${this.table}
          ORDER BY embedding <=> $1
          LIMIT $2`,
        [this.toSql!(embedding), topK],
      );
      return res.rows.map((r: any) => ({
        id: r.id,
        text: r.text,
        score: Number(r.score),
        metadata: r.metadata,
      }));
    } finally {
      client.release();
    }
  }

  async close(): Promise<void> {
    if (this.pool) await this.pool.end();
  }
}
