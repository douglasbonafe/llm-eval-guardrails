import type { EvalRunResult } from "../types";
import { snapshotFromRun, type Snapshot } from "./snapshot-store";

export interface CaseDelta {
  caseId: string;
  baselinePassed: boolean;
  currentPassed: boolean;
  baselineScore: number;
  currentScore: number;
  scoreDelta: number;
}

export interface RegressionReport {
  /** Cases that passed in baseline but fail now, or whose score dropped past tolerance. */
  regressions: CaseDelta[];
  /** Cases that failed in baseline but pass now. */
  improvements: CaseDelta[];
  /** Cases present now but not in the baseline. */
  added: string[];
  /** Cases in the baseline but missing now. */
  removed: string[];
  /** Cases whose output text changed (even if pass/fail is unchanged). */
  outputChanged: string[];
  hasRegressions: boolean;
}

export interface RegressionOptions {
  /** A score drop larger than this on a still-passing case counts as a regression. Default 0.1. */
  scoreDropTolerance?: number;
}

/**
 * Compares a current run against a baseline snapshot to detect regressions.
 * This is what turns "the tests passed" into "quality did not drop versus the
 * last known-good version".
 */
export function detectRegressions(
  baseline: Snapshot,
  current: EvalRunResult,
  opts: RegressionOptions = {},
): RegressionReport {
  const tolerance = opts.scoreDropTolerance ?? 0.1;
  const currentSnap = snapshotFromRun(current, current.runId);

  const regressions: CaseDelta[] = [];
  const improvements: CaseDelta[] = [];
  const outputChanged: string[] = [];
  const added: string[] = [];
  const removed: string[] = [];

  for (const [caseId, cur] of Object.entries(currentSnap.cases)) {
    const base = baseline.cases[caseId];
    if (!base) {
      added.push(caseId);
      continue;
    }
    const delta: CaseDelta = {
      caseId,
      baselinePassed: base.passed,
      currentPassed: cur.passed,
      baselineScore: base.score,
      currentScore: cur.score,
      scoreDelta: Number((cur.score - base.score).toFixed(4)),
    };

    const brokePassFail = base.passed && !cur.passed;
    const scoreRegressed = cur.passed && base.passed && base.score - cur.score > tolerance;
    if (brokePassFail || scoreRegressed) regressions.push(delta);
    else if (!base.passed && cur.passed) improvements.push(delta);

    if (base.output !== cur.output) outputChanged.push(caseId);
  }

  for (const caseId of Object.keys(baseline.cases)) {
    if (!currentSnap.cases[caseId]) removed.push(caseId);
  }

  return {
    regressions,
    improvements,
    added,
    removed,
    outputChanged,
    hasRegressions: regressions.length > 0,
  };
}
