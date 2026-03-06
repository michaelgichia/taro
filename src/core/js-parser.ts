/**
 * Babel AST-based parser for Testing Library Recorder JS output.
 * Parses the JavaScript recording format and produces structured NormalizedRecording.
 */

import * as babelParser from '@babel/parser'
import _traverse from '@babel/traverse'
import type { NormalizedStep, NormalizedAction, QueryQuality, ItGroup } from '../types/recording.js'

// ESM interop for @babel/traverse
const traverse = (_traverse as any).default ?? _traverse

/**
 * Quality classification map for RTL query methods
 */
const QUERY_QUALITY_MAP: Record<string, QueryQuality> = {
  getByRole: 'excellent',
  getByLabelText: 'excellent',
  getByAltText: 'excellent',
  getByTitle: 'acceptable',
  getByText: 'good',
  getByDisplayValue: 'acceptable',
  getByPlaceholderText: 'acceptable',
  getByTestId: 'fragile',
}

/**
 * Classifies a Testing Library query method by quality tier.
 * @param method - The RTL query method name (e.g., 'getByRole', 'getByText')
 * @returns QueryQuality tier
 */
export function classifyQuery(method: string): QueryQuality {
  return QUERY_QUALITY_MAP[method] ?? 'fragile'
}

/**
 * Extracts the environment URL from @jest-environment-options comment.
 * @param code - The JS file content
 * @returns The URL string or undefined if not found
 */
export function extractEnvironmentUrl(code: string): string | undefined {
  const match = code.match(/@jest-environment-options\s*(\{[^}]+\})/)
  if (!match) {
    return undefined
  }
  
  try {
    const parsed = JSON.parse(match[1])
    if (typeof parsed.url === 'string') {
      return parsed.url
    }
    return undefined
  } catch {
    return undefined
  }
}

/**
 * Segments steps into ItGroup[] based on modal boundary detection.
 * Modal boundary: click + assert with matching target name (within 1-2 steps)
 * @param steps - Normalized steps to segment
 * @returns Array of ItGroup
 */
export function segmentIntoItGroups(steps: NormalizedStep[]): ItGroup[] {
  if (steps.length === 0) {
    return []
  }

  const groups: ItGroup[] = []
  let current: NormalizedStep[] = []

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i]
    
    // Check for modal boundary BEFORE adding current step
    // Boundary: current step is click, next step is assert with matching target
    const next = steps[i + 1]
    const isBoundary = 
      step.action === 'click' &&
      step.target &&
      next &&
      next.action === 'assert' &&
      next.target &&
      next.target.toLowerCase().includes(step.target.toLowerCase())

    if (isBoundary) {
      // Check that there's no navigate between click and assert
      const hasNavigateBetween = false // immediate next step is assert
      
      if (!hasNavigateBetween) {
        // Close current group (everything before the boundary click)
        if (current.length > 0) {
          groups.push({ name: current[0]?.target ?? 'flow', steps: current })
        }
        
        // Start new group with the boundary click
        current = [step]
        // Add the assert too
        current.push(next)
        i++ // Skip the assert since we added it
        continue
      }
    }
    
    current.push(step)
  }

  // Push remaining steps as final group
  if (current.length > 0) {
    groups.push({ name: current[0]?.target ?? 'recorded flow', steps: current })
  }

  // If no boundaries found, return single group with all steps
  if (groups.length === 0 && steps.length > 0) {
    return [{ name: 'recorded flow', steps }]
  }

  return groups
}

/**
 * Query selector call extracted from AST
 */
export interface QuerySelectorCall {
  selector: string
  line: number
}

/**
 * Result of parsing a JS recording
 */
export interface JsParseResult {
  title: string
  environmentUrl: string | undefined
  steps: NormalizedStep[]
  querySelectorCalls: QuerySelectorCall[]
  itGroups: ItGroup[]
}

/**
 * Extracts a string argument from a Babel AST node
 */
function extractStringArg(node: any): string | undefined {
  if (!node) return undefined
  
  if (node.type === 'StringLiteral') {
    return node.value
  }
  if (node.type === 'TemplateLiteral' && node.quasis.length > 0) {
    return node.quasis[0].value.cooked
  }
  return undefined
}

