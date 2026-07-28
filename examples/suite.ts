/**
 * Example eval suite — runs fully offline (mock LLM + local embeddings).
 *
 * This is what the CI quality gate executes. It demonstrates every assertion
 * type. To evaluate a real model instead, delete the `llm`/`embeddings` exports
 * below and configure LLM_PROVIDER + keys in your .env (see .env.local).
 */
import {
  MockLLMProvider,
  LocalEmbeddingProvider,
  exactMatch,
  contains,
  jsonSchema,
  semanticSimilarity,
  grounded,
  z,
  type EvalCase,
} from "../src";

// Map each case's user prompt to the answer the mock "model" should return.
// Swapping this mock for a real provider is a one-line change.
const responses: Record<string, string> = {
  "What is the capital of France? Answer with a single word.": "Paris",
  "Write a one-line welcome message for a user named Douglas.":
    "Hello Douglas, welcome aboard — glad to have you here!",
  "Return a JSON object for a user with a name and an age.": '{"name":"Ada Lovelace","age":36}',
  "Explain what an API is in one sentence.":
    "An API is a contract that lets two programs communicate with each other.",
  "How tall is the Eiffel Tower and when was it completed?":
    "The Eiffel Tower stands 330 meters tall. It was completed in 1889.",
};

export const llm = new MockLLMProvider((opts) => {
  const user = [...opts.messages].reverse().find((m) => m.role === "user")?.content ?? "";
  return responses[user] ?? user;
});

export const embeddings = new LocalEmbeddingProvider();

export const cases: EvalCase[] = [
  {
    id: "capital-exact-match",
    description: "Exact-match assertion",
    input: [{ role: "user", content: "What is the capital of France? Answer with a single word." }],
    assertions: [exactMatch("Paris")],
    tags: ["text"],
  },
  {
    id: "welcome-contains",
    description: "Substring / keyword assertion",
    input: [{ role: "user", content: "Write a one-line welcome message for a user named Douglas." }],
    assertions: [contains(["Douglas", "welcome"], { caseInsensitive: true })],
    tags: ["text"],
  },
  {
    id: "user-json-schema",
    description: "JSON schema (structured output) assertion",
    input: [{ role: "user", content: "Return a JSON object for a user with a name and an age." }],
    assertions: [jsonSchema(z.object({ name: z.string(), age: z.number().int().positive() }))],
    tags: ["structured"],
  },
  {
    id: "api-semantic-similarity",
    description: "Semantic similarity (tolerates paraphrase)",
    input: [{ role: "user", content: "Explain what an API is in one sentence." }],
    assertions: [
      semanticSimilarity("An API is a contract that lets two programs talk to each other.", {
        threshold: 0.6,
      }),
    ],
    tags: ["semantic"],
  },
  {
    id: "eiffel-rag-groundedness",
    description: "RAG groundedness / faithfulness against retrieved context",
    input: [{ role: "user", content: "How tall is the Eiffel Tower and when was it completed?" }],
    context: [
      "The Eiffel Tower was completed in 1889 for the World's Fair.",
      "The Eiffel Tower stands 330 meters tall in Paris, France.",
    ],
    assertions: [grounded({ threshold: 0.7, claimSupportThreshold: 0.4 })],
    tags: ["rag"],
  },
];

export default { cases, llm, embeddings };
