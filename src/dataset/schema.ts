import { z } from "zod";

const FieldType = z.union([
  z.enum(["string", "number", "int", "boolean", "string[]"]),
  z.object({ enum: z.array(z.string()).min(1) }).strict(),
]);
export type FieldTypeSpec = z.infer<typeof FieldType>;

/** Declarative assertions, so a case set is plain data (JSONL), not code. */
export const AssertionSpec = z.discriminatedUnion("type", [
  z.object({ type: z.literal("exact"), expected: z.string(), caseInsensitive: z.boolean().optional() }).strict(),
  z.object({ type: z.literal("contains"), values: z.array(z.string()).min(1), caseInsensitive: z.boolean().optional() }).strict(),
  z.object({ type: z.literal("not-contains"), values: z.array(z.string()).min(1), caseInsensitive: z.boolean().optional() }).strict(),
  z.object({ type: z.literal("regex"), pattern: z.string(), flags: z.string().optional() }).strict(),
  z.object({ type: z.literal("max-length"), chars: z.number().int().positive() }).strict(),
  z.object({ type: z.literal("json"), fields: z.record(FieldType), strict: z.boolean().optional() }).strict(),
  z.object({ type: z.literal("similar"), expected: z.string(), threshold: z.number().min(0).max(1).optional() }).strict(),
  z
    .object({
      type: z.literal("grounded"),
      threshold: z.number().min(0).max(1).optional(),
      claimSupportThreshold: z.number().min(0).max(1).optional(),
    })
    .strict(),
  z.object({ type: z.literal("rubric"), criteria: z.string().min(10), threshold: z.number().min(0).max(1).optional() }).strict(),
]);
export type AssertionSpecT = z.infer<typeof AssertionSpec>;

export const CaseSpec = z
  .object({
    id: z.string().regex(/^[a-z0-9][a-z0-9._-]*$/, "id must be lowercase letters, digits, . _ -"),
    description: z.string().optional(),
    system: z.string().optional(),
    prompt: z.string().min(1),
    context: z.array(z.string()).optional(),
    tags: z.array(z.string()).optional(),
    assertions: z.array(AssertionSpec).min(1),
  })
  .strict()
  .superRefine((c, ctx) => {
    if (c.assertions.some((a) => a.type === "grounded") && !c.context?.length) {
      ctx.addIssue({ code: "custom", message: 'a "grounded" assertion needs a non-empty "context"' });
    }
  });
export type CaseSpecT = z.infer<typeof CaseSpec>;

/** A recorded run: model outputs (and optional judge verdicts) per case id. */
export const ResponseSet = z
  .object({
    name: z.string(),
    description: z.string().optional(),
    /** Case ids this set is designed to make fail. `--expect-fail` checks the gate catches exactly these. */
    expectFail: z.array(z.string()).optional(),
    outputs: z.record(z.string()),
    judge: z.record(z.object({ score: z.number().int().min(1).max(5), reason: z.string() })).optional(),
  })
  .strict();
export type ResponseSetT = z.infer<typeof ResponseSet>;
