/**
 * TypeScript types for project conventions detection (Phase 3).
 */

export type ImportStyle = 'esm' | 'cjs'
export type MockPattern = 'vi.mock' | 'jest.mock' | 'none'

export interface ConventionFile {
  path: string
  importStyle: ImportStyle
  hasDescribeBlock: boolean
  mockPattern: MockPattern
  hasHelperWithExpect: boolean
}

export interface ConventionsSchema {
  scannedAt: string // ISO date string
  projectRoot: string
  importStyle: ImportStyle // majority convention
  mockPattern: MockPattern // majority convention
  testFiles: ConventionFile[] // one entry per discovered test file
  folderPattern: 'colocated' | '__tests__' | 'mixed' | 'unknown'
  fileExtension: 'ts' | 'tsx' | 'js' | 'jsx' | 'mixed'
}

export const DEFAULT_CONVENTIONS: ConventionsSchema = {
  scannedAt: '',
  projectRoot: '',
  importStyle: 'esm',
  mockPattern: 'none',
  testFiles: [],
  folderPattern: 'unknown',
  fileExtension: 'ts',
}
