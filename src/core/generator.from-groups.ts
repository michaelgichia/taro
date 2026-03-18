import { USER_EVENT_ACTIONS } from '#core/constant.ts'
import type { GeneratedTestV3,GenerateFromGroupsOptions } from '#core/types.ts'
import {
  buildHelperStepLines,
  dedupeMarkerAssertions,
  getScenarioHelperRefs,
  getSelectorCheckpoint,
  inferAssertionMatcher,
  reconstructQuery,
  renderMarkerAssertionGroup,
} from '#core/utils.ts'
import { describeBlockMultiIt, importBlock, stepTemplate } from '#templates/test-template.ts'
import type {
  ItGroup,
  JsScenarioPlan,
  NormalizedStep,
  PlannedMarkerAssertion,
} from '#types/recording.ts'

export function generateTestFromGroups(
  title: string,
  itGroups: ItGroup[],
  options: GenerateFromGroupsOptions = {}
): GeneratedTestV3 {
  const {
    conventions,
    runner = 'unknown',
    jestDomImportPath: configuredJestDomImportPath,
    queryResults = [],
    outputPath,
    helpers = [],
    scenarios,
    renderTarget = null,
    renderHelper = null,
  } = options
  const importStyle = conventions?.importStyle ?? 'esm'
  const jestDomImportPath =
    configuredJestDomImportPath === undefined
      ? runner === 'vitest'
        ? '@testing-library/jest-dom/vitest'
        : '@testing-library/jest-dom'
      : configuredJestDomImportPath
  const renderFunctionName = renderHelper?.name ?? 'render'

  const matcherMap = new Map<string, string>()
  for (const queryResult of queryResults) {
    if (queryResult.matcher) {
      matcherMap.set(queryResult.query, queryResult.matcher)
    }
  }

  const scenarioPlans: JsScenarioPlan[] =
    scenarios && scenarios.length > 0
      ? scenarios
      : itGroups.map((group) => ({
          name: group.name,
          goal: 'flow' as const,
          steps: group.steps,
          helperRefs: [],
          requiresFreshRender: true,
          markerAssertions: [],
          unresolvedMarkerAssertions: [],
        }))

  const globalHasUserEvents =
    helpers.length > 0 ||
    scenarioPlans.some(
      (scenario) =>
        scenario.helperRefs.length > 0 ||
        scenario.steps.some((step) =>
          USER_EVENT_ACTIONS.includes(step.action as (typeof USER_EVENT_ACTIONS)[number])
        )
    )

  const helperByName = new Map(helpers.map((helper) => [helper.name, helper]))
  const helperBlocks = helpers
    .map((helper) => ({
      name: helper.name,
      stepLines: buildHelperStepLines(helper, {
        matcherMap,
        scopeDialog: renderTarget?.usesWithin ?? false,
      }),
    }))
    .filter((helper) => helper.stepLines.some((line) => line.trim().length > 0))

  const itBlocks = scenarioPlans.map((scenario) => {
    const hasUserEvents = scenario.steps.some((step) =>
      USER_EVENT_ACTIONS.includes(step.action as (typeof USER_EVENT_ACTIONS)[number])
    )
    const helperRefs = getScenarioHelperRefs(scenario, helpers)
    const helperSteps = helperRefs.flatMap((helperName) => helperByName.get(helperName)?.steps ?? [])
    const helperStepSet = new Set(helperSteps)
    const helperNameByStepId = new Map(
      helperRefs.flatMap((helperName) =>
        (helperByName.get(helperName)?.steps ?? [])
          .filter((step): step is NormalizedStep & { id: string } => Boolean(step.id))
          .map((step) => [step.id, helperName] as const)
      )
    )
    const markerAssertions = dedupeMarkerAssertions([...(scenario.markerAssertions ?? [])])
    const markerAssertionsAfterStep = new Map<string, PlannedMarkerAssertion[]>()
    const markerAssertionsAfterHelper = new Map<string, PlannedMarkerAssertion[]>()

    for (const markerAssertion of markerAssertions) {
      const helperPlacementName =
        markerAssertion.placement.kind === 'after-helper'
          ? markerAssertion.placement.helperName
          : helperNameByStepId.get(markerAssertion.placement.stepId)

      if (helperPlacementName) {
        const existing = markerAssertionsAfterHelper.get(helperPlacementName) ?? []
        existing.push(markerAssertion)
        markerAssertionsAfterHelper.set(helperPlacementName, existing)
        continue
      }

      const existing = markerAssertionsAfterStep.get(markerAssertion.placement.stepId) ?? []
      existing.push(markerAssertion)
      markerAssertionsAfterStep.set(markerAssertion.placement.stepId, existing)
    }

    let scenarioNeedsWaitFor = false

    const bodyLines = scenario.steps.flatMap((step) => {
      if (step.action !== 'assert' && helperStepSet.has(step)) {
        return []
      }

      if (step.action === 'navigate') {
        return [stepTemplate({ action: 'navigate', query: '', value: step.target })]
      }

      const query = reconstructQuery(step, { scopeDialog: renderTarget?.usesWithin ?? false })
      if (!query) {
        const checkpoint = getSelectorCheckpoint(step)
        if (checkpoint) {
          return [
            stepTemplate({
              action: step.action,
              query: '',
              value: step.value,
              checkpoint,
            }),
          ]
        }
      }

      const matcher = query ? inferAssertionMatcher(step, query, matcherMap.get(query)) : undefined
      const lines = [
        stepTemplate({
          action: step.action,
          query: query ?? 'document.body',
          value: step.value,
          matcher,
        }),
      ]

      if (step.id) {
        const stepMarkers = markerAssertionsAfterStep.get(step.id) ?? []
        const { lines: assertionLines, usedWaitFor } = renderMarkerAssertionGroup(stepMarkers)
        lines.push(...assertionLines)
        if (usedWaitFor) {
          scenarioNeedsWaitFor = true
        }
      }

      return lines
    })

    const annotationLines = (scenario.annotations ?? []).map((annotation) => `// ${annotation}`)
    const stepLines = [
      ...annotationLines,
      ...helperRefs.flatMap((helperName) => {
        const helperMarkers = markerAssertionsAfterHelper.get(helperName) ?? []
        const { lines: assertionLines, usedWaitFor } = renderMarkerAssertionGroup(helperMarkers)
        if (usedWaitFor) {
          scenarioNeedsWaitFor = true
        }
        return [`await ${helperName}(user)`, ...assertionLines]
      }),
      ...bodyLines,
    ]

    return {
      name: scenario.name,
      stepLines,
      hasUserEvents: hasUserEvents || helperRefs.length > 0,
      needsWaitFor: scenarioNeedsWaitFor,
    }
  })

  const globalNeedsWaitFor = itBlocks.some((block) => block.needsWaitFor)

  const imports = importBlock(globalHasUserEvents, importStyle, {
    renderTarget: renderTarget
      ? {
          symbol: renderTarget.symbol,
          importPath: renderTarget.importPath,
          importKind: renderTarget.importKind,
        }
      : null,
    renderHelper: renderHelper
      ? {
          name: renderHelper.name,
          importPath: renderHelper.importPath,
          importKind: renderHelper.importKind,
        }
      : null,
    jestDomImportPath,
    needsWithin: renderTarget?.usesWithin ?? false,
    needsWaitFor: globalNeedsWaitFor,
  })
  const describeCode = describeBlockMultiIt(title, itBlocks, {
    renderExpression: renderTarget ? `<${renderTarget.symbol} />` : '<App />',
    renderFunctionName,
    helpers: helperBlocks,
  })
  const code = `${imports}\n\n${describeCode}\n`

  return {
    code,
    testName: title,
    filePath: outputPath,
    queryResults,
    itGroupCount: itGroups.length,
  }
}
