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
export type {
  GeneratedTest,
  GeneratedTestV3,
  GenerateFromGroupsOptions,
  GeneratorOptions,
} from '#core/types.ts'
export { selectorToQuery } from '#core/utils.ts'
