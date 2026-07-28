import { config as loadDotenv } from "dotenv";
import { z } from "zod";

// Load .env first (real secrets), then fall back to .env.local (the committed
// example template). Values already set in the real environment win.
loadDotenv();
loadDotenv({ path: ".env.local" });

const num = (fallback: number) =>
  z
    .string()
    .optional()
    .transform((v) => (v === undefined || v === "" ? fallback : Number(v)))
    .pipe(z.number());

const ConfigSchema = z.object({
  llmProvider: z.enum(["mock", "openai", "anthropic"]).default("mock"),
  llmBaseUrl: z.string().optional(),
  llmApiKey: z.string().optional(),
  llmModel: z.string().default("llama-3.3-70b-versatile"),
  llmTemperature: num(0),

  anthropicApiKey: z.string().optional(),
  anthropicModel: z.string().default("claude-3-5-haiku-20241022"),

  embeddingProvider: z.enum(["local", "openai"]).default("local"),
  embeddingBaseUrl: z.string().optional(),
  embeddingApiKey: z.string().optional(),
  embeddingModel: z.string().default("text-embedding-3-small"),

  vectorStore: z.enum(["memory", "pgvector", "qdrant"]).default("memory"),
  pgvectorUrl: z.string().optional(),
  qdrantUrl: z.string().optional(),
  qdrantApiKey: z.string().optional(),

  gateMinPassRate: num(0.9),
  gateMinConfidence: num(0.6),
  gateMaxRegressions: num(0),
  snapshotDir: z.string().default(".llm-eval/snapshots"),
});

export type AppConfig = z.infer<typeof ConfigSchema>;

/**
 * Reads and validates configuration from the environment.
 * Pass overrides to bypass env entirely (useful in tests).
 */
export function loadConfig(overrides: Partial<Record<string, string>> = {}): AppConfig {
  const env = { ...process.env, ...overrides };
  return ConfigSchema.parse({
    llmProvider: env.LLM_PROVIDER,
    llmBaseUrl: env.LLM_BASE_URL,
    llmApiKey: env.LLM_API_KEY,
    llmModel: env.LLM_MODEL,
    llmTemperature: env.LLM_TEMPERATURE,

    anthropicApiKey: env.ANTHROPIC_API_KEY,
    anthropicModel: env.ANTHROPIC_MODEL,

    embeddingProvider: env.EMBEDDING_PROVIDER,
    embeddingBaseUrl: env.EMBEDDING_BASE_URL,
    embeddingApiKey: env.EMBEDDING_API_KEY,
    embeddingModel: env.EMBEDDING_MODEL,

    vectorStore: env.VECTOR_STORE,
    pgvectorUrl: env.PGVECTOR_URL,
    qdrantUrl: env.QDRANT_URL,
    qdrantApiKey: env.QDRANT_API_KEY,

    gateMinPassRate: env.GATE_MIN_PASS_RATE,
    gateMinConfidence: env.GATE_MIN_CONFIDENCE,
    gateMaxRegressions: env.GATE_MAX_REGRESSIONS,
    snapshotDir: env.SNAPSHOT_DIR,
  });
}
