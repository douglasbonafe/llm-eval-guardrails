#!/usr/bin/env node
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import chalk from "chalk";
import { Command } from "commander";
import { loadConfig } from "./config";
import { createEmbeddingProvider } from "./providers/embeddings/factory";
import { createLLMProvider } from "./providers/llm/factory";
import { EvalRunner } from "./eval/runner";
import { renderConsoleReport, toJsonReport } from "./eval/report";
import { SnapshotStore, snapshotFromRun } from "./snapshot/snapshot-store";
import { detectRegressions } from "./snapshot/regression";
import { evaluateGate } from "./guardrail/quality-gate";
import type { EmbeddingProvider, EvalCase, LLMProvider } from "./types";
import { writeFileSync } from "node:fs";

interface SuiteModule {
  cases: EvalCase[];
  llm?: LLMProvider;
  embeddings?: EmbeddingProvider;
}

async function loadSuite(path: string): Promise<SuiteModule> {
  const abs = resolve(process.cwd(), path);
  const mod = await import(pathToFileURL(abs).href);
  const suite = (mod.default ?? mod) as SuiteModule;
  if (!suite?.cases || !Array.isArray(suite.cases)) {
    throw new Error(`Suite "${path}" must export { cases: EvalCase[] } (as default or named export).`);
  }
  return suite;
}

const program = new Command();
program
  .name("llm-guardrail")
  .description("Run LLM/RAG evals and enforce a CI quality gate")
  .version("1.0.0");

program
  .command("gate")
  .description("Run an eval suite and enforce the quality gate (exit 1 on failure)")
  .requiredOption("-s, --suite <path>", "path to a suite module exporting { cases }")
  .option("-b, --baseline <version>", "snapshot version to check regressions against")
  .option("--update-baseline <version>", "save this run as the named baseline snapshot")
  .option("--report <path>", "write the full JSON report to this file")
  .option("--min-pass-rate <n>", "override GATE_MIN_PASS_RATE")
  .option("--min-confidence <n>", "override GATE_MIN_CONFIDENCE")
  .option("--max-regressions <n>", "override GATE_MAX_REGRESSIONS")
  .action(async (opts) => {
    const config = loadConfig();
    const suite = await loadSuite(opts.suite);
    const llm = suite.llm ?? createLLMProvider(config);
    const embeddings = suite.embeddings ?? createEmbeddingProvider(config);

    const runner = new EvalRunner({ llm, embeddings });
    const run = await runner.run(suite.cases);
    console.log(renderConsoleReport(run));

    if (opts.report) {
      writeFileSync(opts.report, toJsonReport(run), "utf8");
      console.log(chalk.gray(`\nJSON report written to ${opts.report}`));
    }

    const store = new SnapshotStore(config.snapshotDir);
    let regression;
    if (opts.baseline) {
      const baseline = store.load(opts.baseline);
      if (!baseline) {
        console.log(chalk.yellow(`\nNo baseline "${opts.baseline}" found — skipping regression check.`));
      } else {
        regression = detectRegressions(baseline, run);
        printRegression(regression);
      }
    }

    if (opts.updateBaseline) {
      const p = store.save(snapshotFromRun(run, opts.updateBaseline));
      console.log(chalk.gray(`Baseline "${opts.updateBaseline}" saved to ${p}`));
    }

    const gate = evaluateGate(
      run,
      {
        minPassRate: opts.minPassRate !== undefined ? Number(opts.minPassRate) : config.gateMinPassRate,
        minConfidence: opts.minConfidence !== undefined ? Number(opts.minConfidence) : config.gateMinConfidence,
        maxRegressions: opts.maxRegressions !== undefined ? Number(opts.maxRegressions) : config.gateMaxRegressions,
      },
      regression,
    );

    console.log("");
    if (gate.passed) {
      console.log(chalk.green.bold(gate.summary));
    } else {
      console.log(chalk.red.bold(gate.summary));
      for (const v of gate.violations) console.log(chalk.red(`  • ${v.message}`));
    }
    process.exit(gate.passed ? 0 : 1);
  });

program
  .command("snapshot")
  .description("Run a suite and save the outcome as a baseline snapshot")
  .requiredOption("-s, --suite <path>", "path to a suite module exporting { cases }")
  .requiredOption("-v, --version <version>", "baseline version label to save as")
  .action(async (opts) => {
    const config = loadConfig();
    const suite = await loadSuite(opts.suite);
    const llm = suite.llm ?? createLLMProvider(config);
    const embeddings = suite.embeddings ?? createEmbeddingProvider(config);
    const run = await new EvalRunner({ llm, embeddings }).run(suite.cases);
    const store = new SnapshotStore(config.snapshotDir);
    const p = store.save(snapshotFromRun(run, opts.version));
    console.log(chalk.green(`Snapshot "${opts.version}" saved to ${p} (${run.total} cases).`));
  });

function printRegression(regression: ReturnType<typeof detectRegressions>): void {
  console.log(chalk.bold("\nRegression vs baseline:"));
  console.log(`  regressions: ${regression.regressions.length}  improvements: ${regression.improvements.length}  added: ${regression.added.length}  removed: ${regression.removed.length}`);
  for (const r of regression.regressions) {
    console.log(chalk.red(`  ✗ ${r.caseId}: pass ${r.baselinePassed}→${r.currentPassed}, score ${r.baselineScore.toFixed(2)}→${r.currentScore.toFixed(2)}`));
  }
}

program.parseAsync(process.argv).catch((e) => {
  console.error(chalk.red(`Error: ${(e as Error).message}`));
  process.exit(2);
});
