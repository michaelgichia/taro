import * as babelParser from '@babel/parser'
import type { NodePath } from '@babel/traverse'
import _traverse from '@babel/traverse'
import * as t from '@babel/types'

import { getBoundaryGuardrailReason } from '#core/boundary-learning.ts'

const traverse = (_traverse as any).default ?? _traverse

const LEAF_RENDER_SUFFIX = /(Form|Dialog|Modal|Drawer)$/u
const TEST_CALLBACKS = new Set([
  'describe',
  'it',
  'test',
  'beforeEach',
  'beforeAll',
  'afterEach',
  'afterAll',
])

type BoundaryIssueKind =
  | 'leaf-render-boundary'
  | 'inline-hook-mock'
  | 'helper-embedded-assertion'
  | 'protected-ui-boundary-mock'
  | 'positional-control-selection'

interface BoundaryIssue {
  kind: BoundaryIssueKind
  severity: 'warning'
  message: string
  suggestion: string
}

function clampScore(score: number): number {
  return Math.min(100, Math.max(0, Math.round(score)))
}

function getCalleeName(node?: t.Node | null): string | undefined {
  if (!node) {
    return undefined
  }

  if (t.isIdentifier(node)) {
    return node.name
  }

  if (t.isMemberExpression(node) && !node.computed && t.isIdentifier(node.property)) {
    return node.property.name
  }

  return undefined
}

function isFrameworkCallback(path: NodePath<t.Function>): boolean {
  const parentCall = path.findParent((candidate) => {
    if (!candidate.isCallExpression()) {
      return false
    }

    const callbackArg = candidate.node.arguments.find((argument) => argument === path.node)
    return Boolean(callbackArg)
  })

  if (!parentCall?.isCallExpression()) {
    return false
  }

  const calleeName = getCalleeName(parentCall.node.callee)
  return calleeName ? TEST_CALLBACKS.has(calleeName) : false
}

function functionContainsExpect(path: NodePath<t.Function>): boolean {
  let found = false

  path.traverse({
    CallExpression(innerPath) {
      if (getCalleeName(innerPath.node.callee) === 'expect') {
        found = true
        innerPath.stop()
      }
    },
  })

  return found
}

function getReturnedObjectExpression(
  node?: t.Expression | t.SpreadElement | t.ArgumentPlaceholder | null
): t.ObjectExpression | undefined {
  if (!node || !t.isExpression(node)) {
    return undefined
  }

  if (t.isObjectExpression(node)) {
    return node
  }

  if (t.isArrowFunctionExpression(node)) {
    if (t.isObjectExpression(node.body)) {
      return node.body
    }

    if (t.isBlockStatement(node.body)) {
      const returnStatement = node.body.body.find((statement) => t.isReturnStatement(statement))
      if (returnStatement?.argument && t.isObjectExpression(returnStatement.argument)) {
        return returnStatement.argument
      }
    }
  }

  if (t.isFunctionExpression(node)) {
    const returnStatement = node.body.body.find((statement) => t.isReturnStatement(statement))
    if (returnStatement?.argument && t.isObjectExpression(returnStatement.argument)) {
      return returnStatement.argument
    }
  }

  return undefined
}

function getReturnedPropertyNames(node: t.ObjectExpression | undefined): string[] {
  if (!node) {
    return []
  }

  const names = new Set<string>()
  for (const property of node.properties) {
    if (t.isObjectProperty(property)) {
      if (t.isIdentifier(property.key)) {
        names.add(property.key.name)
      } else if (t.isStringLiteral(property.key)) {
        names.add(property.key.value)
      }
      continue
    }

    if (t.isObjectMethod(property) && t.isIdentifier(property.key)) {
      names.add(property.key.name)
    }
  }

  return [...names].sort()
}

