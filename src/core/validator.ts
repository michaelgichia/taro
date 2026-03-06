/**
 * Input schema validation using zod
 * Validates Chrome Recorder export files before processing.
 */

import { z } from 'zod'

export const assertedEventSchema = z.object({
  type: z.string(),
  url: z.string().optional(),
  title: z.string().optional(),
})

export const recordingStepSchema = z.object({
  type: z.string(),
  target: z.string().optional(),
  selectors: z.array(z.array(z.string())).optional(),
  value: z.string().optional(),
  assertedEvents: z.array(assertedEventSchema).optional(),
})

export const recordingSchema = z.object({
  title: z.string().optional(),
  steps: z.array(recordingStepSchema),
})

export type ValidatedRecording = z.infer<typeof recordingSchema>

export function validateRecording(data: unknown): ValidatedRecording {
  return recordingSchema.parse(data)
}
