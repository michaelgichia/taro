import { readFile } from 'node:fs/promises'
import { basename, relative } from 'node:path'

import * as babelParser from '@babel/parser'
import * as t from '@babel/types'

import type { Finding } from '#core/findings-reporter.ts'
import { classifyBoundaryKind } from '#core/boundary-learning.ts'
import type {
  AnalyzedRecording,
  ItGroup,
  NormalizedRecording,
  NormalizedStep,
  QueryDescriptor,
  QueryResult,
} from '#types/recording.ts'
import type { RepoRenderTargetCandidate } from '#types/state.ts'

type AccessibleControlKind = 'button' | 'checkbox' | 'combobox' | 'radio' | 'textbox'
type ComponentImportKind = NonNullable<RepoRenderTargetCandidate['importKind']>

interface CollectedText {
  kind: 'heading' | 'text'
  name: string
  level?: number
}

interface CollectedControl {
  kind: AccessibleControlKind
  name: string
  preferredMethod: QueryDescriptor['method']
}

interface CollectedField {
  kind: 'checkbox' | 'combobox' | 'radio' | 'textbox'
  label?: string
  placeholder?: string
}

interface ComponentSurface {
  headings: CollectedText[]
  texts: CollectedText[]
  controls: CollectedControl[]
  fields: CollectedField[]
  hasOpaqueJsx: boolean
  boundaryImports: string[]
}

interface ComponentDefinition {
  importKind: ComponentImportKind
  name: string
  roots: Array<t.JSXElement | t.JSXFragment>
}

export interface ComponentTargetPlan {
  analyzedRecording: AnalyzedRecording
  findings: Finding[]
  queryResults: QueryResult[]
  renderTarget: RepoRenderTargetCandidate
}

const AST_PLUGINS: babelParser.ParserPlugin[] = [
  'jsx',
  'typescript',
  'classProperties',
  'classPrivateProperties',
  'classPrivateMethods',
  'topLevelAwait',
]

const GENERIC_TEXTS = new Set([
  'cancel',
  'close',
  'details',
  'information',
  'loading',
  'next',
  'open',
  'save',
  'submit',
])

function normalizeText(value?: string | null): string | null {
  const normalized = value?.replace(/\s+/g, ' ').trim()
  return normalized ? normalized : null
}

function getJsxName(
  name: t.JSXIdentifier | t.JSXMemberExpression | t.JSXNamespacedName
): string | null {
  if (t.isJSXIdentifier(name)) {
    return name.name
  }

  return null
}

function getStringAttributeValue(
  attribute?: t.JSXAttribute['value'] | null
): string | null {
  if (!attribute) {
    return null
  }

  if (t.isStringLiteral(attribute)) {
    return normalizeText(attribute.value)
  }

  if (t.isJSXExpressionContainer(attribute)) {
    const expression = attribute.expression
    if (t.isStringLiteral(expression)) {
      return normalizeText(expression.value)
    }
    if (t.isTemplateLiteral(expression) && expression.expressions.length === 0) {
      return normalizeText(expression.quasis.map((quasi) => quasi.value.cooked ?? '').join(''))
    }
  }

  return null
}

function getBooleanAttributeValue(attribute?: t.JSXAttribute | null): boolean {
  if (!attribute) {
    return false
  }

  if (attribute.value == null) {
    return true
  }

  if (t.isJSXExpressionContainer(attribute.value) && t.isBooleanLiteral(attribute.value.expression)) {
    return attribute.value.expression.value
  }

  return false
}

function collectLiteralText(node: t.Node | null | undefined): string {
  if (!node) {
    return ''
  }

  if (t.isJSXText(node)) {
    return node.value
  }

  if (t.isStringLiteral(node)) {
    return node.value
  }

  if (t.isTemplateLiteral(node) && node.expressions.length === 0) {
    return node.quasis.map((quasi) => quasi.value.cooked ?? '').join('')
  }

  if (t.isJSXExpressionContainer(node)) {
    return collectLiteralText(node.expression)
  }

  if (t.isJSXElement(node)) {
    return node.children.map((child) => collectLiteralText(child)).join(' ')
  }

  if (t.isJSXFragment(node)) {
    return node.children.map((child) => collectLiteralText(child)).join(' ')
  }

  return ''
}