function collectRenderedComponentNames(
  node: t.Node | null | undefined,
  names: Set<string>
): void {
  if (!node) {
    return
  }

  if (t.isJSXElement(node)) {
    if (t.isJSXIdentifier(node.openingElement.name) && /^[A-Z]/u.test(node.openingElement.name.name)) {
      names.add(node.openingElement.name.name)
    }

    for (const child of node.children) {
      collectRenderedComponentNames(child, names)
    }

    return
  }

  if (t.isJSXFragment(node)) {
    for (const child of node.children) {
      collectRenderedComponentNames(child, names)
    }
  }
}

export const __boundaryIntelligenceTestUtils = {
  collectRenderedComponentNames,
  getCalleeName,
}

export function analyzeBoundaryIsolation(code: string): BoundaryIssue[] {
  let ast
  try {
    ast = babelParser.parse(code, {
      plugins: ['jsx', 'typescript'],
      sourceType: 'unambiguous',
    })
  } catch {
    return []
  }

  const renderedComponents = new Set<string>()
  const helperNamesWithExpect = new Set<string>()
  const inlineHookMocks = new Set<string>()
  const protectedUiBoundaryMocks = new Set<string>()
  const allByRoleCollections = new Set<string>()
  let hasButtonQuery = false
  let hasHeadingQuery = false
  let hasPositionalControlSelection = false

  traverse(ast, {
    FunctionDeclaration(path: NodePath<t.FunctionDeclaration>) {
      if (isFrameworkCallback(path) || !functionContainsExpect(path)) {
        return
      }

      if (path.node.id?.name) {
        helperNamesWithExpect.add(path.node.id.name)
      }
    },
    ArrowFunctionExpression(path: NodePath<t.ArrowFunctionExpression>) {
      if (isFrameworkCallback(path) || !functionContainsExpect(path)) {
        return
      }

      const parent = path.parentPath
      if (parent.isVariableDeclarator() && t.isIdentifier(parent.node.id)) {
        helperNamesWithExpect.add(parent.node.id.name)
      }
    },
    CallExpression(path: NodePath<t.CallExpression>) {
      const calleeName = getCalleeName(path.node.callee)

      if (calleeName === 'render') {
        const renderArg = path.node.arguments[0]
        if (renderArg && t.isExpression(renderArg)) {
          collectRenderedComponentNames(renderArg, renderedComponents)
        }
      }

      if (
        t.isMemberExpression(path.node.callee) &&
        !path.node.callee.computed &&
        t.isIdentifier(path.node.callee.property) &&
        ['getByRole', 'findByRole', 'getAllByRole'].includes(path.node.callee.property.name)
      ) {
        const roleArg = path.node.arguments[0]
        if (t.isStringLiteral(roleArg)) {
          if (roleArg.value === 'button') {
            hasButtonQuery = true
          }
          if (roleArg.value === 'heading') {
            hasHeadingQuery = true
          }
        }
      }

      if (
        t.isMemberExpression(path.node.callee) &&
        !path.node.callee.computed &&
        t.isIdentifier(path.node.callee.property, { name: 'getAllByRole' }) &&
        path.parentPath.isVariableDeclarator() &&
        t.isIdentifier(path.parentPath.node.id)
      ) {
        allByRoleCollections.add(path.parentPath.node.id.name)
      }

      if (
        t.isMemberExpression(path.node.callee) &&
        !path.node.callee.computed &&
        t.isIdentifier(path.node.callee.property, { name: 'getAllByRole' }) &&
        path.parentPath.isMemberExpression() &&
        path.parentPath.node.computed &&
        t.isNumericLiteral(path.parentPath.node.property)
      ) {
        hasPositionalControlSelection = true
      }

      if (
        t.isMemberExpression(path.node.callee) &&
        !path.node.callee.computed &&
        t.isIdentifier(path.node.callee.object) &&
        ['vi', 'jest'].includes(path.node.callee.object.name) &&
        t.isIdentifier(path.node.callee.property, { name: 'mock' })
      ) {
        const targetArg = path.node.arguments[0]
        const target =
          t.isStringLiteral(targetArg)
            ? targetArg.value
            : t.isTemplateLiteral(targetArg) && targetArg.expressions.length === 0
              ? targetArg.quasis[0]?.value.cooked ?? null
              : null
        const factory = path.node.arguments[1]
        const objectExpression = getReturnedObjectExpression(factory)
        const returnedPropertyNames = getReturnedPropertyNames(objectExpression)
        const guardrailReason =
          target && getBoundaryGuardrailReason(target, returnedPropertyNames)

        if (guardrailReason === 'repo-owned-ui-wrapper' && target) {
          protectedUiBoundaryMocks.add(target)
        }

        if (!objectExpression) {
          return
        }

        for (const property of objectExpression.properties) {
          if (
            t.isObjectProperty(property) &&
            !property.computed &&
            ((t.isIdentifier(property.key) && /^use[A-Z].*(Query|Mutation)$/u.test(property.key.name)) ||
              (t.isStringLiteral(property.key) &&
                /^use[A-Z].*(Query|Mutation)$/u.test(property.key.value)))
          ) {
            const key = t.isIdentifier(property.key) ? property.key.name : property.key.value
            inlineHookMocks.add(key)
          }
        }
      }
    },
    MemberExpression(path: NodePath<t.MemberExpression>) {
      if (
        path.node.computed &&
        t.isIdentifier(path.node.object) &&
        allByRoleCollections.has(path.node.object.name) &&
        t.isNumericLiteral(path.node.property)
      ) {
        hasPositionalControlSelection = true
      }
    },
  })

  const issues: BoundaryIssue[] = []

  if (
    [...renderedComponents].some((componentName) => LEAF_RENDER_SUFFIX.test(componentName)) &&
    hasButtonQuery &&
    hasHeadingQuery
  ) {
    issues.push({
      kind: 'leaf-render-boundary',
      severity: 'warning',
      message:
        'Generated test renders a leaf form/dialog component while replaying a larger container flow.',
      suggestion:
        'Prefer the nearest module/page boundary that owns the trigger button and dialog lifecycle instead of rendering the form directly.',
    })
  }

  if (inlineHookMocks.size > 0) {
    issues.push({
      kind: 'inline-hook-mock',
      severity: 'warning',
      message: `Generated test defines internal hook mocks inline: ${[...inlineHookMocks].join(', ')}.`,
      suggestion:
        'Prefer a shared fixture or a higher render boundary so the test is not coupled to every use*Query/use*Mutation hook.',
    })
  }

  if (helperNamesWithExpect.size > 0) {
    issues.push({
      kind: 'helper-embedded-assertion',
      severity: 'warning',
      message: `Helper functions contain assertions: ${[...helperNamesWithExpect].join(', ')}.`,
      suggestion:
        'Keep helper functions focused on navigation/setup and leave meaningful assertions in the test body.',
    })
  }

  if (protectedUiBoundaryMocks.size > 0) {
    issues.push({
      kind: 'protected-ui-boundary-mock',
      severity: 'warning',
      message: `Generated test mocks protected repo-owned UI boundaries: ${[...protectedUiBoundaryMocks].join(', ')}.`,
      suggestion:
        'Keep repo-owned UI wrappers real in tests and fix portal, animation, or cleanup issues in the environment instead of replacing the component with a fake.',
    })
  }

  if (hasPositionalControlSelection) {
    issues.push({
      kind: 'positional-control-selection',
      severity: 'warning',
      message: 'Generated test relies on positional indexing from getAllByRole(...)[n].',
      suggestion:
        'Scope to the active container with within(...) or target a more specific accessible name instead of indexing controls by position.',
    })
  }

  return issues
}

export function calculateBoundaryIsolationScore(code: string): number {
  const penalties: Record<BoundaryIssueKind, number> = {
    'leaf-render-boundary': 35,
    'inline-hook-mock': 30,
    'helper-embedded-assertion': 20,
    'protected-ui-boundary-mock': 30,
    'positional-control-selection': 15,
  }

  const score = analyzeBoundaryIsolation(code).reduce((runningTotal, issue) => {
    return runningTotal - penalties[issue.kind]
  }, 100)

  return clampScore(score)
}
