import type { MockAnalysis } from "#core/mock-intelligence.ts";
import { resolveSemanticMarkerAssertion } from "#core/resolver.ts";
import type {
  AnalyzedRecording,
  ItGroup,
  JsDetectedInteractionContract,
  JsHelperPlan,
  JsInteractionCompanionState,
  JsScenarioPlan,
  JsStateSafetyAssessment,
  NormalizedRecording,
  NormalizedStep,
  PlannedMarkerAssertion,
  PlannedMarkerAssertionDiagnostics,
  SemanticMarkerCandidate,
  StepId,
  UnresolvedSemanticMarker,
  UnresolvedSemanticMarkerAssertionResolution,
} from "#types/recording.ts";

type RenderBoundaryKind = "module" | "component" | "unknown";
type BoundaryConfidence = "high" | "medium" | "low";

export interface RenderBoundaryAssessment {
  kind: RenderBoundaryKind;
  confidence: BoundaryConfidence;
  resolvedTarget: string | null;
  reason: string;
  signals: string[];
}

export interface JsSuitePlan {
  itGroups: ItGroup[];
  scenarios: JsScenarioPlan[];
  helpers: JsHelperPlan[];
  contracts: JsDetectedInteractionContract[];
  stateSafety: JsStateSafetyAssessment;
  renderBoundary: RenderBoundaryAssessment;
  warnings: string[];
}

function getStepKey(
  step: NormalizedRecording["steps"][number],
  index: number
): string {
  return (
    step.id ??
    `${index}:${step.action}:${step.target ?? ""}:${step.originalType}`
  );
}

function sharesAnyStep(
  left: NormalizedRecording["steps"],
  right: NormalizedRecording["steps"]
): boolean {
  const leftKeys = new Set(left.map((step, index) => getStepKey(step, index)));
  return right.some((step, index) => leftKeys.has(getStepKey(step, index)));
}

function enrichSemanticMarkerContext(
  step: NormalizedRecording["steps"][number],
  stepsById: Map<string, NormalizedRecording["steps"][number]>
): NormalizedRecording["steps"][number] {
  const anchorStepId =
    step.semanticMarkerLink?.anchorStepId ??
    step.unresolvedSemanticMarker?.anchor?.anchorStepId ??
    step.semanticMarkerCandidate?.anchor?.anchorStepId;

  if (!anchorStepId) {
    return step;
  }

  const anchorStep = stepsById.get(anchorStepId);
  if (!anchorStep) {
    return step;
  }

  return {
    ...step,
    metadata: {
      ...step.metadata,
      semanticMarkerAnchorStep: {
        id: anchorStep.id,
        action: anchorStep.action,
        target: anchorStep.target,
        originalType: anchorStep.originalType,
        source: anchorStep.source,
      },
    },
  };
}

function enrichGroupSteps(
  groups: ItGroup[],
  stepsById: Map<string, NormalizedRecording["steps"][number]>
): ItGroup[] {
  return groups.map((group) => ({
    ...group,
    steps: group.steps.map((step) =>
      enrichSemanticMarkerContext(step, stepsById)
    ),
  }));
}

function buildFallbackGroups(
  analyzedRecording: AnalyzedRecording,
  fallbackTitle: string
): ItGroup[] {
  if (analyzedRecording.intentGroups.length > 0) {
    return analyzedRecording.intentGroups;
  }

  return [
    { name: fallbackTitle || "recorded flow", steps: analyzedRecording.steps },
  ];
}

function getSemanticMarkerCandidate(
  step: NormalizedStep
): SemanticMarkerCandidate | undefined {
  const metadataCandidate = step.metadata?.semanticMarkerCandidate;

  if (
    metadataCandidate &&
    typeof metadataCandidate === "object" &&
    "stepId" in metadataCandidate &&
    typeof metadataCandidate.stepId === "string"
  ) {
    return metadataCandidate as SemanticMarkerCandidate;
  }

  return step.semanticMarkerCandidate;
}

function getSemanticMarkerLink(step: NormalizedStep) {
  const metadataLink = step.metadata?.semanticMarkerLink;

  if (
    metadataLink &&
    typeof metadataLink === "object" &&
    "markerStepId" in metadataLink &&
    typeof metadataLink.markerStepId === "string"
  ) {
    return metadataLink;
  }

  return step.semanticMarkerLink;
}

