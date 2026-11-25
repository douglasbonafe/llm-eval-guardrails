#!/usr/bin/env node
import { appendFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import chalk from "chalk";
import { Command } from "commander";
import { loadConfig } from "./config";
import { loadDataset, loadResponseSet, missingOutputs, saveResponseSet } from "./dataset/loader";
import { evaluateGate } from "./guardrail/quality-gate";
import { LLMJudge, RecordedJudge, RecordingJudge } from "./judge/judge";
import { createEmbeddingProvider } from "./providers/embeddings/factory";
import { createLLMProvider } from "./providers/llm/factory";
import { RecordingLLMProvider, ReplayLLMProvider } from "./providers/llm/replay";
import { EvalRunner } from "./eval/runner";
import { renderConsoleReport, renderMarkdownSummary, toJsonReport } from "./eval/report";
import { detectRegressions } from "./snapshot/regression";
import { SnapshotStore, snapshotFromRun } from "./snapshot/snapshot-store";
import type { EmbeddingProvider, EvalCase, Judge, LLMProvider } from "./types";

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

interface Source {
  opts: { suite?: string; dataset?: string; responses?: string };
}

interface Runtime {
  cases: EvalCase[];
  llm: LLMProvider;
  embeddings: EmbeddingProvider;
  judge?: Judge;
  expectFail?: string[];
  label: string;
}

/**
 * Resolve what to run and what to run it against.
 *   --suite              a TS module (cases + optional providers)
 *   --dataset            declarative JSONL cases
 *     + --responses      replay recorded outputs (offline, deterministic)
 *     (no --responses)   call the live model from .env, judged by the same model
 */
async function buildRuntime({ opts }: Source): Promise<Runtime> {
  const config = loadConfig();
  if (!opts.suite && !opts.dataset) throw new Error("Pass --suite <module> or --dataset <path>.");
  if (opts.suite && opts.dataset) throw new Error("Pass only one of --suite and --dataset.");

  if (opts.suite) {
    const suite = await loadSuite(opts.suite);
    return {
      cases: suite.cases,
      llm: suite.llm ?? createLLMProvider(config),
      embeddings: suite.embeddings ?? createEmbeddingProvider(config),
      label: opts.suite,
    };
  }

  const cases = loadDataset(opts.dataset!);
  const embeddings = createEmbeddingProvider(config);

  if (opts.responses) {
    const set = loadResponseSet(opts.responses);
    const missing = missingOutputs(cases, set);
    if (missing.length) {
      throw new Error(`Response set "${set.name}" has no output for: ${missing.join(", ")}. Re-record it.`);
    }
    const extra = Object.keys(set.outputs).filter((id) => !cases.some((c) => c.id === id));
    if (extra.length) console.log(chalk.yellow(`Note: response set has outputs for unknown cases: ${extra.join(", ")}`));
    return {
      cases,
      llm: new ReplayLLMProvider(set.outputs, `replay:${set.name}`),
      embeddings,
      judge: set.judge ? new RecordedJudge(set.judge) : undefined,
      expectFail: set.expectFail,
      label: set.name,
    };
  }

  if (config.llmProvider === "mock") {
    throw new Error(
      "A dataset needs a real model or recorded outputs. Pass --responses <file>, or set LLM_PROVIDER and a key in .env (see .env.local).",
    );
  }
  const llm = createLLMProvider(config);
  return { cases, llm, embeddings, judge: new LLMJudge(llm), label: llm.name };
}

function addSourceOptions(cmd: Command): Command {
  return cmd
    .option("-s, --suite <path>", "path to a TS suite module exporting { cases }")
    .option("-d, --dataset <path>", "JSONL case file, or a directory of them")
    .option("-r, --responses <file>", "replay recorded outputs from this response set (offline)")
    .option("--snapshot-dir <dir>", "where baselines live (default SNAPSHOT_DIR)");
}

const program = new Command();
program
  .name("llm-guardrail")
  .description("Run LLM/RAG evals and enforce a CI quality gate")
  .version("1.1.0");

addSourceOptions(program.command("gate").description("Run an eval and enforce the quality gate (exit 1 on failure)"))
  .option("-b, --baseline <version>", "snapshot version to check regressions against")
  .option("--update-baseline <version>", "save this run as the named baseline snapshot")
  .option("--report <path>", "write the full JSON report to this file")
  .option("--summary <path>", "append a markdown summary (e.g. $GITHUB_STEP_SUMMARY)")
  .option("--min-pass-rate <n>", "override GATE_MIN_PASS_RATE")
  .option("--min-confidence <n>", "override GATE_MIN_CONFIDENCE")
  .option("--max-regressions <n>", "override GATE_MAX_REGRESSIONS")
  .option("--max-critical-failures <n>", 'failures allowed among cases tagged "critical" (default 0)')
  .option(
    "--expect-fail",
    "self-test: exit 0 only if the gate FAILS (and, if the response set lists expectFail, on exactly those cases)",
  )
  .action(async (opts) => {
    const config = loadConfig();
    const rt = await buildRuntime({ opts });
    const run = await new EvalRunner({ llm: rt.llm, embeddings: rt.embeddings, judge: rt.judge }).run(rt.cases);
    console.log(renderConsoleReport(run));

    if (opts.report) {
      writeFileSync(opts.report, toJsonReport(run), "utf8");
      console.log(chalk.gray(`\nJSON report written to ${opts.report}`));
    }

    const store = new SnapshotStore(opts.snapshotDir ?? config.snapshotDir);
    let regression;
    if (opts.baseline) {
      const baseline = store.load(opts.baseline);
      if (!baseline) {
        // A named baseline that is missing must not turn the check off silently.
        console.error(chalk.red(`\nBaseline "${opts.baseline}" not found. Create it with: snapshot --version ${opts.baseline}`));
        process.exit(2);
      }
      regression = detectRegressions(baseline, run);
      printRegression(regression);
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
        maxCriticalFailures: opts.maxCriticalFailures !== undefined ? Number(opts.maxCriticalFailures) : 0,
      },
      regression,
    );

    if (opts.summary) appendFileSync(opts.summary, renderMarkdownSummary(run, gate, regression, rt.label), "utf8");

    console.log("");
    if (gate.passed) {
      console.log(chalk.green.bold(gate.summary));
    } else {
      console.log(chalk.red.bold(gate.summary));
      for (const v of gate.violations) console.log(chalk.red(`  • ${v.message}`));
    }

    if (opts.expectFail) {
      const failedIds = run.cases.filter((c) => !c.passed).map((c) => c.caseId).sort();
      const expected = rt.expectFail ? [...rt.expectFail].sort() : undefined;
      const wrongSet = expected && JSON.stringify(expected) !== JSON.stringify(failedIds);
      if (gate.passed) {
        console.error(chalk.red.bold("\nSELF-TEST FAILED: the gate passed on a response set built to fail it."));
        process.exit(1);
      }
      if (wrongSet) {
        const missed = expected!.filter((id) => !failedIds.includes(id));
        const unexpected = failedIds.filter((id) => !expected!.includes(id));
        console.error(chalk.red.bold(`\nSELF-TEST FAILED: missed defects [${missed.join(", ")}], unexpected failures [${unexpected.join(", ")}]`));
        process.exit(1);
      }
      console.log(chalk.green.bold(`\nSELF-TEST OK: the gate blocked this run${expected ? ` and caught all ${expected.length} injected defects` : ""}.`));
      process.exit(0);
    }
    process.exit(gate.passed ? 0 : 1);
  });

