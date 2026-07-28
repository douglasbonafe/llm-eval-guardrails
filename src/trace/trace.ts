import { randomUUID } from "node:crypto";

/**
 * A trace links a prompt, its retrieved context, and the model response under a
 * single id so any eval result can be reconstructed end to end. This is the
 * backbone of the framework's traceability guarantee.
 */
export interface TraceRecord {
  traceId: string;
  caseId: string;
  createdAt: string;
  prompt: unknown;
  context?: string[];
  response?: string;
  model?: string;
  /** Free-form annotations added during evaluation. */
  annotations: Record<string, unknown>;
}

export interface TraceHandle {
  readonly traceId: string;
  setResponse(response: string, model?: string): void;
  annotate(key: string, value: unknown): void;
  record(): TraceRecord;
}

/**
 * In-memory trace store. One per eval run. Deterministic when a fixed id
 * generator is injected (used in tests).
 */
export class TraceStore {
  private readonly traces = new Map<string, TraceRecord>();

  constructor(private readonly idGen: () => string = randomUUID) {}

  start(params: { caseId: string; prompt: unknown; context?: string[]; now?: () => string }): TraceHandle {
    const now = params.now ?? (() => new Date().toISOString());
    const traceId = this.idGen();
    const record: TraceRecord = {
      traceId,
      caseId: params.caseId,
      createdAt: now(),
      prompt: params.prompt,
      context: params.context,
      annotations: {},
    };
    this.traces.set(traceId, record);

    return {
      traceId,
      setResponse: (response: string, model?: string) => {
        record.response = response;
        record.model = model;
      },
      annotate: (key: string, value: unknown) => {
        record.annotations[key] = value;
      },
      record: () => ({ ...record }),
    };
  }

  get(traceId: string): TraceRecord | undefined {
    const r = this.traces.get(traceId);
    return r ? { ...r } : undefined;
  }

  all(): TraceRecord[] {
    return [...this.traces.values()].map((r) => ({ ...r }));
  }
}