function collectReturnedJsxRoots(
  node: t.FunctionDeclaration | t.FunctionExpression | t.ArrowFunctionExpression
): Array<t.JSXElement | t.JSXFragment> {
  const roots: Array<t.JSXElement | t.JSXFragment> = []

  const visitExpression = (expression: t.Expression | t.PrivateName | null | undefined) => {
    if (!expression || t.isPrivateName(expression)) {
      return
    }

    if (t.isJSXElement(expression) || t.isJSXFragment(expression)) {
      roots.push(expression)
      return
    }

    if (t.isConditionalExpression(expression)) {
      visitExpression(expression.consequent)
      visitExpression(expression.alternate)
      return
    }

    if (t.isLogicalExpression(expression)) {
      visitExpression(expression.right)
      return
    }

    if (t.isSequenceExpression(expression)) {
      expression.expressions.forEach((part) => visitExpression(part))
      return
    }

    if (t.isArrayExpression(expression)) {
      expression.elements.forEach((part) => {
        if (part && t.isExpression(part)) {
          visitExpression(part)
        }
      })
    }
  }

  if (t.isArrowFunctionExpression(node) && t.isExpression(node.body)) {
    visitExpression(node.body)
    return roots
  }

  const body = node.body
  if (!t.isBlockStatement(body)) {
    return roots
  }

  const visitStatement = (statement: t.Statement) => {
    if (t.isReturnStatement(statement) && statement.argument && t.isExpression(statement.argument)) {
      visitExpression(statement.argument)
      return
    }

    if (t.isBlockStatement(statement)) {
      statement.body.forEach(visitStatement)
      return
    }

    if (t.isIfStatement(statement)) {
      visitStatement(statement.consequent)
      if (statement.alternate) {
        if (t.isStatement(statement.alternate)) {
          visitStatement(statement.alternate)
        } else if (t.isExpression(statement.alternate)) {
          visitExpression(statement.alternate)
        }
      }
      return
    }

    if (t.isSwitchStatement(statement)) {
      for (const switchCase of statement.cases) {
        switchCase.consequent.forEach(visitStatement)
      }
    }
  }

  body.body.forEach(visitStatement)

  return roots
}

function getComponentExpression(
  expression: t.Expression | null | undefined
): t.FunctionExpression | t.ArrowFunctionExpression | null {
  if (!expression) {
    return null
  }

  if (t.isArrowFunctionExpression(expression) || t.isFunctionExpression(expression)) {
    return expression
  }

  if (
    t.isCallExpression(expression) &&
    t.isIdentifier(expression.callee) &&
    ['memo', 'forwardRef'].includes(expression.callee.name)
  ) {
    const firstArg = expression.arguments[0]
    if (firstArg && (t.isArrowFunctionExpression(firstArg) || t.isFunctionExpression(firstArg))) {
      return firstArg
    }
  }

  return null
}

function isComponentLikeName(name: string): boolean {
  return /^[A-Z][A-Za-z0-9]*$/u.test(name)
}