function getUnresolvedSemanticMarker(
  step: NormalizedStep
): UnresolvedSemanticMarker | undefined {
  const metadataMarker = step.metadata?.unresolvedSemanticMarker;

  if (
    metadataMarker &&
    typeof metadataMarker === "object" &&
    "stepId" in metadataMarker &&
    typeof metadataMarker.stepId === "string"
  ) {
    return metadataMarker as UnresolvedSemanticMarker;
  }

  return step.unresolvedSemanticMarker;
}

function isManagedSemanticMarkerStep(step: NormalizedStep): boolean {
  return Boolean(
    getSemanticMarkerCandidate(step) ||
    getSemanticMarkerLink(step) ||
    getUnresolvedSemanticMarker(step)
  );
}

function filterManagedSemanticMarkerSteps(
  steps: NormalizedStep[]
): NormalizedStep[] {
  return steps.filter((step) => !isManagedSemanticMarkerStep(step));
}

function getHelperPlacement(params: {
  anchorStepId: StepId;
  helperRefs: string[];
  helperStepsByName: Map<string, Set<string>>;
}): PlannedMarkerAssertion["placement"] | null {
  const { anchorStepId, helperRefs, helperStepsByName } = params;

  for (const helperRef of helperRefs) {
    if (helperStepsByName.get(helperRef)?.has(anchorStepId)) {
      return {
        kind: "after-helper",
        helperName: helperRef,
        stepId: anchorStepId,
      };
    }
  }

  return null;
}

function normalizeMarkerAssertionKey(
  markerAssertion: PlannedMarkerAssertion
): string {
  const placementKey =
    markerAssertion.placement.kind === "after-helper"
      ? `after-helper:${markerAssertion.placement.helperName}:${markerAssertion.placement.stepId}`
      : `after-step:${markerAssertion.placement.stepId}`;

  return [
    placementKey,
    markerAssertion.assertion.queryExpression.replace(/\s+/g, " ").trim(),
    markerAssertion.assertion.matcher,
  ].join("|");
}

function dedupeMarkerAssertions(
  markerAssertions: Array<{
    markerAssertion: PlannedMarkerAssertion;
    sourceOrder: number;
  }>
): PlannedMarkerAssertion[] {
  const seen = new Set<string>();

  return markerAssertions
    .sort((left, right) => left.sourceOrder - right.sourceOrder)
    .flatMap(({ markerAssertion }) => {
      const key = normalizeMarkerAssertionKey(markerAssertion);
      if (seen.has(key)) {
        return [];
      }

      seen.add(key);
      return [markerAssertion];
    });
}

function toBoundaryPlacementConflict(params: {
  conflictingScenarioNames: string[];
  resolution:
    | ReturnType<typeof resolveSemanticMarkerAssertion>
    | UnresolvedSemanticMarkerAssertionResolution;
  step: NormalizedStep;
}): UnresolvedSemanticMarkerAssertionResolution {
  const { conflictingScenarioNames, resolution, step } = params;
  if (resolution.status === "unresolved") {
    return {
      ...resolution,
      reason: "boundary-placement-conflict",
      conflictingScenarioNames,
    };
  }

  return {
    status: "unresolved",
    markerStepId: resolution.markerStepId,
    anchorStepId: resolution.anchorStepId,
    relation: resolution.assertion.relation,
    reason: "boundary-placement-conflict",
    proofSubject: resolution.assertion.proofSubject,
    target: resolution.assertion.target ?? step.target,
    proofText: resolution.assertion.proofText,
    line: resolution.assertion.line ?? step.line,
    sourceContext: resolution.assertion.sourceContext,
    query: resolution.assertion.query,
    conflictingScenarioNames,
  };
}

function collectPlannedMarkerDiagnostics(params: {
  fromScenarioName: string;
  step: NormalizedStep;
  toScenarioName: string;
}): PlannedMarkerAssertionDiagnostics | undefined {
  const { fromScenarioName, step, toScenarioName } = params;
  const candidate = getSemanticMarkerCandidate(step);
  const diagnostics: PlannedMarkerAssertionDiagnostics = {};

  if (candidate?.canonicalRecovery) {
    diagnostics.canonicalRecovery = candidate.canonicalRecovery;
  }

  if (fromScenarioName !== toScenarioName) {
    diagnostics.placementCorrection = { fromScenarioName, toScenarioName };
  }

  return Object.keys(diagnostics).length > 0 ? diagnostics : undefined;
}

