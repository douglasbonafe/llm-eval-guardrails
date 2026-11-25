/**
 * Core shared types for the LLM Eval & Guardrails framework.
 */

/** A single chat message sent to an LLM provider. */
export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/** Options for a single LLM completion call. */
export interface CompletionOptions {
  messages: ChatMessage[];
  model?: string;
  temperature?: number;
  maxTokens?: number;
  /** Id of the eval case being run. Replay/recording providers key on it. */
  caseId?: string;
}

/** Normalized completion result across providers. */
export interface CompletionResult {
  text: string;
  model: string;
  /** Raw token usage when the provider reports it. */
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
  /** Provider-reported per-token logprobs, when available (used for confidence). */
  avgLogprob?: number;
}

/** Contract every chat/completions provider implements. */
export interface LLMProvider {
  readonly name: string;
  complete(options: CompletionOptions): Promise<CompletionResult>;
}

/** Contract every embedding backend implements. */
export interface EmbeddingProvider {
  readonly name: string;
  readonly dimensions: number;
  embed(texts: string[]): Promise<number[][]>;
  embedOne(text: string): Promise<number[]>;
}

/** A document stored in a vector store. */
export interface VectorDocument {
  id: string;
  text: string;
  embedding: number[];
  metadata?: Record<string, unknown>;
}

/** A retrieval hit from a vector store. */
export interface RetrievalResult {
  id: string;
  text: string;
  score: number;
  metadata?: Record<string, unknown>;
}

/** Contract every vector store adapter implements. */
export interface VectorStore {
  readonly name: string;
  upsert(docs: VectorDocument[]): Promise<void>;
  search(embedding: number[], topK: number): Promise<RetrievalResult[]>;
  close?(): Promise<void>;
}

/** Outcome of one assertion against a model output. */
export interface AssertionResult {
  /** Assertion type identifier, e.g. "semantic-similarity". */
  type: string;
  passed: boolean;
  /** Normalized 0..1 score. 1 = perfect, 0 = worst. */
  score: number;
  /** The pass threshold this assertion was evaluated against, when relevant. */
  threshold?: number;
  /** Human-readable explanation, useful in reports. */
  message: string;
  /** Optional extra structured detail for debugging. */
  detail?: Record<string, unknown>;
}

/** A single evaluation case: an input plus the assertions its output must satisfy. */
export interface EvalCase {
  /** Stable id — also used as the snapshot key for regression detection. */
  id: string;
  /** Optional human description. */
  description?: string;
  /** Messages sent to the model under test. */
  input: ChatMessage[];
  /** Assertions the produced output must satisfy. */
  assertions: Assertion[];
  /** Optional retrieved context (RAG). Enables groundedness assertions. */
  context?: string[];
  /** Optional tags for filtering / grouping in reports. */
  tags?: string[];
}

/** An assertion is a named check that scores a model output. */
export interface Assertion {
  readonly type: string;
  evaluate(ctx: AssertionContext): Promise<AssertionResult> | AssertionResult;
}

/** Everything an assertion may need to score an output. */
export interface AssertionContext {
  /** The model output being judged. */
  output: string;
  /** Retrieved context for RAG assertions. */
  context?: string[];
  /** Shared embedding provider (semantic / groundedness assertions). */
  embeddings?: EmbeddingProvider;
  /** The full completion result, when confidence signals are needed. */
  completion?: CompletionResult;
  /** Id of the case being evaluated (judges that replay verdicts key on it). */
  caseId?: string;
  /** The messages that produced the output (rubric judging). */
  input?: ChatMessage[];
  /** Judge used by rubric assertions. Absent => rubric assertions fail loudly. */
  judge?: Judge;
}

/** A verdict from a judge, normalized to 0..1. */
export interface JudgeVerdict {
  score: number;
  reason: string;
}

export interface JudgeRequest {
  caseId: string;
  criteria: string;
  input: ChatMessage[];
  output: string;
  context?: string[];
}

/** Grades an output against written criteria (LLM-as-judge or a recorded verdict). */
export interface Judge {
  readonly name: string;
  grade(req: JudgeRequest): Promise<JudgeVerdict>;
}

/** Result of evaluating one case. */
export interface CaseResult {
  caseId: string;
  traceId: string;
  passed: boolean;
  /** Mean assertion score for the case (0..1). */
  score: number;
  /** Confidence that the verdict is reliable (0..1). */
  confidence: number;
  output: string;
  assertions: AssertionResult[];
  tags?: string[];
  /** Wall-clock time for the case in milliseconds. */
  durationMs: number;
  error?: string;
}

/** Aggregate result of an eval run over many cases. */
export interface EvalRunResult {
  runId: string;
  startedAt: string;
  finishedAt: string;
  total: number;
  passed: number;
  failed: number;
  passRate: number;
  meanScore: number;
  meanConfidence: number;
  cases: CaseResult[];
}