addSourceOptions(program.command("snapshot").description("Run an eval and save the outcome as a baseline snapshot"))
  .requiredOption("-v, --version <version>", "baseline version label to save as")
  .action(async (opts) => {
    const config = loadConfig();
    const rt = await buildRuntime({ opts });
    const run = await new EvalRunner({ llm: rt.llm, embeddings: rt.embeddings, judge: rt.judge }).run(rt.cases);
    const store = new SnapshotStore(opts.snapshotDir ?? config.snapshotDir);
    const p = store.save(snapshotFromRun(run, opts.version));
    console.log(chalk.green(`Snapshot "${opts.version}" saved to ${p} (${run.total} cases).`));
  });

program
  .command("record")
  .description("Run a dataset against the live model in .env and save its outputs (and judge verdicts) as a response set")
  .requiredOption("-d, --dataset <path>", "JSONL case file, or a directory of them")
  .requiredOption("-o, --out <file>", "response set file to write, e.g. datasets/responses/my-model.json")
  .requiredOption("-n, --name <name>", "label for this recording, e.g. llama-3.3-70b")
  .action(async (opts) => {
    const config = loadConfig();
    if (config.llmProvider === "mock") {
      throw new Error("record needs a real model: set LLM_PROVIDER and a key in .env (see .env.local).");
    }
    const cases = loadDataset(opts.dataset);
    const live = createLLMProvider(config);
    const recorder = new RecordingLLMProvider(live);
    // The judge talks to the live model directly, so its calls never overwrite recorded outputs.
    const judge = new RecordingJudge(new LLMJudge(live));
    const run = await new EvalRunner({ llm: recorder, embeddings: createEmbeddingProvider(config), judge }).run(cases);
    console.log(renderConsoleReport(run));
    saveResponseSet(opts.out, {
      name: opts.name,
      description: `Recorded from ${live.name} on ${new Date().toISOString().slice(0, 10)}.`,
      outputs: recorder.outputs,
      ...(Object.keys(judge.verdicts).length ? { judge: judge.verdicts } : {}),
    });
    console.log(chalk.green(`\nRecorded ${Object.keys(recorder.outputs).length} outputs to ${opts.out}`));
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
