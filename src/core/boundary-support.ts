import { access, mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join, relative, resolve } from 'node:path'
import {
  classifyBoundaryKind,
  discoverBoundaryImportsFromSource,
  getBoundaryGuardrailReason,
} from './boundary-learning.ts'
import type {
  RepoRenderTargetCandidate,
  ResolvedTaroPackageProfile,
  TaroBoundaryKind,
  TaroBoundaryProfile,
} from '../types/state.ts'

export interface BoundarySupportFilePlan {
  path: string
  content: string
  lowConfidence: boolean
}

export interface BoundarySupportPlan {
  importLines: string[]
  mockBlocks: string[]
  setupLines: string[]
  supportFiles: BoundarySupportFilePlan[]
  warnings: string[]
  requiresReview: boolean
}

function toImportPath(fromDir: string, targetPath: string): string {
  const withoutExtension = targetPath.replace(/\.[^.]+$/u, '')
  const relativePath = relative(fromDir, withoutExtension).replace(/\\/g, '/')
  if (relativePath.startsWith('.')) {
    return relativePath
  }
  return `./${relativePath}`
}

function toPascalCase(value: string): string {
  return value
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map((part) => part[0]!.toUpperCase() + part.slice(1))
    .join('')
}

function normalizeBoundaryFileBase(target: string): string {
  return target
    .replace(/^@/u, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
}

function deriveSupportExportNames(target: string) {
  const base = toPascalCase(normalizeBoundaryFileBase(target))
  return {
    factoryExport: `create${base}Mock`,
    resetExport: `reset${base}Mock`,
  }
}

function toUpperCamelHead(value: string): string {
  return value.length === 0 ? value : `${value[0]!.toUpperCase()}${value.slice(1)}`
}

function isScaffoldableBoundaryKind(kind: TaroBoundaryKind): boolean {
  return ['data-module', 'server-action', 'network-client', 'auth'].includes(kind)
}

function deriveSupportPath(
  projectRoot: string,
  packageProfile: ResolvedTaroPackageProfile,
  target: string
): string {
  const preferredRoot =
    packageProfile.fixtureRoots.find((root) => root.source === 'directory' && root.kind === 'mocks')
      ?.path ??
    packageProfile.fixtureRoots.find(
      (root) => root.source === 'directory' && root.kind === 'fixtures'
    )?.path ??
    packageProfile.fixtureRoots.find(
      (root) => root.source === 'directory' && root.kind === 'factories'
    )?.path ??
    `${packageProfile.packagePath === '.' ? '' : `${packageProfile.packagePath}/`}src/tests/mocks`
  const relativeRoot = preferredRoot.replace(/\\/g, '/').replace(/^\.\//u, '')
  return resolve(projectRoot, relativeRoot, `${normalizeBoundaryFileBase(target)}.mock.ts`)
}

function buildVitestMockBlock(target: string, factoryExport: string): string {
  return [
    `vi.mock('${target}', async (importOriginal) => {`,
    `  const actual = await importOriginal<typeof import('${target}')>()`,
    `  return { ...actual, ...${factoryExport}() }`,
    `})`,
  ].join('\n')
}

function buildJestMockBlock(target: string, factoryExport: string): string {
  return [
    `jest.mock('${target}', () => {`,
    `  const actual = jest.requireActual('${target}')`,
    `  return { ...actual, ...${factoryExport}() }`,
    `})`,
  ].join('\n')
}

function buildBoundarySupportPrefix(
  code: string,
  plan: BoundarySupportPlan
): string {
  if (
    plan.importLines.length === 0 &&
    plan.mockBlocks.length === 0 &&
    plan.setupLines.length === 0 &&
    plan.warnings.length === 0
  ) {
    return code
  }

  const lines = code.split('\n')
  let importEnd = 0
  while (importEnd < lines.length) {
    const line = lines[importEnd] ?? ''
    if (
      line.trim() === '' ||
      /^\s*import\b/u.test(line) ||
      /^\s*require\(/u.test(line) ||
      /^\s*const\s+.+\s*=\s*require\(/u.test(line)
    ) {
      importEnd += 1
      continue
    }
    break
  }

  const importSection = lines.slice(0, importEnd).filter((line) => line.trim().length > 0)
  const rest = lines.slice(importEnd).join('\n').trimStart()
  const parts: string[] = []

  if (plan.importLines.length > 0) {
    importSection.push(...plan.importLines)
  }
  parts.push(importSection.join('\n'))

  if (plan.mockBlocks.length > 0) {
    parts.push(plan.mockBlocks.join('\n\n'))
  }

  if (plan.setupLines.length > 0) {
    parts.push(['beforeEach(() => {', ...plan.setupLines.map((line) => `  ${line}`), '})'].join('\n'))
  }

  if (plan.warnings.length > 0) {
    parts.push(plan.warnings.map((warning) => `// taro-boundary-warning: ${warning}`).join('\n'))
  }

  if (rest.length > 0) {
    parts.push(rest)
  }

  return parts.filter((part) => part.trim().length > 0).join('\n\n')
}

function buildScaffoldFile(params: {
  target: string
  importedNames: string[]
}): { content: string; factoryExport: string; resetExport: string; overrideExports: string[]; lowConfidence: boolean } {
  const { factoryExport, resetExport } = deriveSupportExportNames(params.target)
  const hookNames = params.importedNames.filter((name) => name !== 'default')
  const overrideExports: string[] = []
  const defaultImplBlocks: string[] = []
  const exportBlocks: string[] = []
  const resetLines: string[] = []
  let lowConfidence = false

  for (const name of hookNames) {
    const exportName = `${name}Mock`
    overrideExports.push(exportName)

    if (/^use[A-Z].*Mutation/u.test(name) || /Action$/u.test(name)) {
      const defaultImpl = `default${toUpperCamelHead(name)}Impl`
      defaultImplBlocks.push(
        `const ${defaultImpl} = () => ({ mutate: vi.fn(), isPending: false })`
      )
      exportBlocks.push(`export const ${exportName} = vi.fn()`)
      resetLines.push(`${exportName}.mockReset()`)
      resetLines.push(`${exportName}.mockImplementation(${defaultImpl})`)
      continue
    }

    if (/^use[A-Z].*Query/u.test(name)) {
      const defaultImpl = `default${toUpperCamelHead(name)}Impl`
      defaultImplBlocks.push(
        `const ${defaultImpl} = () => ({ data: undefined, isLoading: false, isFetching: false })`
      )
      exportBlocks.push(`export const ${exportName} = vi.fn()`)
      resetLines.push(`${exportName}.mockReset()`)
      resetLines.push(`${exportName}.mockImplementation(${defaultImpl})`)
      lowConfidence = true
      continue
    }

    exportBlocks.push(`export const ${exportName} = vi.fn()`)
    resetLines.push(`${exportName}.mockReset()`)
    lowConfidence = true
  }

  const factoryAssignments = hookNames
    .filter((name) => name !== 'default')
    .map((name) => `    ${name}: ${name}Mock,`)

  const content = [
    `import { vi } from 'vitest'`,
    ``,
    `/**`,
    ` * Low-confidence scaffold for ${params.target}.`,
    ` * Replace default return shapes with repo-specific fixtures or wrappers as the codebase teaches Taro more.`,
    ` */`,
    ...(defaultImplBlocks.length > 0 ? [...defaultImplBlocks, ''] : []),
    ...exportBlocks,
    ``,
    `export function ${factoryExport}() {`,
    `  return {`,
    ...factoryAssignments,
    `  }`,
    `}`,
    ``,
    `export function ${resetExport}() {`,
    ...(resetLines.length > 0 ? resetLines.map((line) => `  ${line}`) : ['  // TODO: add reset behavior once concrete support exports exist']),
    `}`,
    ``,
  ].join('\n')

  return {
    content,
    factoryExport,
    resetExport,
    overrideExports,
    lowConfidence,
  }
}

async function scaffoldBoundaryProfile(params: {
  projectRoot: string
  outputPath: string
  packageProfile: ResolvedTaroPackageProfile
  target: string
  importedNames: string[]
}): Promise<{ profile: TaroBoundaryProfile; filePlan: BoundarySupportFilePlan; warning: string }> {
  const supportPath = deriveSupportPath(params.projectRoot, params.packageProfile, params.target)
  const fromDir = dirname(params.outputPath)
  const scaffold = buildScaffoldFile({
    target: params.target,
    importedNames: params.importedNames,
  })

  return {
    profile: {
      target: params.target,
      kind: classifyBoundaryKind(params.target),
      strategy: 'scaffolded-module-factory',
      guardrailReason: null,
      supportImportPath: toImportPath(fromDir, supportPath),
      supportPath: relative(params.projectRoot, supportPath).replace(/\\/g, '/'),
      supportExports: {
        factoryExport: scaffold.factoryExport,
        resetExport: scaffold.resetExport,
        overrideExports: scaffold.overrideExports,
        spyExports: [],
        fixtureExports: [],
      },
      payloadSource: 'typed-defaults',
      confidence: 'low',
      files: [],
      evidence: ['Generated low-confidence scaffold'],
      conflictTargets: [],
      lowConfidenceScaffold: scaffold.lowConfidence,
    },
    filePlan: {
      path: supportPath,
      content: scaffold.content,
      lowConfidence: scaffold.lowConfidence,
    },
    warning:
      `Scaffolded central boundary support for ${params.target}; replace generic defaults in ${relative(params.projectRoot, supportPath).replace(/\\/g, '/')} once repo fixtures are available.`,
  }
}

export async function planBoundarySupport(params: {
  projectRoot: string
  outputPath: string
  packageProfile: ResolvedTaroPackageProfile | null
  renderTargetFile: string | null
  renderTarget: RepoRenderTargetCandidate | null
}): Promise<BoundarySupportPlan> {
  const plan: BoundarySupportPlan = {
    importLines: [],
    mockBlocks: [],
    setupLines: [],
    supportFiles: [],
    warnings: [],
    requiresReview: false,
  }

  const { packageProfile, renderTargetFile } = params
  if (!packageProfile || !renderTargetFile) {
    return plan
  }

  const discoveredImports = await discoverBoundaryImportsFromSource(renderTargetFile)
  if (discoveredImports.length === 0) {
    return plan
  }

  const boundaryProfiles = new Map(
    packageProfile.boundaryProfiles.map((profile) => [profile.target, profile])
  )
  const exemplar =
    params.renderTarget &&
    packageProfile.boundaryExemplars.find(
      (candidate) => candidate.file === params.renderTarget?.sourceTestFile
    )
  const relevantTargets = new Set(exemplar?.boundaryTargets ?? [])
  if (relevantTargets.size === 0) {
    for (const importedBoundary of discoveredImports) {
      if (
        isScaffoldableBoundaryKind(importedBoundary.kind) ||
        importedBoundary.kind === 'router'
      ) {
        relevantTargets.add(importedBoundary.target)
      }
    }
  }

  for (const importedBoundary of discoveredImports) {
    if (importedBoundary.guardrailReason) {
      const conflictingProfile = boundaryProfiles.get(importedBoundary.target) ?? null
      if (conflictingProfile && conflictingProfile.strategy !== 'forbid') {
        plan.warnings.push(
          `Keeping ${importedBoundary.target} real at test time because it is a ${importedBoundary.guardrailReason}; fix environment issues at the source instead of mocking around the UI boundary.`
        )
        plan.requiresReview = true
      }
      continue
    }
    if (!relevantTargets.has(importedBoundary.target)) {
      continue
    }

    let profile = boundaryProfiles.get(importedBoundary.target) ?? null
    if (!profile && packageProfile.effectiveQueryHookPolicy === 'avoid' && isScaffoldableBoundaryKind(importedBoundary.kind)) {
      const scaffolded = await scaffoldBoundaryProfile({
        projectRoot: params.projectRoot,
        outputPath: params.outputPath,
        packageProfile,
        target: importedBoundary.target,
        importedNames: importedBoundary.importedNames,
      })
      profile = scaffolded.profile
      plan.supportFiles.push(scaffolded.filePlan)
      plan.warnings.push(scaffolded.warning)
      plan.requiresReview = plan.requiresReview || scaffolded.filePlan.lowConfidence
    }

    if (!profile) {
      continue
    }

    if (
      profile.strategy !== 'shared-module-factory' &&
      profile.strategy !== 'scaffolded-module-factory'
    ) {
      continue
    }

    if (getBoundaryGuardrailReason(profile.target, importedBoundary.importedNames)) {
      plan.warnings.push(
        `Keeping ${profile.target} real at test time because it is a protected UI boundary; fix environment issues at the source instead of mocking around the UI boundary.`
      )
      plan.requiresReview = true
      continue
    }

    if (!profile.supportImportPath || !profile.supportExports.factoryExport) {
      plan.warnings.push(
        `Boundary profile for ${profile.target} is incomplete; generated test kept runtime boundary handling explicit.`
      )
      plan.requiresReview = true
      continue
    }

    const imports = [profile.supportExports.factoryExport]
    if (profile.supportExports.resetExport) {
      imports.push(profile.supportExports.resetExport)
      plan.setupLines.push(`${profile.supportExports.resetExport}()`)
    }

    const importLine = `import { ${imports.join(', ')} } from '${profile.supportImportPath}'`
    if (!plan.importLines.includes(importLine)) {
      plan.importLines.push(importLine)
    }

    const mockBlock =
      packageProfile.effectiveRunner === 'jest' ||
      packageProfile.mockPattern.value === 'jest.mock'
        ? buildJestMockBlock(profile.target, profile.supportExports.factoryExport)
        : buildVitestMockBlock(profile.target, profile.supportExports.factoryExport)
    if (!plan.mockBlocks.includes(mockBlock)) {
      plan.mockBlocks.push(mockBlock)
    }

    if (profile.lowConfidenceScaffold) {
      plan.requiresReview = true
    }
  }

  return plan
}

export async function materializeBoundarySupport(plan: BoundarySupportPlan): Promise<void> {
  for (const filePlan of plan.supportFiles) {
    try {
      await access(filePlan.path)
      continue
    } catch {
      await mkdir(dirname(filePlan.path), { recursive: true })
      await writeFile(filePlan.path, filePlan.content, 'utf-8')
    }
  }
}

export function applyBoundarySupport(code: string, plan: BoundarySupportPlan): string {
  return buildBoundarySupportPrefix(code, plan)
}

export async function readBoundarySupportFile(filePath: string): Promise<string | null> {
  try {
    return await readFile(filePath, 'utf-8')
  } catch {
    return null
  }
}
