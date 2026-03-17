/**
 * Generate command
 * Internal runtime-only generation pipeline for Testing Library Recorder JS exports.
 */

import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { cwd, stdin, stdout } from 'node:process'

import { Command } from 'commander'
import pc from 'picocolors'
import { createActor } from 'xstate'

import { createGenerateMachine } from '#cli/commands/generate.machine.ts'
import type { GenerateMachineActors } from '#cli/commands/generate.machine.ts'
import * as actors from '#cli/commands/generate.actors.ts'
import type { GenerateMachineContext } from '#cli/commands/generate.utils.ts'
import {
  flushFindings,
  type SelectorDebugReporter,
} from '#cli/commands/generate.utils.ts'
import type { ReplayStepDebugTrace } from '#core/resolver.ts'
import type { SelectorResolutionResult } from '#types/recording.ts'

export { generateCommandInternals } from '#cli/commands/generate.utils.ts'

interface GenerateCommandContext {
  input?: Pick<typeof stdin, 'isTTY'>
  output?: Pick<typeof stdout, 'isTTY'>
}

type DebugTraceRecord =
  | {
      kind: 'replay-attempt'
      action: string
      error?: string
      fallbackLocators?: string[]
      locatorSource: string
      locatorValue?: string
      pageTitle?: string
      pageUrl?: string
      playwrightAction: string
      result: string
      stepId?: string
      target?: string
      timeoutMs: number
    }
  | {
      kind: 'selector-resolution'
      cssSelector: string
      derivedQuery?: string
      inspectSource: string
      inspectionError?: string
      pageUrl?: string
      phase?: string
      reason?: string
      result: string
      stepId: string
    }
  | {
      kind: 'step-summary'
      action: string
      replayed: boolean
      selectorsResolved: number
      selectorsStillUnresolved: number
      stepId: string
      warningCount: number
    }
  | {
      kind: 'replay-browser-failure'
      authStrategy?: string
      error: string
      url: string
    }

/**
 * Writes an operational log line to stderr.
 *
 * Stdout is reserved for the findings envelope, so callers must use this helper
 * for routine status output from the generation pipeline.
 *
 * @param {string} msg - Supplies the already-formatted message to emit as a single stderr line.
 */
function log(msg: string): void {
  process.stderr.write(msg + '\n')
}

/**
 * Builds a selector replay reporter that mirrors debug traces to stderr and optionally persists them as JSONL.
 *
 * When `enabled` is false, the returned reporter becomes a no-op even if a JSON path is provided.
 * When `jsonPath` is set, `persist()` writes one serialized trace record per line.
 *
 * @param {{ enabled: boolean, jsonPath?: string }} options - Enables live tracing and, when `jsonPath` is set, records structured diagnostics for later inspection.
 * @returns {SelectorDebugReporter} A reporter with replay, selector, step-summary, and browser-failure hooks for the JS generation pipeline.
 */
function createSelectorDebugReporter(options: {
  enabled: boolean
  jsonPath?: string
}): SelectorDebugReporter {
  const records: DebugTraceRecord[] = []

  const emit = (record: DebugTraceRecord, line: string) => {
    if (!options.enabled) {
      return
    }

    log(line)
    if (options.jsonPath) {
      records.push(record)
    }
  }

  const formatValue = (value: string | number | boolean | undefined) =>
    JSON.stringify(value ?? '')

  return {
    enabled: options.enabled,
    traceReplay(debug: ReplayStepDebugTrace | undefined) {
      if (!options.enabled || !debug) {
        return
      }

      const record: DebugTraceRecord = {
        kind: 'replay-attempt',
        action: debug.action,
        error: debug.error,
        fallbackLocators: debug.fallbackLocators,
        locatorSource: debug.locatorSource,
        locatorValue: debug.locatorValue,
        pageTitle: debug.pageTitle,
        pageUrl: debug.pageUrl,
        playwrightAction: debug.playwrightAction,
        result: debug.result,
        stepId: debug.stepId,
        target: debug.target,
        timeoutMs: debug.timeoutMs,
      }

      emit(
        record,
        [
          '[taro][replay]',
          `step=${debug.stepId ?? '(unknown)'}`,
          `action=${debug.action}`,
          `target=${formatValue(debug.target)}`,
          `url=${formatValue(debug.pageUrl)}`,
          `locatorSource=${debug.locatorSource}`,
          `locatorValue=${formatValue(debug.locatorValue)}`,
          `playwrightAction=${formatValue(debug.playwrightAction)}`,
          `timeoutMs=${debug.timeoutMs}`,
          `result=${debug.result}`,
          `error=${formatValue(debug.error)}`,
        ].join(' ')
      )
    },
    traceSelector(result: SelectorResolutionResult) {
      if (!options.enabled || !result.debug) {
        return
      }

      const record: DebugTraceRecord = {
        kind: 'selector-resolution',
        cssSelector: result.debug.cssSelector,
        derivedQuery: result.debug.derivedQuery,
        inspectSource: result.debug.inspectSource,
        inspectionError: result.debug.inspectionError,
        pageUrl: result.debug.pageUrl,
        phase: result.debug.phase,
        reason:
          result.status === 'unresolved'
            ? result.reason
            : result.debug.reason,
        result: result.status,
        stepId: result.stepId,
      }

      emit(
        record,
        [
          '[taro][selector]',
          `step=${result.stepId}`,
          `css=${formatValue(result.debug.cssSelector)}`,
          `phase=${result.debug.phase ?? 'n/a'}`,
          `inspectSource=${result.debug.inspectSource}`,
          `url=${formatValue(result.debug.pageUrl)}`,
          `result=${result.status}`,
          `reason=${formatValue(
            result.status === 'unresolved' ? result.reason : result.debug.reason
          )}`,
          `inspectionError=${formatValue(result.debug.inspectionError)}`,
          `derivedQuery=${formatValue(result.debug.derivedQuery)}`,
        ].join(' ')
      )
    },
    traceStepSummary(record) {
      emit(
        {
          kind: 'step-summary',
          action: record.action,
          replayed: record.replayed,
          selectorsResolved: record.selectorsResolved,
          selectorsStillUnresolved: record.selectorsStillUnresolved,
          stepId: record.stepId,
          warningCount: record.warningCount,
        },
        [
          '[taro][step-summary]',
          `step=${record.stepId}`,
          `action=${record.action}`,
          `replayed=${record.replayed}`,
          `selectorsResolved=${record.selectorsResolved}`,
          `selectorsStillUnresolved=${record.selectorsStillUnresolved}`,
          `warningCount=${record.warningCount}`,
        ].join(' ')
      )
    },
    traceBrowserFailure(record) {
      emit(
        {
          kind: 'replay-browser-failure',
          authStrategy: record.authStrategy,
          error: record.error,
          url: record.url,
        },
        [
          '[taro][replay-browser]',
          `url=${formatValue(record.url)}`,
          `authStrategy=${formatValue(record.authStrategy)}`,
          `error=${formatValue(record.error)}`,
        ].join(' ')
      )
    },
    async persist() {
      if (!options.jsonPath) {
        return
      }

      await mkdir(dirname(options.jsonPath), { recursive: true })
      const body = records.map((record) => JSON.stringify(record)).join('\n')
      await writeFile(options.jsonPath, body.length > 0 ? `${body}\n` : '', 'utf-8')
    },
  }
}

