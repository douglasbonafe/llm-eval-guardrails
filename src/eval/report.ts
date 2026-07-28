import chalk from "chalk";
import type { EvalRunResult } from "../types";

/** Render an eval run as a human-readable console report. */
export function renderConsoleReport(run: EvalRunResult): string {
  const lines: string[] = [];
  lines.push(chalk.bold(`\nLLM Eval Report — run ${run.runId}`));
  lines.push(chalk.gray(`${run.startedAt} → ${run.finishedAt}`));
  lines.push("");

  for (const c of run.cases) {
    const badge = c.passed ? chalk.green("PASS") : chalk.red("FAIL");
    lines.push(`${badge} ${chalk.bold(c.caseId)}  score=${c.score.toFixed(2)} conf=${c.confidence.toFixed(2)} ${chalk.gray(`trace=${c.traceId}`)}`);
    if (c.error) lines.push(`     ${chalk.red("error:")} ${c.error}`);
    for (const a of c.assertions) {
      const mark = a.passed ? chalk.green("✓") : chalk.red("✗");
      lines.push(`     ${mark} ${a.type}: ${a.message}`);
    }
  }

  lines.push("");
  const rate = `${(run.passRate * 100).toFixed(1)}%`;
  const summary = `${run.passed}/${run.total} passed (${rate})  meanScore=${run.meanScore.toFixed(2)}  meanConfidence=${run.meanConfidence.toFixed(2)}`;
  lines.push(run.failed === 0 ? chalk.green.bold(summary) : chalk.yellow.bold(summary));
  return lines.join("\n");
}

/** Machine-readable JSON report (for CI artifacts). */
export function toJsonReport(run: EvalRunResult): string {
  return JSON.stringify(run, null, 2);
}
