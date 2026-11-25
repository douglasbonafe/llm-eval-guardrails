import chalk from "chalk";
import type { EvalRunResult } from "../types";
import type { GateResult } from "../guardrail/quality-gate";
import type { RegressionReport } from "../snapshot/regression";

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

/** Markdown summary for CI (append to $GITHUB_STEP_SUMMARY). */
export function renderMarkdownSummary(run: EvalRunResult, gate: GateResult, regression?: RegressionReport, label = ""): string {
  const L: string[] = [];
  L.push(`## LLM quality gate${label ? ` - ${label}` : ""}: ${gate.passed ? "PASSED" : "FAILED"}`);
  L.push("");
  L.push("| Metric | Value |", "|---|---|");
  L.push(`| Cases | ${run.total} |`, `| Pass rate | ${(run.passRate * 100).toFixed(1)}% (${run.passed}/${run.total}) |`);
  L.push(`| Mean score | ${run.meanScore.toFixed(2)} |`, `| Mean confidence | ${run.meanConfidence.toFixed(2)} |`);
  if (regression) L.push(`| Regressions vs baseline | ${regression.regressions.length} |`);

  const byTag = new Map<string, { n: number; ok: number }>();
  for (const c of run.cases) {
    for (const t of c.tags ?? []) {
      const e = byTag.get(t) ?? { n: 0, ok: 0 };
      e.n += 1;
      if (c.passed) e.ok += 1;
      byTag.set(t, e);
    }
  }
  if (byTag.size) {
    L.push("", "| Tag | Passed |", "|---|---|");
    for (const [t, e] of [...byTag].sort()) L.push(`| ${t} | ${e.ok}/${e.n} |`);
  }
  if (gate.violations.length) {
    L.push("", "**Violations**");
    for (const v of gate.violations) L.push(`- ${v.message}`);
  }
  const failed = run.cases.filter((c) => !c.passed);
  if (failed.length) {
    L.push("", "**Failing cases**", "", "| Case | Why |", "|---|---|");
    for (const c of failed) {
      const why = c.error ?? c.assertions.filter((a) => !a.passed).map((a) => `${a.type}: ${a.message}`).join("; ");
      L.push(`| ${c.caseId} | ${why.replace(/\|/g, "\\|").replace(/\n/g, " ")} |`);
    }
  }
  return L.join("\n") + "\n";
}
