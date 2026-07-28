/**
 * Minimal end-to-end example: run the suite and print a report.
 *   npm run eval
 */
import { EvalRunner, renderConsoleReport } from "../src";
import suite from "./suite";

async function main() {
  const runner = new EvalRunner({ llm: suite.llm, embeddings: suite.embeddings });
  const run = await runner.run(suite.cases);
  console.log(renderConsoleReport(run));

  // Show the traceability guarantee: every case has a trace linking
  // prompt -> context -> response.
  console.log("\nTraces:");
  for (const t of runner.traces.all()) {
    console.log(`  ${t.traceId}  case=${t.caseId}  model=${t.model}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
