import { describe, expect, it } from 'vitest'

import {
  classifySupportedQueryMethod,
  getSupportedTestingLibraryQueryFamily,
  getUnsupportedSelectorReason,
  isDisplayValueQueryMethod,
  isLabelTextQueryMethod,
  isPlaceholderTextQueryMethod,
  isRoleQueryMethod,
  isSupportedTestingLibraryQueryMethod,
  isTestIdQueryMethod,
  isTextQueryMethod,
  toSingularAsyncQueryMethod,
} from '#core/query-policy.ts'

describe('query-policy helpers', () => {
  it('recognizes supported query methods and their families', () => {
    expect(isSupportedTestingLibraryQueryMethod('getByRole')).toBe(true)
    expect(getSupportedTestingLibraryQueryFamily('findAllByText')).toBe('ByText')
    expect(isRoleQueryMethod('queryByRole')).toBe(true)
    expect(isLabelTextQueryMethod('getByLabelText')).toBe(true)
    expect(isPlaceholderTextQueryMethod('findByPlaceholderText')).toBe(true)
    expect(isTextQueryMethod('getAllByText')).toBe(true)
    expect(isDisplayValueQueryMethod('queryByDisplayValue')).toBe(true)
    expect(isTestIdQueryMethod('findAllByTestId')).toBe(true)
  })

  it('classifies unsupported methods as fragile and rejects malformed names', () => {
    expect(isSupportedTestingLibraryQueryMethod('findByFoo')).toBe(false)
    expect(isSupportedTestingLibraryQueryMethod(undefined)).toBe(false)
    expect(classifySupportedQueryMethod('queryByTitle')).toBe('acceptable')
    expect(classifySupportedQueryMethod('findByFoo')).toBe('fragile')
  })

  it('only rewrites singular supported queries to async form', () => {
    expect(toSingularAsyncQueryMethod('getByRole')).toBe('findByRole')
    expect(toSingularAsyncQueryMethod('queryAllByText')).toBeUndefined()
    expect(toSingularAsyncQueryMethod('nonsense')).toBeUndefined()
  })

  it('explains why volatile CSS selectors should not be used directly', () => {
    expect(
      getUnsupportedSelectorReason('#radix-foo .css-abc:nth-of-type(2)')
    ).toContain('dynamic Radix id, generated CSS class, positional selector')
    expect(getUnsupportedSelectorReason('.stable-selector')).toBeUndefined()
    expect(getUnsupportedSelectorReason()).toBeUndefined()
  })
})