/**
 * Checks whether this command run can support interactive visual-auth recovery.
 *
 * A forced interactive flag bypasses stdio TTY detection.
 *
 * @param {GenerateCommandContext} [context={}] - Supplies optional stdio handles to inspect instead of the process globals.
 * @param {boolean} [forceInteractiveAuth=false] - Forces interactive auth support even when stdin or stdout is not a TTY.
 * @returns {boolean} `true` when interactive auth recovery is allowed for this run.
 */
function hasInteractiveVisualAuthCapabilityLocal(
  context: GenerateCommandContext = {},
  forceInteractiveAuth = false
): boolean {
  return (
    forceInteractiveAuth ||
    Boolean((context.input ?? stdin).isTTY && (context.output ?? stdout).isTTY)
  )
}

/**
 * Creates the internal `__generate` CLI command for recorder-to-RTL generation.
 *
 * The command loads the recorder export, grounds it against repo state and optional visual evidence,
 * resolves selectors, generates the test file, updates Taro state, and exits through the findings envelope.
 *
 * @param {GenerateCommandContext} [context={}] - Supplies optional stdio handles used to detect whether interactive auth recovery is possible.
 * @returns {Command} The configured Commander command instance for internal JS generation.
 */
export function createGenerateCommand(context: GenerateCommandContext = {}): Command {
  const generate = new Command('__generate')

  generate
    .description('Internal runtime-only generator for Testing Library Recorder JS exports')
    .argument('<file>', 'Path to the recorder export file (.js)')
    .option('-i, --interactive-auth', 'Force interactive Playwright auth recovery even when stdio is not detected as TTY')
    .option('--auth <file>', 'Path to a Playwright storageState JSON file for optional visual capture')
    .option('--instructions <file>', 'Path to a non-secret auth instructions file for optional visual capture')
    .option('--no-screenshots', 'Skip optional Playwright screenshots and visual inspection')
    .option('--debug-selectors', 'Emit detailed selector resolution and Playwright replay diagnostics')
    .option('--debug-selectors-json <file>', 'Write selector resolution and Playwright replay diagnostics as JSONL')
    .action(async (file: string) => {
      const filePath = resolve(file)
      const projectRoot = cwd()
      const commandOptions = generate.opts<{
        auth?: string
        debugSelectors?: boolean
        debugSelectorsJson?: string
        interactiveAuth?: boolean
        instructions?: string
        screenshots?: boolean
      }>()
      const debugReporter = createSelectorDebugReporter({
        enabled: Boolean(commandOptions.debugSelectors || commandOptions.debugSelectorsJson),
        jsonPath: commandOptions.debugSelectorsJson
          ? resolve(projectRoot, commandOptions.debugSelectorsJson)
          : undefined,
      })

      // hasInteractiveVisualAuthCapabilityLocal is used by the actor pipeline via context
      // but we keep the reference so the function is not tree-shaken.
      void hasInteractiveVisualAuthCapabilityLocal

      const initialContext: GenerateMachineContext = {
        filePath,
        projectRoot,
        commandOptions,
        debugReporter,
        findings: [],
      }

      const finalState = await new Promise<{ value: string; context: GenerateMachineContext }>((resolvePromise) => {
        const actor = createActor(createGenerateMachine(actors as unknown as GenerateMachineActors), { input: initialContext })

        actor.subscribe((state) => {
          if (state.value === 'done' || state.value === 'failed') {
            resolvePromise({ value: state.value as string, context: state.context })
          }
        })

        actor.start()
      })

      await debugReporter.persist()

      if (finalState.value === 'done') {
        flushFindings(finalState.context.findings)
      } else {
        const err = finalState.context.error
        if (err) {
          const msg = pc.red('Error:') + ` ${err.message}`
          console.error(msg)
          process.stderr.write(msg + '\n')
        }
        process.exit(2)
      }
    })

  return generate
}
