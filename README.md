# LLM Eval & Guardrails Framework

> A test harness for LLM, RAG, and agentic applications. Assertions beyond exact match, confidence metrics, snapshot regression detection, end-to-end traceability, and a CI quality gate that blocks deploys when quality drops.

Unit tests tell you the code runs. They don't tell you the model still answers correctly after a prompt tweak, a model-version bump, or a change to your retrieval pipeline. This framework closes that gap: you write eval cases with semantic, schema, and groundedness assertions, run them in CI, and a guardrail fails the build if the pass rate, confidence, or regression count crosses a line you set.

It runs **fully offline by default** — a deterministic mock model, local hashing embeddings, and an in-memory vector store — so the whole suite is green in CI with zero API keys and zero services. Point it at a real model (OpenAI, Groq, DeepSeek, Anthropic) and a real vector store (pgvector, Qdrant) with a few environment variables.

```
$ npm run eval

  PASS capital-exact-match         score=1.00 conf=0.97  trace=002244d6-...
     ✓ exact-match: Output matched exactly
  PASS user-json-schema            score=1.00 conf=0.93  trace=f3b457f6-...
     ✓ json-schema: Output is valid JSON matching the schema
  PASS api-semantic-similarity     score=0.86 conf=0.76  trace=0a1e144c-...
     ✓ semantic-similarity: Cosine similarity 0.863 (threshold 0.6)
  PASS eiffel-rag-groundedness     score=1.00 conf=0.92  trace=9e3c4059-...
     ✓ groundedness: 2/2 claims grounded (100%, threshold 70%)

  5/5 passed (100.0%)  meanScore=0.97  meanConfidence=0.90
```

---

## Table of Contents

