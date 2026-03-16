/**
 * RTL test code generation
 * Converts NormalizedRecording into valid React Testing Library test code.
 *
 * Query priority (accessibility-first):
 *   getByRole > getByLabelText > getByPlaceholderText > getByText >
 *   getByAltText > getByTitle > getByDisplayValue > getByTestId
 */

export { generateTest } from './generator.basic.js'
export { generateTestFromGroups } from './generator.from-groups.js'
export { emitQuerySummary } from './generator.query-summary.js'
export { selectorToQuery } from './generator.shared.js'
export type {
  GenerateFromGroupsOptions,
  GeneratedTest,
  GeneratedTestV3,
  GeneratorOptions,
} from './generator.types.js'
