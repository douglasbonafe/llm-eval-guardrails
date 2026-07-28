/**
 * RAG example: index documents in a vector store, retrieve context for a
 * question, generate an answer, and assert the answer is grounded in what was
 * retrieved. Runs offline by default (memory store + local embeddings + mock LLM).
 *   npm run eval:rag
 */
import {
  MemoryVectorStore,
  LocalEmbeddingProvider,
  MockLLMProvider,
  EvalRunner,
  grounded,
  renderConsoleReport,
  type VectorDocument,
} from "../src";

const KB = [
  "The Eiffel Tower was completed in 1889 for the World's Fair in Paris.",
  "The Eiffel Tower stands 330 meters tall and is made of wrought iron.",
  "The Great Wall of China is over 21,000 kilometers long.",
  "Mount Everest is the highest mountain above sea level at 8,849 meters.",
];

async function main() {
  const embeddings = new LocalEmbeddingProvider();
  const store = new MemoryVectorStore();

  // Index the knowledge base.
  const vecs = await embeddings.embed(KB);
  const docs: VectorDocument[] = KB.map((text, i) => ({ id: `doc-${i}`, text, embedding: vecs[i] }));
  await store.upsert(docs);

  // Retrieve top-2 context chunks for the question.
  const question = "How tall is the Eiffel Tower?";
  const qVec = await embeddings.embedOne(question);
  const hits = await store.search(qVec, 2);
  const context = hits.map((h) => h.text);
  console.log("Retrieved context:");
  hits.forEach((h) => console.log(`  [${h.score.toFixed(3)}] ${h.text}`));

  // A grounded answer vs a hallucinated one.
  // NOTE: with the offline LOCAL embeddings, groundedness measures lexical
  // overlap with the retrieved context. It flags claims that are OFF the
  // retrieved topic (below). Catching a same-topic wrong number (e.g. "500
  // meters") reliably requires real semantic embeddings (EMBEDDING_PROVIDER=
  // openai) or an LLM judge — see the README caveats.
  const groun01 = new MockLLMProvider("The Eiffel Tower stands 330 meters tall.");
  const halluc = new MockLLMProvider("Kangaroos are marsupials that hop across the Australian outback.");

  for (const [label, llm] of [
    ["grounded answer", groun01],
    ["hallucinated answer", halluc],
  ] as const) {
    const run = await new EvalRunner({ llm, embeddings }).run([
      {
        id: `eiffel-${label.replace(/\s+/g, "-")}`,
        input: [{ role: "user", content: question }],
        context,
        assertions: [grounded({ threshold: 0.7, claimSupportThreshold: 0.4 })],
      },
    ]);
    console.log(renderConsoleReport(run));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
