/**
 * Input schema validation using Zod
 * Validates Chrome Recorder export structure before processing,
 * returning structured errors rather than throwing.
 */

import { z } from "zod";

const assertedEventSchema = z.object({
  type: z.string(),
  url: z.string().optional(),
  title: z.string().optional(),
});

const recordingStepSchema = z
  .object({
    type: z.string(),
    target: z.string().optional(),
    selectors: z.array(z.array(z.string())).optional(),
    value: z.string().optional(),
    key: z.string().optional(),
    url: z.string().optional(),
    assertedEvents: z.array(assertedEventSchema).optional(),
  })
  .passthrough();

export const chromeRecorderSchema = z.object({
  title: z.string().optional(),
  steps: z.array(recordingStepSchema),
  settings: z.record(z.unknown()).optional(),
});

export type ValidatedRecording = z.infer<typeof chromeRecorderSchema>;

export interface ValidationError {
  path: string;
  message: string;
}

export type ValidationResult =
  | { valid: true; data: ValidatedRecording }
  | { valid: false; errors: ValidationError[] };

function formatErrors(zodError: z.ZodError): ValidationError[] {
  return zodError.errors.map((issue) => ({
    path: issue.path.length > 0 ? issue.path.join(".") : "(root)",
    message: issue.message,
  }));
}

export function validateRecording(data: unknown): ValidationResult {
  const result = chromeRecorderSchema.safeParse(data);
  if (result.success) {
    return { valid: true, data: result.data };
  }
  return { valid: false, errors: formatErrors(result.error) };
}

export function formatValidationErrors(errors: ValidationError[]): string {
  return errors.map((e) => `  • ${e.path}: ${e.message}`).join("\n");
}