function resolveComponentDefinition(
  source: string,
  defaultNameFallback: string
): ComponentDefinition | null {
  let ast: t.File
  try {
    ast = babelParser.parse(source, {
      sourceType: 'module',
      plugins: AST_PLUGINS,
    })
  } catch {
    return null
  }

  const functions = new Map<
    string,
    t.FunctionDeclaration | t.FunctionExpression | t.ArrowFunctionExpression
  >()
  const exportedNamed = new Set<string>()
  let defaultExport: { name: string; importKind: ComponentImportKind } | null = null

  for (const node of ast.program.body) {
    if (t.isFunctionDeclaration(node) && node.id?.name && isComponentLikeName(node.id.name)) {
      functions.set(node.id.name, node)
      continue
    }

    if (t.isVariableDeclaration(node)) {
      for (const declarator of node.declarations) {
        if (!t.isIdentifier(declarator.id) || !isComponentLikeName(declarator.id.name)) {
          continue
        }

        const componentExpression = declarator.init && t.isExpression(declarator.init)
          ? getComponentExpression(declarator.init)
          : null
        if (componentExpression) {
          functions.set(declarator.id.name, componentExpression)
        }
      }
      continue
    }

    if (t.isExportNamedDeclaration(node)) {
      if (t.isFunctionDeclaration(node.declaration) && node.declaration.id?.name) {
        const name = node.declaration.id.name
        if (isComponentLikeName(name)) {
          functions.set(name, node.declaration)
          exportedNamed.add(name)
        }
      }

      if (t.isVariableDeclaration(node.declaration)) {
        for (const declarator of node.declaration.declarations) {
          if (!t.isIdentifier(declarator.id) || !isComponentLikeName(declarator.id.name)) {
            continue
          }

          const componentExpression = declarator.init && t.isExpression(declarator.init)
            ? getComponentExpression(declarator.init)
            : null
          if (componentExpression) {
            functions.set(declarator.id.name, componentExpression)
            exportedNamed.add(declarator.id.name)
          }
        }
      }

      for (const specifier of node.specifiers) {
        if (t.isExportSpecifier(specifier) && t.isIdentifier(specifier.local)) {
          exportedNamed.add(specifier.local.name)
        }
      }

      continue
    }

    if (t.isExportDefaultDeclaration(node)) {
      if (t.isFunctionDeclaration(node.declaration)) {
        const exportName = node.declaration.id?.name ?? defaultNameFallback
        functions.set(exportName, node.declaration)
        defaultExport = { name: exportName, importKind: 'default' }
        continue
      }

      if (t.isIdentifier(node.declaration)) {
        defaultExport = { name: node.declaration.name, importKind: 'default' }
        continue
      }

      const componentExpression = t.isExpression(node.declaration)
        ? getComponentExpression(node.declaration)
        : null
      if (componentExpression) {
        functions.set(defaultNameFallback, componentExpression)
        defaultExport = { name: defaultNameFallback, importKind: 'default' }
      }
    }
  }

  const selected =
    (defaultExport && functions.has(defaultExport.name)
      ? {
          importKind: defaultExport.importKind,
          name: defaultExport.name,
          node: functions.get(defaultExport.name)!,
        }
      : [...exportedNamed]
          .filter((name) => functions.has(name))
          .map((name) => ({
            importKind: 'named' as const,
            name,
            node: functions.get(name)!,
          }))
          .sort((left, right) => left.name.localeCompare(right.name))[0]) ?? null

  if (!selected) {
    return null
  }

  const roots = collectReturnedJsxRoots(selected.node)
  if (roots.length === 0) {
    return null
  }

  return {
    importKind: selected.importKind,
    name: selected.name,
    roots,
  }
}

function buildBoundaryImports(ast: t.File): string[] {
  const imports = new Set<string>()

  for (const node of ast.program.body) {
    if (!t.isImportDeclaration(node)) {
      continue
    }

    const importPath = node.source.value
    if (
      importPath === 'react' ||
      importPath.startsWith('@testing-library/') ||
      /\.(?:css|scss|sass|less)$/u.test(importPath)
    ) {
      continue
    }

    const kind = classifyBoundaryKind(importPath)
    const importedNames = node.specifiers.flatMap((specifier) => {
      if (t.isImportSpecifier(specifier) && t.isIdentifier(specifier.imported)) {
        return [specifier.imported.name]
      }
      if (t.isImportDefaultSpecifier(specifier)) {
        return [specifier.local.name]
      }
      return []
    })

    if (
      kind !== 'unknown' ||
      importedNames.some((name) => /^use[A-Z].*(Query|Mutation)$/u.test(name))
    ) {
      imports.add(importPath)
    }
  }

  return [...imports].sort()
}