- [What you get](#what-you-get)
- [Requirements](#requirements)
- [Quick start (offline, no keys)](#quick-start-offline-no-keys)
- [Getting a free LLM API key](#getting-a-free-llm-api-key)
- [Writing an eval suite](#writing-an-eval-suite)
- [Assertion types](#assertion-types)
- [Confidence metrics](#confidence-metrics)
- [Regression detection (snapshots)](#regression-detection-snapshots)
- [The quality gate (CLI + CI)](#the-quality-gate-cli--ci)
- [Traceability](#traceability)
- [RAG: vector stores](#rag-vector-stores)
- [Configuration reference](#configuration-reference)
- [Architecture](#architecture)
- [Extending the framework](#extending-the-framework)
- [Caveats and honest limits](#caveats-and-honest-limits)
- [License](#license)

---

## What you get

- **Assertions beyond exact match** — exact / contains / regex, JSON-schema validation (via Zod), semantic similarity (embeddings + cosine), and RAG groundedness/faithfulness (claim-by-claim support against retrieved context).
- **Confidence metrics** — every case gets a 0..1 confidence separate from pass/fail, blending assertion margin, cross-assertion agreement, and model logprobs when the provider reports them.
- **Regression detection** — snapshot a run as a baseline, then detect pass→fail flips and score drops on later versions.
- **Traceability** — every case emits a trace id linking prompt, retrieved context, and response so any result is reconstructable.
- **CI quality gate** — a guardrail that turns pass rate, confidence, and regression count into a deploy-blocking exit code.
- **Swappable providers** — OpenAI-compatible (OpenAI / Groq / DeepSeek), Anthropic, and a deterministic mock; local or OpenAI embeddings; in-memory, pgvector, or Qdrant vector stores.

---

## Requirements

- Node.js 18 or newer
- npm
- No API key is required to run the default suite, tests, or examples.

---

## Quick start (offline, no keys)

```bash
git clone https://github.com/douglasbonafe/llm-eval-guardrails.git
cd llm-eval-guardrails

npm install

# 1. Run the unit + integration tests (fully offline)
npm test

# 2. Run the example eval suite and print a report
npm run eval

# 3. Run the RAG groundedness example (grounded vs hallucinated answer)
npm run eval:rag

# 4. Run the quality gate exactly as CI does (exits non-zero on failure)
npm run gate -- gate --suite examples/suite.ts
```

That's the whole loop working with no configuration. To evaluate a real model, copy the env template and fill in a key:

```bash
cp .env.local .env
# edit .env — see the next section for a free key
```

`.env.local` is a committed example with every variable documented. Your real secrets go in `.env`, which is git-ignored.

---

## Getting a free LLM API key

You do not need a paid OpenAI account. Two good free/cheap options, both OpenAI-compatible (so the same code path works):

**Groq** (free tier, very fast):

1. Sign up at https://console.groq.com
2. Create a key at https://console.groq.com/keys
3. In `.env` set:
   ```env
   LLM_PROVIDER=openai
   LLM_BASE_URL=https://api.groq.com/openai/v1
   LLM_API_KEY=gsk_your_key_here
   LLM_MODEL=llama-3.3-70b-versatile
   ```

**DeepSeek** (very cheap, trial credit on signup):

1. Sign up at https://platform.deepseek.com
2. Create a key at https://platform.deepseek.com/api_keys
3. In `.env` set:
   ```env
   LLM_PROVIDER=openai
   LLM_BASE_URL=https://api.deepseek.com
   LLM_API_KEY=sk_your_key_here
   LLM_MODEL=deepseek-chat
   ```

**Anthropic** (paid) is also supported: set `LLM_PROVIDER=anthropic` and `ANTHROPIC_API_KEY` (key from https://console.anthropic.com/settings/keys).

Note on embeddings: Groq and DeepSeek do not serve embeddings today. The semantic-similarity and groundedness assertions default to **local** embeddings (no key). For production-grade semantic quality, set `EMBEDDING_PROVIDER=openai` with an OpenAI key.

---

## Writing an eval suite

A suite is a module that exports `cases` (and optionally its own `llm` / `embeddings`). See `examples/suite.ts` for a complete one.

```ts
import {
  exactMatch, contains, jsonSchema, semanticSimilarity, grounded, z,
  type EvalCase,
} from "llm-eval-guardrails";

export const cases: EvalCase[] = [
  {
    id: "capital-of-france",
    input: [{ role: "user", content: "What is the capital of France? One word." }],
    assertions: [exactMatch("Paris")],
  },
  {
    id: "structured-output",
    input: [{ role: "user", content: "Return a JSON user with name and age." }],
    assertions: [jsonSchema(z.object({ name: z.string(), age: z.number().int().positive() }))],
  },
  {
    id: "rag-answer",
    input: [{ role: "user", content: "How tall is the Eiffel Tower?" }],
    context: ["The Eiffel Tower stands 330 meters tall in Paris."],
    assertions: [grounded({ threshold: 0.7 })],
  },
];

export default { cases };
```

Run it against whatever provider your `.env` selects:

```bash
npx tsx src/cli.ts gate --suite path/to/your-suite.ts
```

Or drive the runner directly in code:

```ts
import { EvalRunner, createLLMProvider, createEmbeddingProvider, loadConfig } from "llm-eval-guardrails";

const config = loadConfig();
const runner = new EvalRunner({
  llm: createLLMProvider(config),
  embeddings: createEmbeddingProvider(config),
});
const run = await runner.run(cases);
console.log(run.passRate, run.meanConfidence);
```

---

## Assertion types

| Assertion | Factory | Passes when |
|---|---|---|
| Exact match | `exactMatch(expected, opts?)` | Output equals expected (trim / case options) |
| Contains | `contains(needles, opts?)` | Output contains all required substrings |
| Not contains | `notContains(needles, opts?)` | Output contains none of the banned substrings |
| Regex | `matchesRegex(pattern, flags?)` | Output matches the pattern |
| JSON schema | `jsonSchema(zodSchema)` | Output parses as JSON and validates against the Zod schema (fences stripped) |
| Semantic similarity | `semanticSimilarity(expected, { threshold })` | Cosine similarity of embeddings ≥ threshold (tolerates paraphrase) |
| Groundedness (RAG) | `grounded({ threshold, claimSupportThreshold })` | Enough answer claims are supported by the retrieved context |

Every assertion returns a normalized `score` (0..1), a `passed` boolean, a human message, and structured `detail` for debugging (for groundedness, the per-claim support and the list of unsupported claims).

---

## Confidence metrics

Pass/fail is not the same as reliability. A case can fail decisively (clearly wrong) or pass by a hair (barely over threshold). `computeConfidence` returns a 0..1 confidence per case by blending:

1. **Margin** — how far each assertion score cleared or missed its decision boundary.
2. **Agreement** — how consistent the assertions are with each other (low variance → high agreement).
3. **Model logprob** — average token probability from the model, when the provider returns logprobs.

The run's `meanConfidence` is a gate input: you can require the suite to pass *and* be confident.

---

## Regression detection (snapshots)

Save a known-good run as a baseline, then compare later runs against it.

```bash
# Save the current outputs as baseline "v1"
npx tsx src/cli.ts snapshot --suite examples/suite.ts --version v1

# Later, on a new prompt/model version, check for regressions
npx tsx src/cli.ts gate --suite examples/suite.ts --baseline v1
```

`detectRegressions` reports, per case: pass→fail flips, score drops beyond a tolerance, improvements, added/removed cases, and outputs that changed. The gate fails when regressions exceed `GATE_MAX_REGRESSIONS`.

---

## The quality gate (CLI + CI)

The gate is the guardrail. It evaluates a run against three thresholds and exits non-zero when any is violated:

| Threshold | Env var | Meaning |
|---|---|---|
| Min pass rate | `GATE_MIN_PASS_RATE` | Fraction of cases that must pass |
| Min confidence | `GATE_MIN_CONFIDENCE` | Required mean confidence |
| Max regressions | `GATE_MAX_REGRESSIONS` | New regressions allowed vs baseline |

```bash
# Fails the process (exit 1) if quality drops
npx tsx src/cli.ts gate \
  --suite examples/suite.ts \
  --baseline v1 \
  --min-pass-rate 0.9 \
  --min-confidence 0.6 \
  --max-regressions 0 \
  --report eval-report.json
```

In CI, that non-zero exit blocks the pipeline. The included workflow at `.github/workflows/ci.yml` type-checks, runs the tests across Node 18/20/22, runs the gate (offline, no secrets), uploads the JSON report as an artifact, and gates a `deploy` job behind it — so a quality drop stops the deploy.

To gate against a real model in CI, set repo secrets and export them in the gate step (commented example in the workflow):

```yaml
env:
  LLM_PROVIDER: openai
  LLM_BASE_URL: https://api.groq.com/openai/v1
  LLM_API_KEY: ${{ secrets.LLM_API_KEY }}
```

---

## Traceability

Every case produces a `TraceRecord` linking the prompt, the retrieved context, the response, the model, and annotations (pass/score/confidence). Reach it via the runner:

```ts
const run = await runner.run(cases);
const trace = runner.traces.get(run.cases[0].traceId);
// trace.prompt, trace.context, trace.response, trace.model, trace.annotations
```

Trace ids also appear in the console report, so a failing case in CI is one lookup away from the exact prompt and context that produced it.

---

## RAG: vector stores

The framework ships three vector-store adapters behind one interface:

- **memory** (default) — in-process brute-force cosine search, no dependency, no service.
- **pgvector** — PostgreSQL + the `vector` extension. `npm i pg pgvector`, then `VECTOR_STORE=pgvector` and `PGVECTOR_URL=...`.
- **qdrant** — Qdrant. `npm i @qdrant/js-client-rest`, then `VECTOR_STORE=qdrant` and `QDRANT_URL=...`.

`pg`, `pgvector`, and `@qdrant/js-client-rest` are optional dependencies, loaded lazily — the core installs and runs without them. Spin up a local store for testing:

```bash
# pgvector
docker run -p 5432:5432 -e POSTGRES_PASSWORD=postgres pgvector/pgvector:pg16

# qdrant
docker run -p 6333:6333 qdrant/qdrant
```

`examples/rag-groundedness.ts` shows the full path: embed a knowledge base, retrieve top-k context, generate an answer, and assert it is grounded.

---

## Configuration reference

All configuration is environment variables, documented with links in `.env.local`. Load and validate it with `loadConfig()` (Zod-backed).

| Variable | Default | Description |
|---|---|---|
| `LLM_PROVIDER` | `mock` | `mock`, `openai` (incl. Groq/DeepSeek), or `anthropic` |
| `LLM_BASE_URL` | — | OpenAI-compatible endpoint (Groq/DeepSeek base URL) |
| `LLM_API_KEY` | — | Key for the OpenAI-compatible provider |
| `LLM_MODEL` | `llama-3.3-70b-versatile` | Model under test |
| `ANTHROPIC_API_KEY` / `ANTHROPIC_MODEL` | — / `claude-3-5-haiku-20241022` | Anthropic config |
| `EMBEDDING_PROVIDER` | `local` | `local` (offline) or `openai` |
| `EMBEDDING_API_KEY` / `EMBEDDING_MODEL` | — / `text-embedding-3-small` | OpenAI embeddings |
| `VECTOR_STORE` | `memory` | `memory`, `pgvector`, or `qdrant` |
| `PGVECTOR_URL` / `QDRANT_URL` | — | Vector-store connection |
| `GATE_MIN_PASS_RATE` | `0.9` | Gate: minimum pass rate |
| `GATE_MIN_CONFIDENCE` | `0.6` | Gate: minimum mean confidence |
| `GATE_MAX_REGRESSIONS` | `0` | Gate: max regressions vs baseline |
| `SNAPSHOT_DIR` | `.llm-eval/snapshots` | Where baselines are stored |

---

## Architecture

```
src/
├── index.ts                 Public API barrel
├── cli.ts                   `llm-guardrail` CLI (gate, snapshot)
├── config.ts                Zod-validated env config
├── types.ts                 Core interfaces
├── trace/trace.ts           Trace store (prompt ↔ context ↔ response)
├── providers/
│   ├── llm/                 mock, openai-compatible, anthropic, factory
│   └── embeddings/          local (hashing), openai-compatible, factory
├── vectorstore/            memory, pgvector, qdrant, factory
├── assertions/            text, json-schema, semantic-similarity, groundedness
├── eval/                  runner, confidence, report
├── snapshot/              snapshot-store, regression
└── guardrail/             quality-gate

examples/                  suite.ts, run-eval.ts, rag-groundedness.ts
tests/                     unit + integration (Vitest)
.github/workflows/ci.yml   type-check, test matrix, gate, gated deploy
```

Design principles: one interface per concern (`LLMProvider`, `EmbeddingProvider`, `VectorStore`, `Assertion`), factories wired from config, dependency inversion so providers/stores swap without touching the runner, and everything deterministic and offline-capable so tests need no secrets.

---

## Extending the framework

**Add an assertion:** implement the `Assertion` interface (`type` + `evaluate(ctx)`), return a normalized `AssertionResult`. Drop it into a case's `assertions` array.

```ts
import type { Assertion } from "llm-eval-guardrails";

export function maxLength(limit: number): Assertion {
  return {
    type: "max-length",
    evaluate(ctx) {
      const passed = ctx.output.length <= limit;
      return { type: "max-length", passed, score: passed ? 1 : 0, message: `len=${ctx.output.length}` };
    },
  };
}
```

**Add an LLM provider:** implement `LLMProvider.complete()` and register it in `providers/llm/factory.ts`.

**Add a vector store:** implement `VectorStore` (`upsert` / `search`) and register it in `vectorstore/factory.ts`.

---

## Caveats and honest limits

- **Local embeddings are lexical, not semantic.** The offline `local` embedding provider uses feature hashing, so it captures word overlap, not meaning. It's enough to demo and to keep CI deterministic, but it will not catch a same-topic wrong-fact hallucination (e.g. "the tower is 900 meters tall"). For real semantic quality, set `EMBEDDING_PROVIDER=openai`. For high-stakes faithfulness, add an LLM-judge assertion.
- **Groundedness is similarity-based, not entailment.** It measures whether each claim has supporting context, not strict logical entailment. Treat it as a strong signal, not a proof.
- **Confidence is a heuristic**, not a calibrated probability. Use it comparatively (this run vs the last), not as an absolute guarantee.

---

## License

MIT
