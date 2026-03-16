import { readdir,readFile } from 'node:fs/promises'
import { extname, isAbsolute, join, relative } from 'node:path'

import type {
  ConventionFile,
  ConventionsSchema,
  ImportStyle,
  MockPattern,
} from '#types/conventions.ts'
import { DEFAULT_CONVENTIONS } from '#types/conventions.ts'
import type { RepoRenderTargetCandidate } from '#types/state.ts'

const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  '.taro',
  'coverage',
  '.next',
  '.nuxt',
])

const TEST_FILE_REGEX = /\.(test|spec)\.(ts|tsx|js|jsx)$/

export interface TestFileContent {
  path: string
  content: string
}

export async function findTestFiles(root: string): Promise<string[]> {
  const results: string[] = []

  async function walk(dir: string): Promise<void> {
    let entries
    try {
      entries = await readdir(dir, { withFileTypes: true })
    } catch {
      return
    }

    for (const entry of entries) {
      const fullPath = join(dir, entry.name)

      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) {
          await walk(fullPath)
        }
      } else if (entry.isFile() && TEST_FILE_REGEX.test(entry.name)) {
        results.push(fullPath)
      }
    }
  }

  await walk(root)
  return results
}

export async function readTestFiles(root: string): Promise<TestFileContent[]> {
  const files = await findTestFiles(root)
  const loaded = await Promise.all(
    files.map(async (path) => {
      try {
        const content = await readFile(path, 'utf-8')
        return { path, content }
      } catch {
        return null
      }
    })
  )

  return loaded.filter((entry): entry is TestFileContent => entry !== null)
}

export async function analyzeTestFile(filePath: string): Promise<ConventionFile> {
  let content: string
  try {
    content = await readFile(filePath, 'utf-8')
  } catch {
    return {
      path: filePath,
      importStyle: 'esm',
      hasDescribeBlock: false,
      mockPattern: 'none',
      hasHelperWithExpect: false,
    }
  }

  const importStyle: ImportStyle = content.includes('require(') ? 'cjs' : 'esm'
  const hasDescribeBlock = content.includes('describe(')

  let mockPattern: MockPattern = 'none'
  if (content.includes('vi.mock(')) {
    mockPattern = 'vi.mock'
  } else if (content.includes('jest.mock(')) {
    mockPattern = 'jest.mock'
  }

  return {
    path: filePath,
    importStyle,
    hasDescribeBlock,
    mockPattern,
    hasHelperWithExpect: detectHelperWithExpect(content),
  }
}

function detectHelperWithExpect(content: string): boolean {
  if (!content.includes('expect(')) {
    return false
  }

  const hasFunction =
    /function\s+\w+|const\s+\w+\s*=\s*(?:async\s+)?\(|const\s+\w+\s*:\s*(?:Promise<)?\w+>?\s*=\s*(?:async\s+)?\(/.test(
      content
    )

  return hasFunction && content.includes('expect(')
}

export function deriveConventions(
  files: ConventionFile[],
  projectRoot: string
): ConventionsSchema {
  if (files.length === 0) {
    return {
      ...DEFAULT_CONVENTIONS,
      scannedAt: new Date().toISOString(),
      projectRoot,
    }
  }

  const esmCount = files.filter((f) => f.importStyle === 'esm').length
  const cjsCount = files.filter((f) => f.importStyle === 'cjs').length
  const importStyle: ImportStyle = cjsCount > esmCount ? 'cjs' : 'esm'

  const hasViMock = files.some((f) => f.mockPattern === 'vi.mock')
  const hasJestMock = files.some((f) => f.mockPattern === 'jest.mock')
  let mockPattern: MockPattern = 'none'
  if (hasViMock) {
    mockPattern = 'vi.mock'
  } else if (hasJestMock) {
    mockPattern = 'jest.mock'
  }

  return {
    scannedAt: new Date().toISOString(),
    projectRoot,
    importStyle,
    mockPattern,
    testFiles: files,
    folderPattern: detectFolderPattern(files, projectRoot),
    fileExtension: detectFileExtension(files),
  }
}

function detectFolderPattern(
  files: ConventionFile[],
  projectRoot: string
): 'colocated' | '__tests__' | 'mixed' | 'unknown' {
  if (files.length === 0) {
    return 'unknown'
  }

  let hasColocated = false
  let hasTestsDir = false

  for (const file of files) {
    const relativePath = relative(projectRoot, file.path)
    if (relativePath.includes('__tests__') || relativePath.includes('__test__')) {
      hasTestsDir = true
    } else {
      hasColocated = true
    }
  }

  if (hasColocated && hasTestsDir) {
    return 'mixed'
  }
  if (hasTestsDir) {
    return '__tests__'
  }
  return 'colocated'
}

function detectFileExtension(
  files: ConventionFile[]
): 'ts' | 'tsx' | 'js' | 'jsx' | 'mixed' {
  const extensions = files.map((f) => {
    const ext = extname(f.path).slice(1)
    if (ext === 'ts' || ext === 'tsx') {
      return 'ts'
    }
    return 'js'
  })

  const tsCount = extensions.filter((e) => e === 'ts').length
  const jsCount = extensions.filter((e) => e === 'js').length

  if (tsCount === 0 && jsCount > 0) {
    return 'js'
  }
  if (jsCount === 0 && tsCount > 0) {
    return 'ts'
  }
  if (tsCount > 0 && jsCount > 0) {
    return 'mixed'
  }

  return 'ts'
}

function extractHelperNames(content: string): string[] {
  const matches = content.matchAll(/const\s+([a-z][A-Za-z0-9_]*)\s*=\s*async\s*\(/g)
  return [...new Set([...matches].map((match) => match[1]!))].sort()
}

export function extractRenderTargetCandidatesFromFile(
  projectRoot: string,
  file: TestFileContent
): RepoRenderTargetCandidate[] {
  const imports = new Map<string, string>()
  for (const match of file.content.matchAll(/import\s+([A-Z][A-Za-z0-9_]*)\s+from\s+['"]([^'"]+)['"]/g)) {
    imports.set(match[1]!, match[2]!)
  }

  const helperNames = extractHelperNames(file.content)
  const usesWithin = file.content.includes('within(')
  const sourceTestFile = relative(projectRoot, file.path)
  const candidates: RepoRenderTargetCandidate[] = []

  for (const match of file.content.matchAll(/render\(\s*<([A-Z][A-Za-z0-9_]*)/g)) {
    const symbol = match[1]!
    const importPath = imports.get(symbol)
    if (!importPath) {
      continue
    }

    candidates.push({
      symbol,
      importPath,
      sourceTestFile,
      helperNames,
      usesWithin,
    })
  }

  return candidates
}

export const __conventionIntelligenceTestUtils = {
  detectFileExtension,
  detectFolderPattern,
}
