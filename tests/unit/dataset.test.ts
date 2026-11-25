import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadDataset } from "../../src/dataset/loader";

const dirs: string[] = [];
function dataset(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), "llm-ds-"));
  dirs.push(dir);
  for (const [name, body] of Object.entries(files)) writeFileSync(join(dir, name), body);
  return dir;
}
afterEach(() => dirs.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true })));

const ok = (id: string) =>
  JSON.stringify({ id, prompt: "p", assertions: [{ type: "exact", expected: "x" }] });

describe("loadDataset", () => {
  it("loads cases, tags each with its file name, and puts the system prompt first", () => {
    const dir = dataset({
      "a.jsonl": JSON.stringify({ id: "one", system: "sys", prompt: "p", tags: ["critical"], assertions: [{ type: "exact", expected: "x" }] }) + "\n\n",
    });
    const [c] = loadDataset(dir);
    expect(c.tags).toEqual(["a", "critical"]);
    expect(c.input.map((m) => m.role)).toEqual(["system", "user"]);
  });

  it("rejects duplicate ids across files and names both locations", () => {
    const dir = dataset({ "a.jsonl": ok("dup"), "b.jsonl": ok("dup") });
    expect(() => loadDataset(dir)).toThrow(/duplicate case id "dup".*a\.jsonl:1/);
  });

  it("reports file and line for invalid JSON", () => {
    const dir = dataset({ "a.jsonl": ok("fine") + "\n{broken" });
    expect(() => loadDataset(dir)).toThrow(/a\.jsonl:2: invalid JSON/);
  });

  it("rejects unknown fields and unknown assertion types (typos must not pass silently)", () => {
    expect(() => loadDataset(dataset({ "a.jsonl": JSON.stringify({ id: "x", prompt: "p", asertions: [] }) }))).toThrow();
    expect(() =>
      loadDataset(dataset({ "a.jsonl": JSON.stringify({ id: "x", prompt: "p", assertions: [{ type: "exactt", expected: "y" }] }) })),
    ).toThrow();
  });

  it("requires context for a grounded assertion", () => {
    const line = JSON.stringify({ id: "g", prompt: "p", assertions: [{ type: "grounded" }] });
    expect(() => loadDataset(dataset({ "a.jsonl": line }))).toThrow(/needs a non-empty "context"/);
  });

  it("fails on a directory with no .jsonl files", () => {
    expect(() => loadDataset(dataset({ "notes.txt": "x" }))).toThrow(/No \.jsonl files/);
  });
});