function collectComponentSurface(
  roots: Array<t.JSXElement | t.JSXFragment>,
  boundaryImports: string[]
): ComponentSurface {
  const headings = new Map<string, CollectedText>()
  const texts = new Map<string, CollectedText>()
  const controls = new Map<string, CollectedControl>()
  const fields: CollectedField[] = []
  const labelsById = new Map<string, string>()
  let hasOpaqueJsx = false

  const registerHeading = (name: string, level?: number) => {
    if (!headings.has(name)) {
      headings.set(name, { kind: 'heading', name, level })
    }
  }

  const registerText = (name: string) => {
    if (!texts.has(name) && !headings.has(name)) {
      texts.set(name, { kind: 'text', name })
    }
  }

  const registerControl = (kind: AccessibleControlKind, name: string, preferredMethod: QueryDescriptor['method']) => {
    const key = `${kind}:${name}`
    if (!controls.has(key)) {
      controls.set(key, { kind, name, preferredMethod })
    }
  }

  const visit = (
    node: t.JSXElement | t.JSXFragment,
    context: { wrapperLabel?: string | null } = {}
  ) => {
    if (t.isJSXFragment(node)) {
      for (const child of node.children) {
        if (t.isJSXElement(child) || t.isJSXFragment(child)) {
          visit(child, context)
        }
      }
      return
    }

    const tagName = getJsxName(node.openingElement.name)
    if (!tagName) {
      return
    }

    if (/^[A-Z]/u.test(tagName)) {
      hasOpaqueJsx = true
    }

    const attributes = new Map<string, t.JSXAttribute>()
    for (const attribute of node.openingElement.attributes) {
      if (t.isJSXAttribute(attribute) && t.isJSXIdentifier(attribute.name)) {
        attributes.set(attribute.name.name, attribute)
      }
    }

    const textContent = normalizeText(collectLiteralText(node))
    const ariaLabel = getStringAttributeValue(attributes.get('aria-label')?.value)
    const role = getStringAttributeValue(attributes.get('role')?.value)
    const id = getStringAttributeValue(attributes.get('id')?.value)
    const htmlFor = getStringAttributeValue(attributes.get('htmlFor')?.value)
    const placeholder = getStringAttributeValue(attributes.get('placeholder')?.value)
    const inputType = getStringAttributeValue(attributes.get('type')?.value) ?? 'text'

    if (tagName === 'label') {
      const labelText = ariaLabel ?? textContent
      if (labelText && htmlFor) {
        labelsById.set(htmlFor, labelText)
      }

      for (const child of node.children) {
        if (t.isJSXElement(child) || t.isJSXFragment(child)) {
          visit(child, { wrapperLabel: labelText ?? context.wrapperLabel })
        }
      }
      return
    }

    if ((/^h[1-6]$/u.test(tagName) || role === 'heading') && (ariaLabel ?? textContent)) {
      const level = /^h[1-6]$/u.test(tagName) ? Number(tagName.slice(1)) : undefined
      registerHeading(ariaLabel ?? textContent!, level)
    }

    if (tagName === 'button' || role === 'button') {
      const name = ariaLabel ?? textContent
      if (name) {
        registerControl('button', name, 'getByRole')
      }
    }

    if (tagName === 'input' && ['submit', 'button'].includes(inputType)) {
      const value = getStringAttributeValue(attributes.get('value')?.value)
      const name = ariaLabel ?? value ?? textContent
      if (name) {
        registerControl('button', name, 'getByRole')
      }
    }

    if (tagName === 'input' || tagName === 'textarea' || tagName === 'select') {
      const explicitLabel = ariaLabel ?? context.wrapperLabel ?? (id ? labelsById.get(id) : undefined)
      const kind: CollectedField['kind'] =
        tagName === 'select'
          ? 'combobox'
          : inputType === 'checkbox'
            ? 'checkbox'
            : inputType === 'radio'
              ? 'radio'
              : 'textbox'

      fields.push({
        kind,
        label: explicitLabel,
        placeholder: placeholder ?? undefined,
      })

      if (explicitLabel) {
        registerControl(
          kind,
          explicitLabel,
          kind === 'textbox' ? 'getByLabelText' : 'getByRole'
        )
      } else if (placeholder && kind === 'textbox') {
        registerControl('textbox', placeholder, 'getByPlaceholderText')
      }
    }

    if (
      ['p', 'span', 'legend', 'caption', 'label'].includes(tagName) &&
      textContent &&
      textContent.length >= 4 &&
      !GENERIC_TEXTS.has(textContent.toLowerCase())
    ) {
      registerText(textContent)
    }

    for (const child of node.children) {
      if (t.isJSXElement(child) || t.isJSXFragment(child)) {
        visit(child, context)
      }
    }
  }

  for (const root of roots) {
    visit(root)
  }

  return {
    headings: [...headings.values()].sort((left, right) => left.name.localeCompare(right.name)),
    texts: [...texts.values()].sort((left, right) => left.name.localeCompare(right.name)),
    controls: [...controls.values()].sort((left, right) => left.name.localeCompare(right.name)),
    fields,
    hasOpaqueJsx,
    boundaryImports,
  }
}

