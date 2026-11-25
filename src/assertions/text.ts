import type { Assertion, AssertionContext } from "../types";
import { result } from "./base";

export interface TextMatchOptions {
  trim?: boolean;
  caseInsensitive?: boolean;
}

function normalize(s: string, opts: TextMatchOptions): string {
  let out = s;
  if (opts.trim !== false) out = out.trim();
  if (opts.caseInsensitive) out = out.toLowerCase();
  return out;
}

/** Exact-match assertion (the classic baseline). */
export function exactMatch(expected: string, opts: TextMatchOptions = {}): Assertion {
  return {
    type: "exact-match",
    evaluate(ctx: AssertionContext) {
      const a = normalize(ctx.output, opts);
      const b = normalize(expected, opts);
      const passed = a === b;
      return result("exact-match", passed, passed ? 1 : 0, passed ? "Output matched exactly" : "Output did not match expected", {
        detail: { expected, got: ctx.output },
      });
    },
  };
}

/** Output must contain all of the given substrings. */
export function contains(needles: string | string[], opts: TextMatchOptions = {}): Assertion {
  const list = Array.isArray(needles) ? needles : [needles];
  return {
    type: "contains",
    evaluate(ctx: AssertionContext) {
      const hay = normalize(ctx.output, opts);
      const missing = list.filter((n) => !hay.includes(normalize(n, opts)));
      const score = (list.length - missing.length) / list.length;
      const passed = missing.length === 0;
      return result("contains", passed, score, passed ? "All required substrings present" : `Missing: ${missing.join(", ")}`, {
        detail: { required: list, missing },
      });
    },
  };
}

/** Output must NOT contain any of the given substrings (e.g. banned words / PII markers). */
export function notContains(needles: string | string[], opts: TextMatchOptions = {}): Assertion {
  const list = Array.isArray(needles) ? needles : [needles];
  return {
    type: "not-contains",
    evaluate(ctx: AssertionContext) {
      const hay = normalize(ctx.output, opts);
      const found = list.filter((n) => hay.includes(normalize(n, opts)));
      const passed = found.length === 0;
      return result("not-contains", passed, passed ? 1 : 0, passed ? "No banned substrings present" : `Found banned: ${found.join(", ")}`, {
        detail: { banned: list, found },
      });
    },
  };
}

/** Output must match a regular expression. */
export function matchesRegex(pattern: RegExp | string, flags?: string): Assertion {
  const re = typeof pattern === "string" ? new RegExp(pattern, flags) : pattern;
  return {
    type: "regex",
    evaluate(ctx: AssertionContext) {
      const passed = re.test(ctx.output);
      return result("regex", passed, passed ? 1 : 0, passed ? `Matched /${re.source}/` : `Did not match /${re.source}/`, {
        detail: { pattern: re.source, flags: re.flags },
      });
    },
  };
}

/** Output must not exceed a character budget (verbosity / truncation guard). */
export function maxLength(limit: number): Assertion {
  return {
    type: "max-length",
    evaluate(ctx: AssertionContext) {
      const len = ctx.output.length;
      const passed = len <= limit;
      return result("max-length", passed, passed ? 1 : Math.max(0, 1 - (len - limit) / limit), `Output is ${len} chars (limit ${limit})`, {
        detail: { length: len, limit },
      });
    },
  };
}
