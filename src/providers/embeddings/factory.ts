import type { AppConfig } from "../../config";
import type { EmbeddingProvider } from "../../types";
import { LocalEmbeddingProvider } from "./local";
import { OpenAIEmbeddingProvider } from "./openai-compatible";

/** Builds an embedding provider from validated config. */
export function createEmbeddingProvider(config: AppConfig): EmbeddingProvider {
  if (config.embeddingProvider === "openai") {
    if (!config.embeddingApiKey) {
      throw new Error(
        "EMBEDDING_PROVIDER=openai requires EMBEDDING_API_KEY. Get one at https://platform.openai.com/api-keys, or use EMBEDDING_PROVIDER=local for offline embeddings.",
      );
    }
    return new OpenAIEmbeddingProvider({
      apiKey: config.embeddingApiKey,
      baseURL: config.embeddingBaseUrl || undefined,
      model: config.embeddingModel,
    });
  }
  return new LocalEmbeddingProvider();
}
