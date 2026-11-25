/**
 * LLM Eval & Guardrails Framework — public API.
 *
 * A harness for testing LLM, RAG, and agentic applications: assertions beyond
 * exact match (semantic similarity, JSON schema, RAG groundedness), confidence
 * metrics, snapshot-based regression detection, trace ids linking prompt /
 * context / response, and a CI quality gate that blocks deploys on quality drop.
 */

// Config
export { loadConfig, type AppConfig } from "./config";

// Core types
export type {
  ChatMessage,
  CompletionOptions,
  CompletionResult,
  LLMProvider,
  EmbeddingProvider,
  VectorStore,
  VectorDocument,
  RetrievalResult,
  Assertion,
  AssertionContext,
  AssertionResult,
  EvalCase,
  CaseResult,
  EvalRunResult,
  Judge,
  JudgeRequest,
  JudgeVerdict,
} from "./types";

// Providers
export { MockLLMProvider, type MockResponder } from "./providers/llm/mock";
export { OpenAICompatibleProvider } from "./providers/llm/openai-compatible";
export { AnthropicProvider } from "./providers/llm/anthropic";
export { createLLMProvider } from "./providers/llm/factory";
export { ReplayLLMProvider, RecordingLLMProvider } from "./providers/llm/replay";

// Judges (LLM-as-judge and recorded verdicts)
export { LLMJudge, RecordedJudge, RecordingJudge, parseJudgeReply, normalizeJudgeScore } from "./judge/judge";

// Datasets (declarative JSONL cases + recorded response sets)
export { loadDataset, loadResponseSet, saveResponseSet, missingOutputs, compileAssertion } from "./dataset/loader";
export { CaseSpec, AssertionSpec, ResponseSet, type ResponseSetT } from "./dataset/schema";

// Embeddings
export { LocalEmbeddingProvider } from "./providers/embeddings/local";
export { OpenAIEmbeddingProvider } from "./providers/embeddings/openai-compatible";
export { createEmbeddingProvider } from "./providers/embeddings/factory";
export { cosineSimilarity, l2normalize } from "./providers/embeddings/base";

// Vector stores
export { MemoryVectorStore } from "./vectorstore/memory";
export { PgVectorStore } from "./vectorstore/pgvector";
export { QdrantVectorStore } from "./vectorstore/qdrant";
export { createVectorStore } from "./vectorstore/factory";

// Assertions
export * from "./assertions/index";

// Tracing
export { TraceStore, type TraceRecord, type TraceHandle } from "./trace/trace";

// Eval
export { EvalRunner, type EvalRunnerOptions } from "./eval/runner";
export { computeConfidence } from "./eval/confidence";
export { renderConsoleReport, toJsonReport, renderMarkdownSummary } from "./eval/report";

// Snapshot / regression
export {
  SnapshotStore,
  snapshotFromRun,
  type Snapshot,
  type SnapshotCase,
} from "./snapshot/snapshot-store";
export {
  detectRegressions,
  type RegressionReport,
  type CaseDelta,
  type RegressionOptions,
} from "./snapshot/regression";

// Guardrail
export {
  evaluateGate,
  type GateThresholds,
  type GateResult,
  type GateViolation,
} from "./guardrail/quality-gate";
