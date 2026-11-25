import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, extname, join } from "node:path";
import { z } from "zod";
import { contains, exactMatch, jsonSchema, matchesRegex, maxLength, notContains, rubric, semanticSimilarity, grounded } from "../assertions/index";
import type { Assertion, ChatMessage, EvalCase } from "../types";
import { CaseSpec, ResponseSet, type AssertionSpecT, type CaseSpecT, type FieldTypeSpec, type ResponseSetT } from "./schema";

function fieldToZod(t: FieldTypeSpec): z.ZodTypeAny {
  if (typeof t === "object") return z.enum(t.enum as [string, ...string[]]);
  switch (t) {
    case "string":
      return z.string();
    case "number":
      return z.number();
    case "int":
      return z.number().int();
    case "boolean":
      return z.boolean();
    case "string[]":
      return z.array(z.string());
  }
}

/** Compile one declarative assertion spec into a runnable Assertion. */
export function compileAssertion(spec: AssertionSpecT): Assertion {
  switch (spec.type) {
    case "exact":
      return exactMatch(spec.expected, { caseInsensitive: spec.caseInsensitive });
    case "contains":
      return contains(spec.values, { caseInsensitive: spec.caseInsensitive });
    case "not-contains":
      return notContains(spec.values, { caseInsensitive: spec.caseInsensitive });
    case "regex":
      return matchesRegex(spec.pattern, spec.flags);
    case "max-length":
      return maxLength(spec.chars);
    case "json": {
      const shape = Object.fromEntries(Object.entries(spec.fields).map(([k, v]) => [k, fieldToZod(v)]));
      const obj = z.object(shape);
      return jsonSchema(spec.strict ? obj.strict() : obj);
    }
    case "similar":
      return semanticSimilarity(spec.expected, { threshold: spec.threshold });
    case "grounded":
      return grounded({ threshold: spec.threshold, claimSupportThreshold: spec.claimSupportThreshold });
    case "rubric":
      return rubric(spec.criteria, { threshold: spec.threshold });
  }
}

export function compileCase(spec: CaseSpecT, category?: string): EvalCase {
  const input: ChatMessage[] = [];
  if (spec.system) input.push({ role: "system", content: spec.system });
  input.push({ role: "user", content: spec.prompt });
  const tags = [...new Set([...(category ? [category] : []), ...(spec.tags ?? [])])];
  return {
    id: spec.id,
    description: spec.description,
    input,
    context: spec.context,
    tags,
    assertions: spec.assertions.map(compileAssertion),
  };
}

function datasetFiles(path: string): string[] {
  if (statSync(path).isFile()) return [path];
  return readdirSync(path)
    .filter((f) => extname(f) === ".jsonl")
    .sort()
    .map((f) => join(path, f));
}

/**
 * Load a dataset: a .jsonl file, or a directory of them (one case per line).
 * Each file name becomes a tag (factual.jsonl -> "factual"). Validation errors
 * name the file and line, and duplicate ids are rejected.
 */
export function loadDataset(path: string): EvalCase[] {
  const files = datasetFiles(path);
  if (files.length === 0) throw new Error(`No .jsonl files found in "${path}"`);
  const seen = new Map<string, string>();
  const cases: EvalCase[] = [];
  for (const file of files) {
    const category = basename(file, ".jsonl");
    readFileSync(file, "utf8")
      .split(/\r?\n/)
      .forEach((line, i) => {
        if (line.trim() === "") return;
        const where = `${file}:${i + 1}`;
        let raw: unknown;
        try {
          raw = JSON.parse(line);
        } catch (e) {
          throw new Error(`${where}: invalid JSON (${(e as Error).message})`);
        }
        const parsed = CaseSpec.safeParse(raw);
        if (!parsed.success) {
          const issues = parsed.error.issues.map((x) => `${x.path.join(".") || "(case)"}: ${x.message}`).join("; ");
          throw new Error(`${where}: ${issues}`);
        }
        const prev = seen.get(parsed.data.id);
        if (prev) throw new Error(`${where}: duplicate case id "${parsed.data.id}" (first seen at ${prev})`);
        seen.set(parsed.data.id, where);
        cases.push(compileCase(parsed.data, category));
      });
  }
  return cases;
}

export function loadResponseSet(path: string): ResponseSetT {
  const parsed = ResponseSet.safeParse(JSON.parse(readFileSync(path, "utf8")));
  if (!parsed.success) {
    throw new Error(`${path}: ${parsed.error.issues.map((x) => `${x.path.join(".")}: ${x.message}`).join("; ")}`);
  }
  return parsed.data;
}

export function saveResponseSet(path: string, set: ResponseSetT): void {
  writeFileSync(path, JSON.stringify(set, null, 2) + "\n", "utf8");
}

/** Ids in the dataset that have no recorded output (a stale recording). */
export function missingOutputs(cases: EvalCase[], set: ResponseSetT): string[] {
  return cases.filter((c) => !Object.prototype.hasOwnProperty.call(set.outputs, c.id)).map((c) => c.id);
}
