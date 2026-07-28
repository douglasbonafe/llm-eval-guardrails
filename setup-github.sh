#!/usr/bin/env bash
# ============================================================
# LLM Eval & Guardrails Framework — one-shot GitHub setup
# Run this from your WSL terminal:
#   cd /mnt/c/Users/dsbon/OneDrive/Documentos/Claude/Projects/Portfolio
#   bash llm-eval-guardrails/setup-github.sh
# ============================================================
set -euo pipefail

REPO_NAME="llm-eval-guardrails"
WIN_SRC="/mnt/c/Users/dsbon/OneDrive/Documentos/Claude/Projects/Portfolio/${REPO_NAME}"
WSL_DEST="$HOME/${REPO_NAME}"
GITHUB_USER="douglasbonafe"

echo "==> Copying project from Windows to WSL home..."
rm -rf "$WSL_DEST"
cp -r "$WIN_SRC" "$WSL_DEST"
cd "$WSL_DEST"

# Drop anything that should not be committed / re-created on the target machine.
rm -rf .git node_modules dist .llm-eval

echo "==> Initializing git repo..."
git init -b main
git config user.email "dsbonafe@gmail.com"
git config user.name "Douglas Bonafé"

echo "==> Commit 1/6: project scaffold, configuration, and docs"
git add package.json tsconfig.json vitest.config.ts .gitignore .env.local README.md
git commit -m "feat: initial project scaffold, configuration, and documentation

- package.json with tsc build, vitest runner, and CLI bin
- strict tsconfig and vitest config (offline-by-default test suite)
- .env.local documenting every variable and where to obtain each key
- .gitignore and full README with step-by-step usage"

echo "==> Commit 2/6: core types, config loader, and tracing"
git add src/types.ts src/config.ts src/trace/
git commit -m "feat(core): add core types, Zod config loader, and trace store

- shared interfaces for providers, assertions, cases, and results
- environment configuration validated with Zod (.env then .env.local)
- trace store linking prompt, retrieved context, and response by trace id"

echo "==> Commit 3/6: LLM providers, embeddings, and vector stores"
git add src/providers/ src/vectorstore/
git commit -m "feat(providers): add LLM/embedding providers and vector stores

- LLM providers: deterministic mock, OpenAI-compatible (OpenAI/Groq/DeepSeek),
  and Anthropic, behind a factory
- embeddings: offline local hashing provider + OpenAI-compatible, via factory
- vector stores: in-memory (default), pgvector, and Qdrant adapters"

echo "==> Commit 4/6: assertions and evaluation engine"
git add src/assertions/ src/eval/
git commit -m "feat(eval): add assertions, runner, confidence, and reporting

- assertions: exact/contains/regex, JSON-schema (Zod), semantic similarity,
  and RAG groundedness/faithfulness
- eval runner aggregates pass rate, mean score, and mean confidence per run
- confidence metric blends assertion margin, agreement, and model logprobs
- console and JSON reporters"

echo "==> Commit 5/6: snapshot regression, quality gate, CLI, and public API"
git add src/snapshot/ src/guardrail/ src/cli.ts src/index.ts
git commit -m "feat(guardrail): add snapshot regression detection, quality gate, and CLI

- snapshot store + regression detection (pass/fail flips and score drops)
- quality gate enforcing pass rate, confidence, and regression thresholds
- llm-guardrail CLI (gate, snapshot) with CI-friendly exit codes
- public API barrel export"

echo "==> Commit 6/6: tests, examples, and CI workflow"
git add tests/ examples/ .github/
git commit -m "test(ci): add test suite, examples, and GitHub Actions quality gate

- Vitest unit + integration tests, fully offline (no API keys)
- examples: offline eval suite and RAG groundedness demo
- CI: type-check, test matrix (Node 18/20/22), quality gate, gated deploy"

echo "==> Checking gh CLI..."
if ! command -v gh &>/dev/null; then
  echo "Installing gh CLI..."
  type -p curl >/dev/null || sudo apt install -y curl
  curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg \
    | sudo dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg
  sudo chmod go+r /usr/share/keyrings/githubcli-archive-keyring.gpg
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" \
    | sudo tee /etc/apt/sources.list.d/github-cli.list > /dev/null
  sudo apt update -q && sudo apt install gh -y
fi

echo ""
echo "==> Verifying GitHub authentication..."
if ! gh auth status &>/dev/null; then
  echo "    Not logged in — opening login (browser will open, follow the prompts)"
  gh auth login --web -h github.com
fi

echo ""
echo "==> Creating public GitHub repository and pushing..."
gh repo create "${GITHUB_USER}/${REPO_NAME}" \
  --public \
  --description "Evaluation and guardrails harness for LLM, RAG, and agentic apps — semantic/schema/groundedness assertions, confidence metrics, snapshot regression detection, trace-linked results, and a CI quality gate that blocks deploys on quality drop" \
  --push \
  --source .

echo ""
echo "============================================================"
echo "Done!"
echo "Repository: https://github.com/${GITHUB_USER}/${REPO_NAME}"
echo ""
echo "Next steps:"
echo "  1. npm install"
echo "  2. npm test          # fully offline, no keys needed"
echo "  3. npm run eval      # see an eval report"
echo "  4. (optional) cp .env.local .env and add a free Groq/DeepSeek key"
echo "============================================================"