function sanitizeIdentifierPart(value: string): string {
  return value
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .map((part, index) => {
      const normalized = part.toLowerCase();
      return index === 0
        ? normalized
        : normalized.charAt(0).toUpperCase() + normalized.slice(1);
    })
    .join("");
}

function toHelperName(groupName: string, index: number): string {
  const normalized = sanitizeIdentifierPart(groupName);
  return normalized
    ? `plan${normalized.charAt(0).toUpperCase()}${normalized.slice(1)}`
    : `planScenario${index + 1}`;
}

function inferScenarioGoal(groupName: string): JsScenarioPlan["goal"] {
  if (/validation|error|required|missing/i.test(groupName)) {
    return "validation";
  }

  if (/review|summary|confirm/i.test(groupName)) {
    return "review";
  }

  if (/save|submit|pending|success|failure|mutation/i.test(groupName)) {
    return "mutation-state";
  }

  return "flow";
}

function isSubmitLikeStep(step: NormalizedStep): boolean {
  if (step.action !== "click") {
    return false;
  }

  return /(save|submit|create|update|add|delete|confirm|finish)/i.test(
    step.target ?? ""
  );
}

function findSubmitStepIndex(steps: NormalizedStep[]): number {
  for (let index = steps.length - 1; index >= 0; index -= 1) {
    if (isSubmitLikeStep(steps[index]!)) {
      return index;
    }
  }

  return -1;
}

function detectInteractionContracts(params: {
  recording: NormalizedRecording;
  mockAnalysis: MockAnalysis | null;
}): JsDetectedInteractionContract[] {
  const { recording, mockAnalysis } = params;
  if (!mockAnalysis || mockAnalysis.companionPolicy === "off") {
    return [];
  }

  if (!mockAnalysis.enabledContractFamilies.includes("mutation-form")) {
    return [];
  }

  const hasFormInput = recording.steps.some(
    (step) => step.action === "fill" || step.action === "select"
  );
  if (!hasFormInput || findSubmitStepIndex(recording.steps) === -1) {
    return [];
  }

  const repoContracts = mockAnalysis.interactionContracts.filter(
    (contract) =>
      contract.kind === "mutation-form" && contract.states.length > 0
  );
  const companionStates = [
    ...new Set(
      repoContracts.length > 0
        ? repoContracts.flatMap((contract) => contract.states)
        : mockAnalysis.mutationLifecycles
            .flatMap((lifecycle) => [
              lifecycle.stages.includes("loading")
                ? ("in-flight" as const)
                : null,
              lifecycle.stages.includes("error")
                ? ("failed-completion" as const)
                : null,
            ])
            .filter(
              (state): state is JsInteractionCompanionState => state !== null
            )
    ),
  ];

  if (companionStates.length === 0) {
    return [];
  }

  if (repoContracts.length > 0) {
    const highConfidence = repoContracts.some(
      (contract) => contract.confidence === "high"
    );
    const mediumConfidence =
      highConfidence ||
      repoContracts.some((contract) => contract.confidence === "medium");

    return [
      {
        kind: "mutation-form",
        source: "repo-contract",
        confidence: highConfidence
          ? "high"
          : mediumConfidence
            ? "medium"
            : "low",
        companionStates,
        evidence: [
          `${repoContracts.length} learned mutation-form contract(s)`,
          ...repoContracts[0]!.evidence.slice(0, 2),
        ],
      },
    ];
  }

  const hasSharedBoundarySupport =
    mockAnalysis.repeatedTargets.length > 0 ||
    mockAnalysis.boundaryProfiles.some((profile) =>
      [
        "shared-module-factory",
        "provider-wrapper",
        "scaffolded-module-factory",
      ].includes(profile.strategy)
    );

  return [
    {
      kind: "mutation-form",
      source: "repo-signal",
      confidence: hasSharedBoundarySupport ? "medium" : "low",
      companionStates,
      evidence: [
        `${mockAnalysis.mutationLifecycles.length} mutation lifecycle signal(s)`,
        hasSharedBoundarySupport
          ? "shared boundary support signals detected"
          : "no stable shared boundary support detected",
      ],
    },
  ];
}

