/**
 * Codebase convention scanner
 * Scans project for test file conventions and persists to .taro/conventions.json
 */

import { readdir, readFile, mkdir, writeFile, access } from 'node:fs/promises'
import { join, extname, relative, isAbsolute } from 'node:path'
import pc from 'picocolors'
import { DEFAULT_CONVENTIONS } from '../types/conventions.js'
import type { ConventionsSchema, ConventionFile, ImportStyle, MockPattern } from '../types/conventions.js'

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

/**
 * Recursively find all test files in a directory
 * @param root - Root directory to scan
 * @returns Array of absolute paths to test files
 */
export async function findTestFiles(root: string): Promise<string[]> {
  const results: string[] = []

  async function walk(dir: string): Promise<void> {
    let entries
    try {
      entries = await readdir(dir, { withFileTypes: true })
    } catch {
      // Skip directories we can't read
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

export interface TestFileContent {
  path: string
  content: string
}

export interface RepoRenderTargetCandidate {
  symbol: string
  importPath: string
  sourceTestFile: string
  helperNames: string[]
  usesWithin: boolean
}

/**
 * Load discovered test files with content for downstream analyzers.
 */
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

/**
 * Analyze a single test file to detect its conventions
 * @param filePath - Absolute path to the test file
 * @returns ConventionFile with detected conventions
 */
async function analyzeTestFile(filePath: string): Promise<ConventionFile> {
  let content: string
  try {
    content = await readFile(filePath, 'utf-8')
  } catch {
    // If we can't read the file, return defaults
    return {
      path: filePath,
      importStyle: 'esm',
      hasDescribeBlock: false,
      mockPattern: 'none',
      hasHelperWithExpect: false,
    }
  }

  // Detect import style: require() indicates CJS
  const importStyle: ImportStyle = content.includes('require(') ? 'cjs' : 'esm'

  // Detect describe block
  const hasDescribeBlock = content.includes('describe(')

  // Detect mock pattern
  let mockPattern: MockPattern = 'none'
  if (content.includes('vi.mock(')) {
    mockPattern = 'vi.mock'
  } else if (content.includes('jest.mock(')) {
    mockPattern = 'jest.mock'
  }

  // Detect helper functions with expect() - simplified heuristic
  // Look for function declarations that contain expect( but are not in it/test/describe blocks
  const hasHelperWithExpect = detectHelperWithExpect(content)

  return {
    path: filePath,
    importStyle,
    hasDescribeBlock,
    mockPattern,
    hasHelperWithExpect,
  }
}

/**
 * Detect if file has helper functions containing expect()
 * Uses simple heuristic: has expect( and a function declaration
 */
function detectHelperWithExpect(content: string): boolean {
  // If no expect at all, return false
  if (!content.includes('expect(')) {
    return false
  }

  // Simple heuristic: has function declaration/arrow function AND expect
  // This catches most helper patterns
  const hasFunction = /function\s+\w+|const\s+\w+\s*=\s*(?:async\s+)?\(|const\s+\w+\s*:\s*(?:Promise<)?\w+>?\s*=\s*(?:async\s+)?\(/.test(
    content
  )

  return hasFunction && content.includes('expect(')
}

/**
 * Derive conventions from analyzed files
 * @param files - Array of analyzed ConventionFile objects
 * @param projectRoot - Root directory of the project
 * @returns ConventionsSchema with derived conventions
 */
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

  // Majority vote for import style
  const esmCount = files.filter((f) => f.importStyle === 'esm').length
  const cjsCount = files.filter((f) => f.importStyle === 'cjs').length
  const importStyle: ImportStyle = cjsCount > esmCount ? 'cjs' : 'esm'

  // Mock pattern: any vi.mock wins, then jest.mock, else none
  const hasViMock = files.some((f) => f.mockPattern === 'vi.mock')
  const hasJestMock = files.some((f) => f.mockPattern === 'jest.mock')
  let mockPattern: MockPattern = 'none'
  if (hasViMock) {
    mockPattern = 'vi.mock'
  } else if (hasJestMock) {
    mockPattern = 'jest.mock'
  }

  // Folder pattern detection
  const folderPattern = detectFolderPattern(files, projectRoot)

  // File extension majority
  const fileExtension = detectFileExtension(files)

  return {
    scannedAt: new Date().toISOString(),
    projectRoot,
    importStyle,
    mockPattern,
    testFiles: files,
    folderPattern,
    fileExtension,
  }
}

/**
 * Detect folder pattern from test files
 */
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
  } else if (hasTestsDir) {
    return '__tests__'
  } else {
    return 'colocated'
  }
}

/**
 * Detect majority file extension
 */
function detectFileExtension(
  files: ConventionFile[]
): 'ts' | 'tsx' | 'js' | 'jsx' | 'mixed' {
  const extensions = files.map((f) => {
    const ext = extname(f.path).slice(1) // remove leading dot
    if (ext === 'ts' || ext === 'tsx') {
      return 'ts' // normalize to ts
    }
    return 'js' // normalize to js
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

  return 'ts' // default
}

/**
 * Read conventions from .taro/conventions.json
 * @param projectRoot - Root directory of the project
 * @returns ConventionsSchema or null if not found
 */
export async function readConventions(
  projectRoot: string
): Promise<ConventionsSchema | null> {
  const conventionsPath = join(projectRoot, '.taro', 'conventions.json')

  try {
    await access(conventionsPath)
    const content = await readFile(conventionsPath, 'utf-8')
    return JSON.parse(content) as ConventionsSchema
  } catch {
    // File doesn't exist or can't be read
    return null
  }
}

/**
 * Scan project for test conventions
 * @param projectRoot - Root directory of the project
 * @returns ConventionsSchema with detected conventions
 */
export async function scanConventions(
  projectRoot: string
): Promise<ConventionsSchema> {
  // Step 1: Find all test files
  const files = await findTestFiles(projectRoot)

  // Step 2: If no files found, return defaults
  if (files.length === 0) {
    const conventions: ConventionsSchema = {
      ...DEFAULT_CONVENTIONS,
      scannedAt: new Date().toISOString(),
      projectRoot,
      testFiles: [],
    }

    // Log warning
    console.log(
      pc.yellow('[taro] CTX: No test files found — using defaults')
    )

    // Persist defaults
    await persistConventions(projectRoot, conventions)

    return conventions
  }

  // Step 3: Analyze all test files
  const analyzed = await Promise.all(files.map(analyzeTestFile))

  // Step 4: Derive conventions from analyzed files
  const conventions = deriveConventions(analyzed, projectRoot)

  // Step 5: Emit TEST-02 warnings for helpers with expect()
  for (const file of analyzed) {
    if (file.hasHelperWithExpect) {
      console.log(
        pc.yellow(
          `[taro] TEST-02: Helper function with expect() found in ${relative(
            projectRoot,
            file.path
          )}`
        )
      )
    }
  }

  // Step 6: Persist conventions
  await persistConventions(projectRoot, conventions)

  return conventions
}

/**
 * Persist conventions to .taro/conventions.json
 */
export async function persistConventions(
  projectRoot: string,
  conventions: ConventionsSchema
): Promise<void> {
  const taroDir = join(projectRoot, '.taro')

  // Ensure .taro directory exists
  await mkdir(taroDir, { recursive: true })

  // Write conventions.json
  const conventionsPath = join(taroDir, 'conventions.json')
  await writeFile(
    conventionsPath,
    JSON.stringify(conventions, null, 2),
    'utf-8'
  )
}

/**
 * Merge new file conventions into the persisted conventions store.
 */
export async function mergeConventions(
  projectRoot: string,
  newPatterns: ConventionFile
): Promise<void> {
  const existing = await readConventions(projectRoot)

  if (!existing) {
    await scanConventions(projectRoot)
    return
  }

  const normalizedPatterns: ConventionFile = {
    ...newPatterns,
    path: isAbsolute(newPatterns.path)
      ? newPatterns.path
      : join(projectRoot, newPatterns.path),
  }

  const mergedFiles = existing.testFiles.filter(
    (file) => file.path !== normalizedPatterns.path
  )
  mergedFiles.push(normalizedPatterns)

  const conventions = deriveConventions(mergedFiles, projectRoot)
  await persistConventions(projectRoot, conventions)
}

/**
 * Analyze a single test file without rescanning the whole project.
 */
export async function analyzeSingleTestFile(
  projectRoot: string,
  filePath: string
): Promise<ConventionFile> {
  const normalizedPath = isAbsolute(filePath)
    ? filePath
    : join(projectRoot, filePath)

  return analyzeTestFile(normalizedPath)
}

function extractHelperNames(content: string): string[] {
  const matches = content.matchAll(/const\s+([a-z][A-Za-z0-9_]*)\s*=\s*async\s*\(/g)
  return [...new Set([...matches].map((match) => match[1]!))].sort()
}

function extractRenderTargetCandidatesFromFile(
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

export async function discoverRepoRenderTargets(
  projectRoot: string
): Promise<RepoRenderTargetCandidate[]> {
  const testFiles = await readTestFiles(projectRoot)

  return testFiles
    .flatMap((file) => extractRenderTargetCandidatesFromFile(projectRoot, file))
    .sort((left, right) => {
      return (
        left.sourceTestFile.localeCompare(right.sourceTestFile) ||
        left.symbol.localeCompare(right.symbol)
      )
    })
}