function buildRoleQuery(role: string, name: string): { descriptor: QueryDescriptor; query: string } {
  return {
    descriptor: {
      stepId: 'component-step-0',
      method: 'getByRole',
      queryRoot: 'screen',
      role,
      target: name,
      raw: `screen.getByRole('${role}', { name: '${name.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}' })`,
    },
    query: `screen.getByRole('${role}', { name: '${name.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}' })`,
  }
}

function buildTextQuery(method: QueryDescriptor['method'], name: string): { descriptor: QueryDescriptor; query: string } {
  const escaped = name.replace(/\\/g, '\\\\').replace(/'/g, "\\'")
  return {
    descriptor: {
      stepId: 'component-step-0',
      method,
      queryRoot: 'screen',
      target: name,
      raw: `screen.${method}('${escaped}')`,
    },
    query: `screen.${method}('${escaped}')`,
  }
}

function buildAssertionSteps(surface: ComponentSurface): {
  groups: ItGroup[]
  queryResults: QueryResult[]
} {
  const primaryAssertions = [
    ...surface.headings.slice(0, 2).map((heading) => ({
      label: heading.name,
      query: buildRoleQuery('heading', heading.name),
    })),
    ...surface.texts
      .filter((text) => !surface.controls.some((control) => control.name === text.name))
      .slice(0, 2)
      .map((text) => ({
        label: text.name,
        query: buildTextQuery('getByText', text.name),
      })),
  ]

  const controlAssertions = surface.controls.slice(0, 5).map((control) => {
    if (control.preferredMethod === 'getByLabelText') {
      return {
        label: control.name,
        query: buildTextQuery('getByLabelText', control.name),
      }
    }

    if (control.preferredMethod === 'getByPlaceholderText') {
      return {
        label: control.name,
        query: buildTextQuery('getByPlaceholderText', control.name),
      }
    }

    return {
      label: control.name,
      query: buildRoleQuery(control.kind === 'textbox' ? 'textbox' : control.kind, control.name),
    }
  })

  const makeAssertStep = (
    query: ReturnType<typeof buildRoleQuery> | ReturnType<typeof buildTextQuery>,
    index: number
  ): NormalizedStep => ({
    id: `component-step-${index + 1}`,
    action: 'assert',
    originalType: query.descriptor.method,
    source: 'js',
    target: query.descriptor.target,
    metadata: {
      query: {
        ...query.descriptor,
        stepId: `component-step-${index + 1}`,
      },
    },
  })

  const queryResults = [...primaryAssertions, ...controlAssertions].map(({ query }) => ({
    method: query.descriptor.method,
    query: query.query,
    quality:
      query.descriptor.method === 'getByRole' || query.descriptor.method === 'getByLabelText'
        ? ('excellent' as const)
        : query.descriptor.method === 'getByPlaceholderText'
          ? ('good' as const)
          : ('acceptable' as const),
    matcher: '.toBeVisible()',
  }))

  const groups: ItGroup[] = []

  if (primaryAssertions.length > 0) {
    groups.push({
      name: 'renders the primary UI contract',
      steps: primaryAssertions.map(({ query }, index) => makeAssertStep(query, index)),
    })
  }

  if (controlAssertions.length > 0) {
    groups.push({
      name: 'exposes the main interactive controls',
      steps: controlAssertions.map(({ query }, index) =>
        makeAssertStep(query, primaryAssertions.length + index)
      ),
    })
  }

  return { groups, queryResults }
}

function buildAnalyzedRecording(title: string, groups: ItGroup[]): AnalyzedRecording {
  const steps = groups.flatMap((group) => group.steps)
  const recording: NormalizedRecording = {
    title,
    steps,
    rawStepCount: steps.length,
  }

  return {
    ...recording,
    diagnostics: {
      removedCursorWander: 0,
      removedDoubleClickNoise: 0,
      removedRedundantClicks: 0,
      preservedSemanticMarkers: 0,
      unresolvedSemanticMarkers: 0,
      rawStepCount: steps.length,
      filteredStepCount: steps.length,
      intentGroupCount: groups.length,
    },
    intentGroups: groups,
  }
}

export async function inferComponentTargetPlan(params: {
  componentPath: string
  outputPath: string
  projectRoot: string
}): Promise<ComponentTargetPlan> {
  const { componentPath, outputPath, projectRoot } = params
  const source = await readFile(componentPath, 'utf-8')
  const fallbackName = basename(componentPath).replace(/\.[cm]?[jt]sx?$/u, '')
  const definition = resolveComponentDefinition(source, fallbackName)

  if (!definition) {
    return {
      analyzedRecording: buildAnalyzedRecording(fallbackName, []),
      findings: [
        {
          severity: 'BLOCKING',
          category: 'component-target',
          message:
            'Taro could not resolve an exported JSX component from the supplied file. Point target at the component module itself.',
        },
      ],
      queryResults: [],
      renderTarget: {
        symbol: fallbackName,
        importPath: componentPath,
        importKind: 'default',
        sourceTestFile: relative(projectRoot, outputPath),
        helperNames: [],
        usesWithin: false,
      },
    }
  }

  const ast = babelParser.parse(source, {
    sourceType: 'module',
    plugins: AST_PLUGINS,
  })
  const boundaryImports = buildBoundaryImports(ast)
  const surface = collectComponentSurface(definition.roots, boundaryImports)
  const { groups, queryResults } = buildAssertionSteps(surface)

  const findings: Finding[] = []
  if (surface.boundaryImports.length > 0) {
    findings.push({
      severity: 'ADVISORY',
      category: 'boundary',
      message: `Component inference detected external collaborators: ${surface.boundaryImports.slice(0, 3).join(', ')}.`,
    })
  }

  if (groups.length === 0) {
    findings.unshift({
      severity: 'BLOCKING',
      category: 'component-target',
      message:
        surface.hasOpaqueJsx
          ? 'Taro could not infer stable user-visible assertions from this component because it mostly renders opaque child components.'
          : 'Taro could not infer stable user-visible assertions from this component. Add clearer accessible copy or use --recording.',
    })
  }

  return {
    analyzedRecording: buildAnalyzedRecording(definition.name, groups),
    findings,
    queryResults,
    renderTarget: {
      symbol: definition.name,
      importPath: componentPath,
      importKind: definition.importKind,
      sourceTestFile: relative(projectRoot, outputPath),
      helperNames: [],
      usesWithin: false,
      evidenceTerms: [
        definition.name,
        ...surface.headings.slice(0, 2).map((heading) => heading.name),
        ...surface.controls.slice(0, 2).map((control) => control.name),
      ],
    },
  }
}