function hasMutationSignals(mockAnalysis: MockAnalysis | null): boolean {
  if (!mockAnalysis) {
    return false;
  }

  const boundaryProfiles = mockAnalysis.boundaryProfiles ?? [];

  return (
    mockAnalysis.interactionContracts.length > 0 ||
    mockAnalysis.mutationLifecycles.length > 0 ||
    mockAnalysis.repeatedTargets.length > 0 ||
    boundaryProfiles.some((profile) =>
      [
        "shared-module-factory",
        "provider-wrapper",
        "scaffolded-module-factory",
      ].includes(profile.strategy)
    )
  );
}

function findRepeatedMockTarget(
  mockAnalysis: MockAnalysis | null
): string | null {
  return (
    mockAnalysis?.boundaryProfiles?.find((profile) =>
      ["shared-module-factory", "scaffolded-module-factory"].includes(
        profile.strategy
      )
    )?.target ??
    mockAnalysis?.recommendations[0]?.target ??
    null
  );
}

function isWizardFlow(recording: NormalizedRecording): boolean {
  const actionableSteps = recording.steps.filter((step) =>
    ["click", "fill", "select"].includes(step.action)
  );
  const milestoneClicks = recording.steps.filter((step) => {
    if (step.action !== "click" || !step.target) {
      return false;
    }

    return (
      /^(continue|save|submit)$/i.test(step.target) ||
      /(review|dialog)/i.test(step.target)
    );
  });
  const hasFormInput = recording.steps.some(
    (step) => step.action === "fill" || step.action === "select"
  );
  const hasReviewLanguage = recording.steps.some((step) =>
    /(review|summary|confirm|details|step\s+\d+|next step)/i.test(
      step.target ?? ""
    )
  );

  return (
    actionableSteps.length >= 6 &&
    hasFormInput &&
    (milestoneClicks.length >= 2 || hasReviewLanguage)
  );
}

function assessStateSafety(params: {
  recording: NormalizedRecording;
  analyzedRecording: AnalyzedRecording;
  mockAnalysis: MockAnalysis | null;
}): JsStateSafetyAssessment {
  const { recording, analyzedRecording, mockAnalysis } = params;
  const wizardFlow = isWizardFlow(recording);

  if (wizardFlow && hasMutationSignals(mockAnalysis)) {
    return {
      status: "setup-replay-required",
      reason:
        "This flow spans multiple wizard steps and repo evidence shows mutation-driven state, so each scenario should replay the prerequisite setup instead of bundling multiple contracts into one test.",
    };
  }

  if (wizardFlow) {
    return {
      status: "setup-replay-required",
      reason:
        "This flow looks stateful, so later scenarios should rebuild prerequisite UI state with helpers instead of relying on one broad end-to-end test.",
    };
  }

  if (analyzedRecording.intentGroups.length > 1) {
    return {
      status: "safe-multi-it",
      reason:
        "Intent groups are already separated into user-visible milestones and no mutation-heavy wizard state was detected.",
    };
  }

  return {
    status: "safe-multi-it",
    reason:
      "No mutation-heavy wizard state was detected, so scenario splitting is safe when it improves readability.",
  };
}

function assessRenderBoundary(params: {
  recording: NormalizedRecording;
  mockAnalysis: MockAnalysis | null;
}): RenderBoundaryAssessment {
  const { recording, mockAnalysis } = params;
  const signals: string[] = [];
  const wizardFlow = isWizardFlow(recording);
  const mutationSignals = hasMutationSignals(mockAnalysis);

  if (wizardFlow) {
    signals.push("multi-step wizard flow");
  }

  if (mockAnalysis?.mutationLifecycles.length) {
    signals.push("existing tests model mutation lifecycle states");
  }
  if (mockAnalysis?.interactionContracts.length) {
    signals.push("repo already learns stateful interaction contracts");
  }

  if (mockAnalysis?.repeatedTargets.length) {
    signals.push("repo already shares repeated mock targets");
  }
  if ((mockAnalysis?.boundaryProfiles?.length ?? 0) > 0) {
    signals.push("repo already documents boundary support patterns");
  }

  if (wizardFlow && mutationSignals) {
    return {
      kind: "module",
      confidence: "medium",
      resolvedTarget: null,
      reason:
        "This flow spans multiple user-visible steps and repo evidence shows data/mutation setup around it, so Taro should prefer a container/module boundary rather than a leaf component test.",
      signals,
    };
  }

  if (wizardFlow) {
    return {
      kind: "unknown",
      confidence: "low",
      resolvedTarget: null,
      reason:
        "This flow behaves like a stateful wizard, but Taro cannot resolve the owning render target from repo context yet.",
      signals,
    };
  }

  return {
    kind: "component",
    confidence: "low",
    resolvedTarget: null,
    reason:
      "No stateful flow or repo-level mutation signals were detected, so a focused component boundary is acceptable.",
    signals,
  };
}

