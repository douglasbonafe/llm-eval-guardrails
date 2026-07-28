import { z, type ZodType } from "zod";
import type { Assertion, AssertionContext } from "../types";
import { result } from "./base";

/** Strip ```json ... ``` fences that models often wrap JSON in. */
function stripFences(s: string): string {
  const trimmed = s.trim();
  const fence = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fence ? fence[1] : trimmed;
}

/**
 * Validates that the model output is JSON conforming to a Zod schema.
 * Reports parse errors and per-field validation issues in `detail`.
 */
export function jsonSchema(schema: ZodType): Assertion {
  return {
    type: "json-schema",
    evaluate(ctx: AssertionContext) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(stripFences(ctx.output));
      } catch (e) {
        return result("json-schema", false, 0, "Output is not valid JSON", {
          detail: { parseError: (e as Error).message },
        });
      }
      const check = schema.safeParse(parsed);
      if (check.success) {
        return result("json-schema", true, 1, "Output is valid JSON matching the schema");
      }
      const issues = check.error.issues.map((i) => ({ path: i.path.join("."), message: i.message }));
      // Partial credit: fraction of top-level keys that validated is hard to
      // compute generically, so score reflects only pass/fail here.
      return result("json-schema", false, 0, `Schema validation failed (${issues.length} issue(s))`, {
        detail: { issues },
      });
    },
  };
}

// Re-export zod so users can build schemas without a separate import.
export { z };
