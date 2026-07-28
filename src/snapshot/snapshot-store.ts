import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import type { EvalRunResult } from "../types";

/** A frozen record of one eval run's per-case outcomes, used as a regression baseline. */
export interface Snapshot {
  version: string;
  createdAt: string;
  cases: Record<string, SnapshotCase>;
}

export interface SnapshotCase {
  output: string;
  passed: boolean;
  score: number;
  confidence: number;
}

/** Reduce a full run to the minimal snapshot shape. */
export function snapshotFromRun(run: EvalRunResult, version: string, now: () => Date = () => new Date()): Snapshot {
  const cases: Record<string, SnapshotCase> = {};
  for (const c of run.cases) {
    cases[c.caseId] = { output: c.output, passed: c.passed, score: c.score, confidence: c.confidence };
  }
  return { version, createdAt: now().toISOString(), cases };
}

/** Persists and loads snapshots as JSON files on disk. */
export class SnapshotStore {
  constructor(private readonly dir: string) {}

  private path(version: string): string {
    return join(this.dir, `${sanitize(version)}.json`);
  }

  save(snapshot: Snapshot): string {
    mkdirSync(this.dir, { recursive: true });
    const p = this.path(snapshot.version);
    writeFileSync(p, JSON.stringify(snapshot, null, 2), "utf8");
    return p;
  }

  load(version: string): Snapshot | undefined {
    const p = this.path(version);
    if (!existsSync(p)) return undefined;
    return JSON.parse(readFileSync(p, "utf8")) as Snapshot;
  }

  exists(version: string): boolean {
    return existsSync(this.path(version));
  }
}

function sanitize(v: string): string {
  return v.replace(/[^a-zA-Z0-9._-]/g, "_");
}
