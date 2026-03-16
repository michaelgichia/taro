/**
 * RTL test code generation
 * Converts NormalizedRecording into valid React Testing Library test code.
 *
 * Query priority (accessibility-first):
 *   getByRole > getByLabelText > getByPlaceholderText > getByText >
 *   getByAltText > getByTitle > getByDisplayValue > getByTestId
 */

export { generateTest } from '#core/generator.basic.ts'
export { generateTestFromGroups } from '#core/generator.from-groups.ts'
export { emitQuerySummary } from '#core/generator.query-summary.ts'
export { selectorToQuery } from '#core/generator.shared.ts'
export type {
  GenerateFromGroupsOptions,
  GeneratedTest,
  GeneratedTestV3,
  GeneratorOptions,
} from '#core/generator.types.ts'