export function planJsSuite(params: {
  recording: NormalizedRecording;
  analyzedRecording: AnalyzedRecording;
  mockAnalysis: MockAnalysis | null;
  fallbackTitle: string;
}): JsSuitePlan {
  const { recording, analyzedRecording, mockAnalysis, fallbackTitle } = params;
  const renderBoundary = assessRenderBoundary({ recording, mockAnalysis });
  const stateSafety = assessStateSafety({
    recording,
    analyzedRecording,
    mockAnalysis,
  });
  const contracts = detectInteractionContracts({ recording, mockAnalysis });
  const warnings: string[] = [];
  const stepsById = new Map(
    analyzedRecording.steps
      .filter((step): step is typeof step & { id: string } => Boolean(step.id))
      .map((step) => [step.id, step])
  );

  if (renderBoundary.kind === "module") {
    warnings.push(
      "Prefer a repo-local module/container render boundary for this flow instead of targeting a leaf form component directly."
    );
  }

  if (renderBoundary.kind !== "component" && !renderBoundary.resolvedTarget) {
    warnings.push(
      "Taro could not resolve the exact render target from repo context; generated output should be treated as a boundary draft."
    );
  }

  const repeatedTarget = findRepeatedMockTarget(mockAnalysis);
  if (repeatedTarget) {
    warnings.push(
      `Reuse learned boundary support for collaborators such as "${repeatedTarget}" instead of re-mocking internal query hooks inline.`
    );
  }

  const baseGroups = enrichGroupSteps(
    buildFallbackGroups(analyzedRecording, fallbackTitle),
    stepsById
  );

  const helperGroups = enrichGroupSteps(
    analyzedRecording.intentGroups,
    stepsById
  );
  const helpers = helperGroups.map((group, index) => ({
    name: toHelperName(group.name, index),
    sourceGroup: group.name,
    purpose: `Navigate the UI through "${group.name}" without hiding assertions.`,
    steps: filterManagedSemanticMarkerSteps(group.steps),
    assertionPolicy: "sync-only" as const,
  }));
  const helperStepsByName = new Map(
    helpers.map((helper) => [
      helper.name,
      new Set(
        helper.steps
          .filter((step): step is typeof step & { id: string } =>
            Boolean(step.id)
          )
          .map((step) => step.id)
      ),
    ])
  );

  const scenarios = baseGroups.map((group) => {
    const matchingHelperIndexes = helpers.flatMap((helper, index) =>
      sharesAnyStep(group.steps, helper.steps) ? [index] : []
    );
    const helperRefs =
      stateSafety.status === "setup-replay-required"
        ? matchingHelperIndexes.length > 0
          ? helpers
              .slice(0, matchingHelperIndexes.at(-1)! + 1)
              .map((helper) => helper.name)
          : []
        : helpers
            .filter((helper) => sharesAnyStep(group.steps, helper.steps))
            .map((helper) => helper.name);

    return {
      name: group.name,
      goal: inferScenarioGoal(group.name),
      steps: filterManagedSemanticMarkerSteps(group.steps),
      helperRefs,
      requiresFreshRender: true,
      provenance: "recorded" as const,
      markerAssertions: [] as PlannedMarkerAssertion[],
      unresolvedMarkerAssertions:
        [] as UnresolvedSemanticMarkerAssertionResolution[],
    };
  });

  const scenarioOwnersByStepId = new Map<StepId, number[]>();
  for (const [scenarioIndex, group] of baseGroups.entries()) {
    for (const step of group.steps) {
      if (!step.id) {
        continue;
      }

      const owners = scenarioOwnersByStepId.get(step.id) ?? [];
      owners.push(scenarioIndex);
      scenarioOwnersByStepId.set(step.id, owners);
    }
  }

  const markerAssertionsByScenario = scenarios.map(
    () =>
      [] as Array<{
        markerAssertion: PlannedMarkerAssertion;
        sourceOrder: number;
      }>
  );
  const unresolvedMarkersByScenario = scenarios.map(
    () =>
      [] as Array<{
        markerAssertion: UnresolvedSemanticMarkerAssertionResolution;
        sourceOrder: number;
      }>
  );
  let markerSourceOrder = 0;

  for (const [groupIndex, group] of baseGroups.entries()) {
    for (const step of group.steps) {
      if (!isManagedSemanticMarkerStep(step)) {
        continue;
      }

      const resolution = resolveSemanticMarkerAssertion(step);
      const sourceOrder = markerSourceOrder++;
      const anchorOwners = resolution.anchorStepId
        ? (scenarioOwnersByStepId.get(resolution.anchorStepId) ?? [])
        : [];

      if (resolution.status === "unresolved") {
        const targetScenarioIndex =
          anchorOwners.length === 1 ? anchorOwners[0]! : groupIndex;
        const markerAssertion =
          resolution.anchorStepId && anchorOwners.length !== 1
            ? toBoundaryPlacementConflict({
                conflictingScenarioNames: anchorOwners.map(
                  (index) => scenarios[index]!.name
                ),
                resolution,
                step,
              })
            : resolution;
        unresolvedMarkersByScenario[targetScenarioIndex]!.push({
          markerAssertion,
          sourceOrder,
        });
        continue;
      }

      if (anchorOwners.length !== 1) {
        unresolvedMarkersByScenario[groupIndex]!.push({
          markerAssertion: toBoundaryPlacementConflict({
            conflictingScenarioNames: anchorOwners.map(
              (index) => scenarios[index]!.name
            ),
            resolution,
            step,
          }),
          sourceOrder,
        });
        continue;
      }

      const targetScenarioIndex = anchorOwners[0]!;
      const targetScenario = scenarios[targetScenarioIndex]!;
      const placement = getHelperPlacement({
        anchorStepId: resolution.anchorStepId,
        helperRefs: targetScenario.helperRefs,
        helperStepsByName,
      }) ?? { kind: "after-step" as const, stepId: resolution.anchorStepId };
      const diagnostics = collectPlannedMarkerDiagnostics({
        fromScenarioName: scenarios[groupIndex]!.name,
        step,
        toScenarioName: targetScenario.name,
      });

      markerAssertionsByScenario[targetScenarioIndex]!.push({
        markerAssertion: {
          markerStepId: resolution.markerStepId,
          anchorStepId: resolution.anchorStepId,
          placement,
          assertion: resolution.assertion,
          ...(diagnostics ? { diagnostics } : {}),
        },
        sourceOrder,
      });
    }
  }

  for (const [scenarioIndex, scenario] of scenarios.entries()) {
    scenario.markerAssertions = dedupeMarkerAssertions(
      markerAssertionsByScenario[scenarioIndex] ?? []
    );
    scenario.unresolvedMarkerAssertions = (
      unresolvedMarkersByScenario[scenarioIndex] ?? []
    )
      .sort((left, right) => left.sourceOrder - right.sourceOrder)
      .map((entry) => entry.markerAssertion);
  }

  if (stateSafety.status === "setup-replay-required" && baseGroups.length > 1) {
    warnings.push(
      "Replay prerequisite setup inside each scenario helper instead of collapsing multiple contracts into one broad end-to-end test."
    );
  }

  const mutationContract = contracts.find(
    (contract) => contract.kind === "mutation-form"
  );
  if (mutationContract?.companionStates.length) {
    warnings.push(
      "Repo mutation lifecycle evidence was detected. Decide manually whether loading or failure companion tests belong in this suite instead of synthesizing them automatically."
    );
  }

  return {
    itGroups: baseGroups,
    scenarios,
    helpers,
    contracts,
    stateSafety,
    renderBoundary,
    warnings,
  };
}
