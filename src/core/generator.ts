/**
 * RTL test code generation
 * Converts NormalizedRecording into valid React Testing Library test code.
 *
 * Query priority (accessibility-first):
 *   getByRole > getByLabelText > getByPlaceholderText > getByText >
 *   getByAltText > getByTitle > getByDisplayValue > getByTestId
 */

export { generateTest } from './generator.basic.ts'
export { generateTestFromGroups } from './generator.from-groups.ts'
export { emitQuerySummary } from './generator.query-summary.ts'
export { selectorToQuery } from './generator.shared.ts'
export type {
  GenerateFromGroupsOptions,
  GeneratedTest,
  GeneratedTestV3,
  GeneratorOptions,
} from './generator.types.ts'