/**
 * Maps userEvent method calls to NormalizedAction
 */
function mapUserEventCall(method: string): NormalizedAction {
  const mapping: Record<string, NormalizedAction> = {
    click: 'click',
    dblClick: 'click',
    tripleClick: 'click',
    type: 'fill',
    keyboard: 'keyDown',
    selectOptions: 'select',
    clear: 'fill',
  }
  return mapping[method] ?? 'unknown'
}

/**
 * Parses a Testing Library Recorder JS file into structured result.
 * @param code - The JavaScript file content
 * @returns Promise<JsParseResult>
 */
export async function parseJsRecording(code: string): Promise<JsParseResult> {
  // Validate: detect JSON input
  const trimmed = code.trim()
  if (trimmed.startsWith('{')) {
    throw new Error(
      'Expected JS file from Testing Library Recorder extension. Got JSON — use the Chrome Recorder JSON parser instead.'
    )
  }

  // Extract environment URL
  const environmentUrl = extractEnvironmentUrl(code)

  // Extract title from file
  let title = 'Recorded Flow'
  const titleMatch = code.match(/\/\*\*\s*\n\s*\*\s*([^@\*]+)/)
  if (titleMatch) {
    title = titleMatch[1].trim()
    // Sanitize: strip date suffix and replace hyphens
    title = title.replace(/\s+at\s+\d{1,2}:\d{2}:\d{2}/, '').replace(/-/g, ' ')
  }

  // Parse with Babel
  const ast = babelParser.parse(code, {
    sourceType: 'commonjs',
  })

  const steps: NormalizedStep[] = []
  const querySelectorCalls: QuerySelectorCall[] = []

  // Traverse AST
  traverse(ast, {
    CallExpression(path: any) {
      const callee = path.node.callee
      const line = path.node.loc?.start?.line ?? 0

      // Handle screen.getBy* calls
      if (
        callee.type === 'MemberExpression' &&
        callee.object.type === 'Identifier' &&
        callee.object.name === 'screen' &&
        callee.property.type === 'Identifier'
      ) {
        const methodName = callee.property.name
        if (methodName && methodName.startsWith('getBy')) {
          const target = extractStringArg(path.node.arguments[0])
          // All screen queries become asserts in this implementation
          steps.push({
            action: 'assert',
            target: target ?? methodName,
            value: undefined,
            originalType: methodName,
          })
        }
      }

      // Handle document.querySelector calls
      if (
        callee.type === 'MemberExpression' &&
        callee.object.type === 'Identifier' &&
        callee.object.name === 'document' &&
        callee.property.type === 'Identifier' &&
        callee.property.name === 'querySelector'
      ) {
        const selector = extractStringArg(path.node.arguments[0])
        if (selector) {
          querySelectorCalls.push({ selector, line })
        }
      }

      // Handle userEvent.* calls
      if (
        callee.type === 'MemberExpression' &&
        callee.object.type === 'Identifier' &&
        callee.object.name === 'userEvent'
      ) {
        const methodName = callee.property.name
        if (methodName) {
          const action = mapUserEventCall(methodName)
          // Extract target from first argument (element reference)
          const target = extractStringArg(path.node.arguments[0]) ?? methodName
          // Extract value from second argument for type/keyboard
          const value = extractStringArg(path.node.arguments[1])
          
          steps.push({
            action,
            target,
            value,
            originalType: methodName,
          })
        }
      }

      // Handle await page.goto(url)
      if (
        callee.type === 'MemberExpression' &&
        callee.object.type === 'Identifier' &&
        callee.object.name === 'page' &&
        callee.property.type === 'Identifier' &&
        callee.property.name === 'goto'
      ) {
        const target = extractStringArg(path.node.arguments[0])
        if (target) {
          steps.push({
            action: 'navigate',
            target,
            value: undefined,
            originalType: 'goto',
          })
        }
      }
    },
  })

  // Segment into ItGroups
  const itGroups = segmentIntoItGroups(steps)

  return {
    title,
    environmentUrl,
    steps,
    querySelectorCalls,
    itGroups,
  }
}
