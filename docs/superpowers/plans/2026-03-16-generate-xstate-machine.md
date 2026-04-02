# Generate XState Machine Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert the `generate.ts` CLI pipeline to an XState v5 flat sequential state machine with 18 states, eliminating 6 mutable `let` variables and replacing implicit conditionals with named guards.

**Architecture:** The `action` handler is replaced by a `generateMachine` driven by `createActor`. The 4000-line file splits into `generate.utils.ts` (pure helpers + types), `generate.actors.ts` (15 async actors), `generate.machine.ts` (machine definition), and a trimmed `generate.ts` (CLI wiring only). Existing pure-helper tests are unaffected; new machine and actor tests use injected mocks.

**Tech Stack:** XState v5 (`xstate@^5`), Vitest, TypeScript, Node.js ≥18

**Spec:** `docs/superpowers/specs/2026-03-16-generate-xstate-machine-design.md`

---

## Chunk 1: Setup + generate.utils.ts

### Task 1: Install XState v5

**Files:**

- Modify: `package.json`

- [ ] **Step 1: Install xstate**

```bash
npm install xstate@^5
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add xstate v5 dependency"
```

---

### Task 2: Create generate.utils.ts

Move all pure helpers, types, and guards from `generate.ts` into a new file. Do **not** change any function logic — this is a pure move.

**Files:**

- Create: `src/cli/commands/generate.utils.ts`
- Modify: `src/cli/commands/generate.ts` (add re-export of `generateCommandInternals` from utils)

- [ ] **Step 1: Create `generate.utils.ts` with all exported types and pure functions**

Copy everything from `generate.ts` that is NOT the `createGenerateCommand` function and NOT the `createSelectorDebugReporter` / `flushFindings` / `log` helpers (those stay in `generate.ts` for now). This includes:

- All `interface` and `type` declarations at the top of the file
- All `const` pure helpers (`normalizeContextTerm`, `scoreContextTerm`, `collectComparableTokens`, `buildFlowCoverageSummary`, `compareOutputAssessments`, `deriveContextRenderTargets`, `toImportPath`, `looksLikeSelectorLikeString`, `isSemanticMarkerStep`, `normalizeComparablePath`, `scoreRenderTargetCandidate`, `collectStepCoverageTokens`, `dedupeQueryResults`, `rehydrateSuitePlan`, `stripSemanticMarker*`, `summarize*`, `emit*`, `log*`, etc.)
- The `generateCommandInternals` export

Add the `GenerateMachineContext` interface and actor input types at the bottom:

```typescript
// generate.utils.ts — append after all existing helpers

export interface GenerateMachineContext {
  filePath: string;
  projectRoot: string;
  commandOptions: {
    auth?: string;
    debugSelectors?: boolean;
    debugSelectorsJson?: string;
    interactiveAuth?: boolean;
    instructions?: string;
    screenshots?: boolean;
  };
  debugReporter: SelectorDebugReporter;
  findings: Finding[];
  normalizedRecording?: NormalizedRecording;
  defaultOutputPath?: string;
  hadState?: boolean;
  bootstrappedState?: Awaited<ReturnType<typeof runLoadOrBootstrapStateWorkflow>>;
  overrides?: Awaited<ReturnType<typeof readTaroOverrides>>;
  packageProfile?: ResolvedTaroPackageProfile | null;
  explicitAuthPath?: { absolutePath: string; relativePath: string } | null;
  explicitInstructionsPath?: {
    absolutePath: string;
    relativePath: string;
  } | null;
  visualAuth?: TaroPlaywrightAuthProfile | null;
  earlyAnalyzedRecording?: AnalyzedRecording;
  recordingUrl?: string;
  visualState?: VisualState | null;
  contextMatches?: RepoContextMatch[];
  contextProfileReason?: string | null;
  staleness?: { stale: boolean; reason?: string } | null;
  analyzedRecording?: AnalyzedRecording;
  markerAwareRecording?: NormalizedRecording;
  recoveredVisualAuth?: TaroPlaywrightAuthProfile | null;
  mockAnalysis?: MockAnalysis | null;
  jsSuitePlan?: JsSuitePlan | null;
  outputPath?: string;
  resolvedRenderTargetFile?: string | null;
  boundarySupportPlan?: Awaited<ReturnType<typeof planBoundarySupport>>;
  generationRenderTarget?: RepoRenderTargetCandidate | null;
  generationRenderHelper?: ResolvedTaroPackageProfile["effectiveRenderHelper"];
  resolvedJsGeneration?: Awaited<ReturnType<typeof resolveJsGeneration>>;
  generatedCode?: string;
  hydratedSuitePlan?: JsSuitePlan | null;
  scoreResult?: ScoreResult;
  boundaryPolicyWarnings?: string[];
  candidateAssessment?: OutputAssessment;
  existingCode?: string | null;
  existingAssessment?: OutputAssessment | null;
  shouldOverwrite?: boolean;
  error?: Error;
}

// Actor input types
export type ValidateFileActorInput = Pick<GenerateMachineContext, "filePath">;
export type ParseRecordingActorInput = Pick<GenerateMachineContext, "filePath">;
export type LoadStateActorInput = Pick<
  GenerateMachineContext,
  "filePath" | "projectRoot" | "commandOptions"
>;
export type CaptureVisualActorInput = Pick<
  GenerateMachineContext,
  "normalizedRecording" | "visualAuth" | "projectRoot" | "commandOptions"
>;
export type SearchContextActorInput = Pick<
  GenerateMachineContext,
  | "normalizedRecording"
  | "visualState"
  | "projectRoot"
  | "defaultOutputPath"
  | "filePath"
>;
export type RefineProfileActorInput = Pick<
  GenerateMachineContext,
  | "bootstrappedState"
  | "packageProfile"
  | "projectRoot"
  | "overrides"
  | "contextMatches"
>;
export type RefreshProfileActorInput = Pick<
  GenerateMachineContext,
  "projectRoot" | "contextMatches" | "overrides"
>;
export type AnalyzeRecordingActorInput = Pick<
  GenerateMachineContext,
  | "normalizedRecording"
  | "packageProfile"
  | "projectRoot"
  | "visualState"
  | "visualAuth"
>;
export type AnalyzeMocksActorInput = Pick<
  GenerateMachineContext,
  "projectRoot" | "packageProfile"
>;
export type PlanGenerationActorInput = Pick<
  GenerateMachineContext,
  | "markerAwareRecording"
  | "analyzedRecording"
  | "mockAnalysis"
  | "normalizedRecording"
  | "packageProfile"
  | "projectRoot"
  | "defaultOutputPath"
  | "contextMatches"
  | "visualState"
>;
export type ResolveSelectorsActorInput = Pick<
  GenerateMachineContext,
  | "markerAwareRecording"
  | "jsSuitePlan"
  | "analyzedRecording"
  | "normalizedRecording"
  | "visualAuth"
  | "projectRoot"
  | "debugReporter"
>;
export type GenerateCodeActorInput = Pick<
  GenerateMachineContext,
  | "normalizedRecording"
  | "resolvedJsGeneration"
  | "jsSuitePlan"
  | "outputPath"
  | "packageProfile"
  | "boundarySupportPlan"
  | "generationRenderTarget"
  | "generationRenderHelper"
  | "analyzedRecording"
>;
export type AssessOutputActorInput = Pick<
  GenerateMachineContext,
  "outputPath" | "generatedCode" | "analyzedRecording"
>;
export type WriteOutputActorInput = Pick<
  GenerateMachineContext,
  "generatedCode" | "outputPath" | "shouldOverwrite" | "boundarySupportPlan"
>;
export type FinalizeActorInput = Pick<
  GenerateMachineContext,
  | "generatedCode"
  | "outputPath"
  | "projectRoot"
  | "filePath"
  | "scoreResult"
  | "packageProfile"
>;

// Guards
export const generateMachineGuards = {
  isProfileStale: ({ context }: { context: GenerateMachineContext }) =>
    Boolean(context.staleness?.stale),
  shouldWrite: ({ context }: { context: GenerateMachineContext }) =>
    !context.existingCode ||
    compareOutputAssessments(
      context.candidateAssessment!,
      context.existingAssessment!
    ) > 0,
  shouldKeepExisting: ({ context }: { context: GenerateMachineContext }) =>
    Boolean(context.existingCode) &&
    compareOutputAssessments(
      context.candidateAssessment!,
      context.existingAssessment!
    ) <= 0,
};
```

- [ ] **Step 2: Update `generate.ts` to import `generateCommandInternals` from utils**

At the bottom of `generate.ts`, change:

```typescript
// Before
export const generateCommandInternals = { ... }

// After — in generate.ts, remove the object and instead re-export from utils:
export { generateCommandInternals } from '#cli/commands/generate.utils.ts'
```

- [ ] **Step 3: Verify build**

```bash
npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 4: Run existing tests to verify nothing broke**

```bash
npx vitest run src/cli/commands/tests/generate.internals.test.ts
```

Expected: all tests pass (import path for `generateCommandInternals` now resolves through `generate.ts` re-export)

- [ ] **Step 5: Commit**

```bash
git add src/cli/commands/generate.utils.ts src/cli/commands/generate.ts
git commit -m "refactor: extract pure helpers and types to generate.utils.ts"
```

---

## Chunk 2: Actors

### Task 3: Create generate.actors.ts

**Files:**

- Create: `src/cli/commands/generate.actors.ts`

- [ ] **Step 1: Create `generate.actors.ts` with all 15 actors**

```typescript
// src/cli/commands/generate.actors.ts
import { fromPromise } from "xstate";
import { access, readFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import pc from "picocolors";

import { normalizeJsBaseline } from "#core/baseline-normalizer.ts";
import { discoverBoundaryImportsFromSource } from "#core/boundary-learning.ts";
import {
  applyBoundarySupport,
  materializeBoundarySupport,
  planBoundarySupport,
} from "#core/boundary-support.ts";
import { emitQuerySummary, generateTestFromGroups } from "#core/generator.ts";
import { loadInput } from "#core/input-loader.ts";
import { analyzeMocks } from "#core/mock-intelligence.ts";
import {
  analyzeRecording,
  findVisualCaptureCandidates,
} from "#core/recording-intelligence.ts";
import {
  appendGeneratedTestRecord,
  detectPackageProfileStaleness,
  runLoadOrBootstrapStateWorkflow,
  persistPlaywrightAuthProfile,
  readTaroOverrides,
  refreshTaroState,
  resolveTaroPackageProfile,
} from "#core/state.ts";
import { planJsSuite } from "#core/suite-planner.ts";
import { verifySyntax } from "#core/verifier.ts";
import { writeTestFile } from "#core/writer.ts";
import { enrichCanonicalSemanticMarkers } from "#core/semantic-marker-enrichment.ts";
import { scoreGeneratedTest } from "#core/scorer.ts";
import { analyzeBoundaryIsolation } from "#core/boundary-intelligence.ts";

import type {
  AnalyzeMocksActorInput,
  AnalyzeRecordingActorInput,
  AssessOutputActorInput,
  CaptureVisualActorInput,
  FinalizeActorInput,
  GenerateCodeActorInput,
  GenerateMachineContext,
  LoadStateActorInput,
  ParseRecordingActorInput,
  PlanGenerationActorInput,
  RefineProfileActorInput,
  RefreshProfileActorInput,
  ResolveSelectorsActorInput,
  SearchContextActorInput,
  ValidateFileActorInput,
  WriteOutputActorInput,
} from "#cli/commands/generate.utils.ts";

import {
  assessOutputAgainstRecording,
  auditBoundaryPolicy,
  buildFlowCoverageSummary,
  buildMarkerCoverageSummary,
  buildMarkerReviewDiagnostics,
  collectRepoContextSearchTerms,
  deriveContextRenderTargets,
  deriveOutputPath,
  findRecordingUrl,
  findRepoContextMatches,
  getPrimarySelector,
  hasInteractiveVisualAuthCapability,
  maybeCaptureVisualState,
  mergeAnalyzedStepState,
  normalizeComparablePath,
  persistRecoveredVisualAuth,
  planGenerationHelpers,
  rebaseRenderHelperImportPath,
  resolvePackageProfileFromContextMatches,
  resolveRenderTargetFile,
  resolveRepoRenderTarget,
  resolveVisualAuthStorageStatePath,
  resolveJsGeneration,
  stripSemanticMarkerStepsFromHelpers,
  stripSemanticMarkerStepsFromItGroups,
  stripSemanticMarkerStepsFromScenarios,
  toImportPath,
  toItGroups,
  applyRepoRenderTarget,
  rehydrateSuitePlan,
  mapParsedQueriesToResults,
  DEFAULT_VISUAL_AUTH_STORAGE_STATE_PATH,
  MANUAL_VISUAL_AUTH_TIMEOUT_MS,
  resolveOptionalFilePath,
} from "#cli/commands/generate.utils.ts";

import { parseJsRecording } from "#core/js-parser.ts";

export const validateFileActor = fromPromise(
  async ({ input }: { input: ValidateFileActorInput }) => {
    await access(input.filePath);
  }
);

export const parseRecordingActor = fromPromise(
  async ({ input }: { input: ParseRecordingActorInput }) => {
    const parsedInput = await loadInput(input.filePath);
    const normalizedRecording = normalizeJsBaseline(parsedInput);
    const defaultOutputPath = deriveOutputPath(input.filePath);
    return { normalizedRecording, defaultOutputPath };
  }
);

export const loadStateActor = fromPromise(
  async ({ input }: { input: LoadStateActorInput }) => {
    const { projectRoot, commandOptions } = input;
    const hadState = await access(join(projectRoot, ".taro", "state.json"))
      .then(() => true)
      .catch(() => false);
    const bootstrappedState = await runLoadOrBootstrapStateWorkflow(projectRoot);
    const overrides = await readTaroOverrides(projectRoot);
    const defaultOutputPath = deriveOutputPath(input.filePath);
    const packageProfile = resolveTaroPackageProfile(
      bootstrappedState.state,
      projectRoot,
      defaultOutputPath,
      overrides
    );
    const explicitAuthPath = await resolveOptionalFilePath(
      projectRoot,
      commandOptions.auth
    );
    const explicitInstructionsPath = await resolveOptionalFilePath(
      projectRoot,
      commandOptions.instructions
    );
    if (explicitAuthPath && explicitInstructionsPath) {
      console.warn(
        pc.yellow(
          "[taro] Visual auth: both --auth and --instructions were provided; preferring --auth for this run."
        )
      );
    }
    const visualAuth = explicitAuthPath
      ? {
          strategy: "storageState" as const,
          path: explicitAuthPath.relativePath,
          detectedAt: "generate" as const,
          source: "manual" as const,
        }
      : explicitInstructionsPath
        ? {
            strategy: "instructions" as const,
            path: explicitInstructionsPath.relativePath,
            detectedAt: "generate" as const,
            source: "manual" as const,
          }
        : (packageProfile?.playwrightAuth ?? null);
    return {
      hadState,
      bootstrappedState,
      overrides,
      packageProfile,
      explicitAuthPath,
      explicitInstructionsPath,
      visualAuth,
    };
  }
);

export const captureVisualActor = fromPromise(
  async ({ input }: { input: CaptureVisualActorInput }) => {
    const { normalizedRecording, visualAuth, projectRoot, commandOptions } =
      input;
    const earlyAnalyzedRecording = analyzeRecording(normalizedRecording!);
    const recordingUrl = findRecordingUrl(earlyAnalyzedRecording);
    const recoveryStorageStatePath = resolveVisualAuthStorageStatePath(
      projectRoot,
      visualAuth ?? null
    );
    const authInstructionsPath =
      visualAuth?.strategy === "instructions" ? visualAuth.path : undefined;
    const interactiveVisualAuth = hasInteractiveVisualAuthCapability(
      {},
      commandOptions.interactiveAuth === true
    );
    const visualState = await maybeCaptureVisualState({
      analyzedRecording: earlyAnalyzedRecording,
      auth: visualAuth ?? null,
      authRecovery:
        commandOptions.screenshots !== false
          ? {
              enabled: interactiveVisualAuth,
              instructionsPath: authInstructionsPath,
              persistedAuthPath: recoveryStorageStatePath.relativePath,
              saveStorageStatePath: recoveryStorageStatePath.absolutePath,
              timeoutMs: MANUAL_VISUAL_AUTH_TIMEOUT_MS,
            }
          : undefined,
      projectRoot,
      recording: normalizedRecording!,
      selector: getPrimarySelector(normalizedRecording!),
      skipScreenshotArtifacts: !commandOptions.screenshots !== false,
      url: recordingUrl,
    });
    return { earlyAnalyzedRecording, recordingUrl, visualState };
  }
);

export const searchContextActor = fromPromise(
  async ({ input }: { input: SearchContextActorInput }) => {
    const {
      normalizedRecording,
      visualState,
      projectRoot,
      defaultOutputPath,
      filePath,
    } = input;
    const contextSearchTerms = collectRepoContextSearchTerms(
      normalizedRecording!,
      visualState ?? null
    );
    const contextMatches = await findRepoContextMatches({
      projectRoot,
      terms: contextSearchTerms,
      excludePaths: [filePath!, defaultOutputPath!],
    });
    const enrichedRecording = await enrichCanonicalSemanticMarkers({
      contextMatches,
      projectRoot,
      recording: normalizedRecording!,
    });
    return { normalizedRecording: enrichedRecording, contextMatches };
  }
);

export const refineProfileActor = fromPromise(
  async ({ input }: { input: RefineProfileActorInput }) => {
    const {
      bootstrappedState,
      packageProfile,
      projectRoot,
      overrides,
      contextMatches,
    } = input;
    const contextProfile = resolvePackageProfileFromContextMatches({
      state: bootstrappedState!.state,
      currentProfile: packageProfile ?? null,
      projectRoot,
      overrides: overrides!,
      matches: contextMatches ?? [],
    });
    const staleness = contextProfile.profile
      ? await detectPackageProfileStaleness(projectRoot, contextProfile.profile)
      : null;
    return {
      packageProfile: contextProfile.profile,
      contextProfileReason: contextProfile.reason,
      staleness,
    };
  }
);

export const refreshProfileActor = fromPromise(
  async ({ input }: { input: RefreshProfileActorInput }) => {
    const { projectRoot, contextMatches, overrides } = input;
    const bootstrappedState = await refreshTaroState(projectRoot);
    const freshOverrides = await readTaroOverrides(projectRoot);
    const defaultOutputPath = ".";
    const baseProfile = resolveTaroPackageProfile(
      bootstrappedState.state,
      projectRoot,
      defaultOutputPath,
      freshOverrides
    );
    const contextProfile = resolvePackageProfileFromContextMatches({
      state: bootstrappedState.state,
      currentProfile: baseProfile,
      projectRoot,
      overrides: freshOverrides,
      matches: contextMatches ?? [],
    });
    const staleness = contextProfile.profile
      ? await detectPackageProfileStaleness(projectRoot, contextProfile.profile)
      : null;
    return {
      bootstrappedState,
      overrides: freshOverrides,
      packageProfile: contextProfile.profile,
      contextProfileReason: contextProfile.reason,
      staleness,
    };
  }
);

export const analyzeRecordingActor = fromPromise(
  async ({ input }: { input: AnalyzeRecordingActorInput }) => {
    const {
      normalizedRecording,
      packageProfile,
      projectRoot,
      visualState,
      visualAuth,
    } = input;
    const analyzedRecording = analyzeRecording(normalizedRecording!);
    const markerAwareRecording = mergeAnalyzedStepState(
      normalizedRecording!,
      analyzedRecording
    );
    const recoveredVisualAuth = await persistRecoveredVisualAuth({
      packageProfile: packageProfile ?? null,
      projectRoot,
      visualState: visualState ?? null,
    });
    const updatedVisualAuth = recoveredVisualAuth ?? visualAuth ?? null;
    if (packageProfile && (input as any).explicitAuthPath) {
      await persistPlaywrightAuthProfile(
        projectRoot,
        packageProfile.packagePath,
        updatedVisualAuth!
      );
    }
    return {
      analyzedRecording,
      markerAwareRecording,
      recoveredVisualAuth,
      visualAuth: updatedVisualAuth,
    };
  }
);

export const analyzeMocksActor = fromPromise(
  async ({ input }: { input: AnalyzeMocksActorInput }) => {
    const mockAnalysis = await (async () => {
      try {
        return await analyzeMocks(input.projectRoot, {
          packageProfile: input.packageProfile ?? null,
        });
      } catch {
        return null;
      }
    })();
    return { mockAnalysis };
  }
);

export const planGenerationActor = fromPromise(
  async ({ input }: { input: PlanGenerationActorInput }) => {
    const {
      markerAwareRecording,
      analyzedRecording,
      mockAnalysis,
      normalizedRecording,
      packageProfile,
      projectRoot,
      defaultOutputPath,
      contextMatches,
      visualState,
    } = input;
    const conventions = packageProfile?.conventions ?? {
      scannedAt: new Date().toISOString(),
      projectRoot,
      importStyle: "esm" as const,
      mockPattern: "none" as const,
      testFiles: [],
      folderPattern: "unknown" as const,
      fileExtension: "ts" as const,
    };
    const contextRenderTargets = deriveContextRenderTargets({
      projectRoot,
      outputPath: defaultOutputPath!,
      matches: contextMatches ?? [],
    });
    const repoRenderTargets = [
      ...contextRenderTargets,
      ...(packageProfile?.renderTargets ?? []),
    ];
    const rawJsSuitePlan = planJsSuite({
      recording: markerAwareRecording!,
      analyzedRecording: analyzedRecording!,
      mockAnalysis: mockAnalysis ?? null,
      fallbackTitle: normalizedRecording!.title,
    });
    const repoRenderTarget = resolveRepoRenderTarget({
      candidates: repoRenderTargets,
      packageProfile,
      recording: normalizedRecording!,
      mockAnalysis: mockAnalysis ?? null,
      suitePlan: rawJsSuitePlan,
      visualState: visualState ?? null,
    });
    const resolvedRenderTargetFile = await resolveRenderTargetFile({
      projectRoot,
      renderTarget: repoRenderTarget,
    });
    const outputPath = resolvedRenderTargetFile
      ? deriveOutputPath(resolvedRenderTargetFile)
      : defaultOutputPath!;
    const generationRenderTarget =
      repoRenderTarget && resolvedRenderTargetFile
        ? {
            ...repoRenderTarget,
            importPath: toImportPath(
              dirname(outputPath),
              resolvedRenderTargetFile
            ),
          }
        : repoRenderTarget;
    const generationRenderHelper = rebaseRenderHelperImportPath({
      projectRoot,
      outputPath,
      renderHelper: packageProfile?.effectiveRenderHelper ?? null,
    });
    const boundarySupportPlan = await planBoundarySupport({
      projectRoot,
      outputPath,
      packageProfile: packageProfile ?? null,
      renderTargetFile: resolvedRenderTargetFile,
      renderTarget: repoRenderTarget,
    });
    const jsSuitePlan = rawJsSuitePlan
      ? applyRepoRenderTarget(rawJsSuitePlan, repoRenderTarget)
      : null;
    return {
      jsSuitePlan,
      outputPath,
      resolvedRenderTargetFile,
      boundarySupportPlan,
      generationRenderTarget,
      generationRenderHelper,
    };
  }
);

export const resolveSelectorsActor = fromPromise(
  async ({ input }: { input: ResolveSelectorsActorInput }) => {
    const {
      markerAwareRecording,
      jsSuitePlan,
      analyzedRecording,
      normalizedRecording,
      visualAuth,
      projectRoot,
      debugReporter,
    } = input;
    const itGroups =
      jsSuitePlan?.itGroups ??
      toItGroups(analyzedRecording!, normalizedRecording!.title);
    const resolvedJsGeneration = await resolveJsGeneration(
      markerAwareRecording!,
      itGroups,
      {
        auth: visualAuth
          ? {
              path: resolve(projectRoot, visualAuth.path),
              strategy: visualAuth.strategy,
            }
          : undefined,
        debugReporter,
      }
    );
    return { resolvedJsGeneration };
  }
);

export const generateCodeActor = fromPromise(
  async ({ input }: { input: GenerateCodeActorInput }) => {
    const {
      normalizedRecording,
      resolvedJsGeneration,
      jsSuitePlan,
      outputPath,
      packageProfile,
      boundarySupportPlan,
      generationRenderTarget,
      generationRenderHelper,
      analyzedRecording,
    } = input;
    const conventions = packageProfile?.conventions ?? {
      scannedAt: new Date().toISOString(),
      projectRoot: "",
      importStyle: "esm" as const,
      mockPattern: "none" as const,
      testFiles: [],
      folderPattern: "unknown" as const,
      fileExtension: "ts" as const,
    };
    const hydratedSuitePlan = jsSuitePlan
      ? rehydrateSuitePlan(jsSuitePlan, resolvedJsGeneration!.recording.steps)
      : null;
    const generationHelpers = hydratedSuitePlan
      ? stripSemanticMarkerStepsFromHelpers(hydratedSuitePlan.helpers)
      : undefined;
    const generationScenarios =
      hydratedSuitePlan && generationHelpers
        ? stripSemanticMarkerStepsFromScenarios(
            hydratedSuitePlan.scenarios,
            generationHelpers
          )
        : undefined;
    const generationItGroups = stripSemanticMarkerStepsFromItGroups(
      resolvedJsGeneration!.itGroups
    );
    const generated = generateTestFromGroups(
      normalizedRecording!.title,
      generationItGroups,
      {
        outputPath: outputPath!,
        conventions,
        runner: packageProfile?.effectiveRunner ?? "unknown",
        queryResults: resolvedJsGeneration?.queryResults ?? [],
        helpers: generationHelpers,
        scenarios: generationScenarios,
        renderTarget: generationRenderTarget ?? undefined,
        renderHelper: generationRenderHelper ?? undefined,
      }
    );
    let code = applyBoundarySupport(generated.code, boundarySupportPlan!);
    const boundaryPolicyWarnings = await auditBoundaryPolicy(
      code,
      packageProfile ?? null,
      null
    );
    if (hydratedSuitePlan?.warnings.length) {
      code = [
        ...hydratedSuitePlan.warnings.map(
          (w) => `// taro-boundary-warning: ${w}`
        ),
        code,
      ].join("\n");
    }
    if (boundaryPolicyWarnings.length > 0) {
      code = [
        ...boundaryPolicyWarnings.map((w) => `// taro-boundary-warning: ${w}`),
        code,
      ].join("\n");
    }
    const markerCoverage = buildMarkerCoverageSummary({
      analyzedRecording: analyzedRecording!,
      suitePlan: hydratedSuitePlan,
    });
    const markerDiagnostics = buildMarkerReviewDiagnostics(hydratedSuitePlan);
    const scoreResult = scoreGeneratedTest(code, {
      queryResults: resolvedJsGeneration?.queryResults ?? [],
      markerCoverage,
      markerDiagnostics,
    });
    const flowCoverage = buildFlowCoverageSummary(analyzedRecording!, code);
    const candidateAssessment = { flowCoverage, scoreResult };
    emitQuerySummary(resolvedJsGeneration?.queryResults ?? []);
    return {
      generatedCode: code,
      hydratedSuitePlan,
      scoreResult,
      boundaryPolicyWarnings,
      candidateAssessment,
    };
  }
);

export const assessOutputActor = fromPromise(
  async ({ input }: { input: AssessOutputActorInput }) => {
    const { outputPath, generatedCode, analyzedRecording } = input;
    let existingCode: string | null = null;
    try {
      existingCode = await readFile(outputPath!, "utf-8");
    } catch {
      return {
        existingCode: null,
        existingAssessment: null,
        shouldOverwrite: true,
      };
    }
    const existingAssessment = await assessOutputAgainstRecording({
      analyzedRecording: analyzedRecording!,
      code: existingCode,
    });
    const candidateParsed = await parseJsRecording(generatedCode!);
    const candidateFlowCoverage = buildFlowCoverageSummary(
      analyzedRecording!,
      generatedCode!
    );
    const scoreResult = scoreGeneratedTest(generatedCode!, {
      queryResults: mapParsedQueriesToResults(candidateParsed),
    });
    const candidateAssessment = {
      flowCoverage: candidateFlowCoverage,
      scoreResult,
    };
    return {
      existingCode,
      existingAssessment,
      candidateAssessment,
      shouldOverwrite: false,
    };
  }
);

export const writeOutputActor = fromPromise(
  async ({ input }: { input: WriteOutputActorInput }) => {
    await materializeBoundarySupport(input.boundarySupportPlan!);
    await writeTestFile(input.generatedCode!, input.outputPath!, {
      createDir: true,
      overwriteExisting: input.shouldOverwrite ?? false,
    });
  }
);

export const finalizeActor = fromPromise(
  async ({ input }: { input: FinalizeActorInput }) => {
    const {
      generatedCode,
      outputPath,
      projectRoot,
      filePath,
      scoreResult,
      packageProfile,
    } = input;
    const verification = verifySyntax(generatedCode!, outputPath!);
    if (!verification.valid) {
      throw new Error(`Post-write verification failed: ${verification.error}`);
    }
    try {
      await refreshTaroState(projectRoot);
      await appendGeneratedTestRecord(projectRoot, {
        packagePath: packageProfile?.packagePath ?? ".",
        recordingFile: filePath,
        testFile: outputPath!,
        scoreResult: scoreResult!,
      });
    } catch {
      // state updates are best-effort
    }
  }
);
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/cli/commands/generate.actors.ts
git commit -m "feat: add generate.actors.ts with 15 fromPromise actors"
```

---

## Chunk 3: Machine + CLI Wiring

### Task 4: Write machine tests first (TDD)

**Files:**

- Create: `src/cli/commands/tests/generate.machine.test.ts`

- [ ] **Step 1: Write failing tests for key state transitions**

```typescript
// src/cli/commands/tests/generate.machine.test.ts
import { createActor, fromPromise } from "xstate";
import { describe, expect, it, vi } from "vitest";
import { createGenerateMachine } from "#cli/commands/generate.machine.ts";
import type { GenerateMachineContext } from "#cli/commands/generate.utils.ts";

const noop = fromPromise(async () => {});
const noopReturn = <T>(value: T) => fromPromise(async () => value);

function makeMinimalContext(): GenerateMachineContext {
  return {
    filePath: "/tmp/test.js",
    projectRoot: "/tmp",
    commandOptions: {},
    debugReporter: {
      enabled: false,
      persist: vi.fn(),
      traceReplay: vi.fn(),
      traceSelector: vi.fn(),
      traceStepSummary: vi.fn(),
      traceBrowserFailure: vi.fn(),
    },
    findings: [],
  };
}

describe("generateMachine", () => {
  it("transitions from idle to validating immediately", () => {
    const states: string[] = [];
    const actor = createActor(
      createGenerateMachine({
        validateFileActor: noop,
        parseRecordingActor: noop,
        loadStateActor: noop,
        captureVisualActor: noop,
        searchContextActor: noop,
        refineProfileActor: noopReturn({
          packageProfile: null,
          contextProfileReason: null,
          staleness: null,
        }),
        refreshProfileActor: noop,
        analyzeRecordingActor: noop,
        analyzeMocksActor: noopReturn({ mockAnalysis: null }),
        planGenerationActor: noop,
        resolveSelectorsActor: noop,
        generateCodeActor: noop,
        assessOutputActor: noopReturn({
          existingCode: null,
          existingAssessment: null,
          shouldOverwrite: true,
        }),
        writeOutputActor: noop,
        finalizeActor: noop,
      }),
      { input: makeMinimalContext() }
    );
    actor.subscribe((s) => states.push(s.value as string));
    actor.start();
    expect(states[0]).toBe("idle");
    expect(states[1]).toBe("validating");
  });

  it("transitions to failed when validateFileActor throws", async () => {
    const actor = createActor(
      createGenerateMachine({
        validateFileActor: fromPromise(async () => {
          throw new Error("file not found");
        }),
        parseRecordingActor: noop,
        loadStateActor: noop,
        captureVisualActor: noop,
        searchContextActor: noop,
        refineProfileActor: noopReturn({
          packageProfile: null,
          contextProfileReason: null,
          staleness: null,
        }),
        refreshProfileActor: noop,
        analyzeRecordingActor: noop,
        analyzeMocksActor: noopReturn({ mockAnalysis: null }),
        planGenerationActor: noop,
        resolveSelectorsActor: noop,
        generateCodeActor: noop,
        assessOutputActor: noopReturn({
          existingCode: null,
          existingAssessment: null,
          shouldOverwrite: true,
        }),
        writeOutputActor: noop,
        finalizeActor: noop,
      }),
      { input: makeMinimalContext() }
    );
    await new Promise<void>((resolve) => {
      actor.subscribe((s) => {
        if (s.value === "failed") resolve();
      });
      actor.start();
    });
    expect(actor.getSnapshot().value).toBe("failed");
  });

  it("transitions to done when assessOutputActor finds existing better output", async () => {
    const actor = createActor(
      createGenerateMachine({
        validateFileActor: noop,
        parseRecordingActor: noopReturn({
          normalizedRecording: { title: "t", steps: [], baseline: null },
          defaultOutputPath: "/tmp/t.test.tsx",
        }),
        loadStateActor: noopReturn({
          hadState: false,
          bootstrappedState: {
            state: { packages: {} },
            summary: { warnings: [] },
          },
          overrides: {},
          packageProfile: null,
          explicitAuthPath: null,
          explicitInstructionsPath: null,
          visualAuth: null,
        }),
        captureVisualActor: noopReturn({
          earlyAnalyzedRecording: {
            steps: [],
            diagnostics: { removedRedundantClicks: 0 },
            intentGroups: [],
          },
          recordingUrl: undefined,
          visualState: null,
        }),
        searchContextActor: noopReturn({
          normalizedRecording: { title: "t", steps: [], baseline: null },
          contextMatches: [],
        }),
        refineProfileActor: noopReturn({
          packageProfile: null,
          contextProfileReason: null,
          staleness: { stale: false },
        }),
        refreshProfileActor: noop,
        analyzeRecordingActor: noopReturn({
          analyzedRecording: {
            steps: [],
            diagnostics: { removedRedundantClicks: 0 },
            intentGroups: [],
          },
          markerAwareRecording: { title: "t", steps: [], baseline: null },
          recoveredVisualAuth: null,
          visualAuth: null,
        }),
        analyzeMocksActor: noopReturn({ mockAnalysis: null }),
        planGenerationActor: noopReturn({
          jsSuitePlan: null,
          outputPath: "/tmp/t.test.tsx",
          resolvedRenderTargetFile: null,
          boundarySupportPlan: { warnings: [], requiresReview: false },
          generationRenderTarget: null,
          generationRenderHelper: null,
        }),
        resolveSelectorsActor: noopReturn({
          resolvedJsGeneration: {
            itGroups: [],
            queryResults: [],
            recording: { title: "t", steps: [], baseline: null },
            warnings: [],
          },
        }),
        generateCodeActor: noopReturn({
          generatedCode: "test()",
          hydratedSuitePlan: null,
          scoreResult: {
            total: 50,
            grade: "C",
            requiresReview: true,
            blockers: [],
            dimensions: {
              queryQuality: 50,
              assertionSpecificity: 50,
              testStructure: 50,
              boundaryIsolation: 50,
            },
            markerCoverage: { detected: 0, emitted: 0, unresolved: 0 },
            markerQualityGate: {
              status: "pass",
              failing: false,
              reason: "",
              message: "",
            },
          },
          boundaryPolicyWarnings: [],
          candidateAssessment: {
            flowCoverage: {
              totalSteps: 0,
              coveredSteps: 0,
              coveredStepIds: [],
              uncoveredStepIds: [],
            },
            scoreResult: {
              total: 50,
              grade: "C",
              requiresReview: true,
              blockers: [],
              dimensions: {
                queryQuality: 50,
                assertionSpecificity: 50,
                testStructure: 50,
                boundaryIsolation: 50,
              },
              markerCoverage: { detected: 0, emitted: 0, unresolved: 0 },
              markerQualityGate: {
                status: "pass",
                failing: false,
                reason: "",
                message: "",
              },
            },
          },
        }),
        // existing output is better (score 90 vs candidate 50)
        assessOutputActor: noopReturn({
          existingCode: "existing()",
          existingAssessment: {
            flowCoverage: {
              totalSteps: 2,
              coveredSteps: 2,
              coveredStepIds: ["a", "b"],
              uncoveredStepIds: [],
            },
            scoreResult: {
              total: 90,
              grade: "A",
              requiresReview: false,
              blockers: [],
              dimensions: {
                queryQuality: 90,
                assertionSpecificity: 90,
                testStructure: 90,
                boundaryIsolation: 90,
              },
              markerCoverage: { detected: 0, emitted: 0, unresolved: 0 },
              markerQualityGate: {
                status: "pass",
                failing: false,
                reason: "",
                message: "",
              },
            },
          },
          shouldOverwrite: false,
        }),
        writeOutputActor: noop,
        finalizeActor: noop,
      }),
      { input: makeMinimalContext() }
    );
    await new Promise<void>((resolve) => {
      actor.subscribe((s) => {
        if (s.value === "done") resolve();
      });
      actor.start();
    });
    expect(actor.getSnapshot().value).toBe("done");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run src/cli/commands/tests/generate.machine.test.ts
```

Expected: FAIL — `generate.machine.ts` does not exist yet

- [ ] **Step 3: Commit failing tests**

```bash
git add src/cli/commands/tests/generate.machine.test.ts
git commit -m "test: add generate.machine state transition tests (red)"
```

---

### Task 5: Create generate.machine.ts

**Files:**

- Create: `src/cli/commands/generate.machine.ts`

- [ ] **Step 1: Create the machine**

```typescript
// src/cli/commands/generate.machine.ts
import { assign, fromPromise, setup } from "xstate";
import pc from "picocolors";

import type { GenerateMachineContext } from "#cli/commands/generate.utils.ts";
import {
  generateMachineGuards,
  summarizeAuthPreflight,
  summarizeVisualState,
  summarizePageConfirmedContext,
  summarizeResolvedPackageProfile,
  summarizePlaywrightAuth,
  summarizeCleanup,
  summarizeMockAnalysis,
  summarizeBoundaryWarnings,
  summarizeSuiteContracts,
  summarizeSelectorWarnings,
  logScore,
  emitMarkerCoverageSection,
  emitRecoveredMarkerDiagnostics,
  emitMarkerPlacementCorrections,
  emitUnresolvedMarkerWarnings,
  emitLowConfidenceBanner,
  emitScoreHints,
  logExistingOutputDecision,
  compareOutputAssessments,
  log,
} from "#cli/commands/generate.utils.ts";

export type GenerateMachineActors = {
  validateFileActor: ReturnType<typeof fromPromise>;
  parseRecordingActor: ReturnType<typeof fromPromise>;
  loadStateActor: ReturnType<typeof fromPromise>;
  captureVisualActor: ReturnType<typeof fromPromise>;
  searchContextActor: ReturnType<typeof fromPromise>;
  refineProfileActor: ReturnType<typeof fromPromise>;
  refreshProfileActor: ReturnType<typeof fromPromise>;
  analyzeRecordingActor: ReturnType<typeof fromPromise>;
  analyzeMocksActor: ReturnType<typeof fromPromise>;
  planGenerationActor: ReturnType<typeof fromPromise>;
  resolveSelectorsActor: ReturnType<typeof fromPromise>;
  generateCodeActor: ReturnType<typeof fromPromise>;
  assessOutputActor: ReturnType<typeof fromPromise>;
  writeOutputActor: ReturnType<typeof fromPromise>;
  finalizeActor: ReturnType<typeof fromPromise>;
};

export function createGenerateMachine(actors: GenerateMachineActors) {
  return setup({
    types: { context: {} as GenerateMachineContext },
    actors,
    guards: generateMachineGuards,
  }).createMachine({
    id: "generate",
    initial: "idle",
    context: ({ input }: { input: GenerateMachineContext }) => input,
    states: {
      idle: { always: { target: "validating" } },
      validating: {
        invoke: {
          src: "validateFileActor",
          input: ({ context }) => ({ filePath: context.filePath }),
          onDone: { target: "parsing" },
          onError: {
            target: "failed",
            actions: assign({ error: ({ event }) => event.error as Error }),
          },
        },
      },
      parsing: {
        invoke: {
          src: "parseRecordingActor",
          input: ({ context }) => ({ filePath: context.filePath }),
          onDone: {
            target: "loadingState",
            actions: assign(({ event }) => ({
              normalizedRecording: event.output?.normalizedRecording,
              defaultOutputPath: event.output?.defaultOutputPath,
            })),
          },
          onError: {
            target: "failed",
            actions: assign({ error: ({ event }) => event.error as Error }),
          },
        },
      },
      loadingState: {
        invoke: {
          src: "loadStateActor",
          input: ({ context }) => ({
            filePath: context.filePath,
            projectRoot: context.projectRoot,
            commandOptions: context.commandOptions,
          }),
          onDone: {
            target: "capturingVisual",
            actions: assign(({ event }) => ({
              hadState: event.output?.hadState,
              bootstrappedState: event.output?.bootstrappedState,
              overrides: event.output?.overrides,
              packageProfile: event.output?.packageProfile,
              explicitAuthPath: event.output?.explicitAuthPath,
              explicitInstructionsPath: event.output?.explicitInstructionsPath,
              visualAuth: event.output?.visualAuth,
            })),
          },
          onError: {
            target: "failed",
            actions: assign({ error: ({ event }) => event.error as Error }),
          },
        },
      },
      capturingVisual: {
        invoke: {
          src: "captureVisualActor",
          input: ({ context }) => ({
            normalizedRecording: context.normalizedRecording,
            visualAuth: context.visualAuth,
            projectRoot: context.projectRoot,
            commandOptions: context.commandOptions,
          }),
          onDone: {
            target: "searchingContext",
            actions: assign(({ event }) => ({
              earlyAnalyzedRecording: event.output?.earlyAnalyzedRecording,
              recordingUrl: event.output?.recordingUrl,
              visualState: event.output?.visualState,
            })),
          },
          onError: {
            target: "failed",
            actions: assign({ error: ({ event }) => event.error as Error }),
          },
        },
        entry: ({ context }) => {
          if (context.commandOptions.screenshots === false) {
            log(
              pc.dim("[taro]") +
                " Screenshot artifacts skipped (--no-screenshots); Playwright page confirmation still ran."
            );
          }
        },
      },
      searchingContext: {
        entry: ({ context }) => {
          summarizeAuthPreflight({
            auth: context.visualAuth ?? null,
            url: context.recordingUrl,
            visualState: context.visualState ?? null,
          });
          summarizeVisualState(context.visualState ?? null);
          summarizePageConfirmedContext(context.visualState ?? null);
        },
        invoke: {
          src: "searchContextActor",
          input: ({ context }) => ({
            normalizedRecording: context.normalizedRecording,
            visualState: context.visualState,
            projectRoot: context.projectRoot,
            defaultOutputPath: context.defaultOutputPath,
            filePath: context.filePath,
          }),
          onDone: {
            target: "refiningProfile",
            actions: assign(({ event }) => ({
              normalizedRecording: event.output?.normalizedRecording,
              contextMatches: event.output?.contextMatches,
            })),
          },
          onError: {
            target: "failed",
            actions: assign({ error: ({ event }) => event.error as Error }),
          },
        },
      },
      refiningProfile: {
        invoke: {
          src: "refineProfileActor",
          input: ({ context }) => ({
            bootstrappedState: context.bootstrappedState,
            packageProfile: context.packageProfile,
            projectRoot: context.projectRoot,
            overrides: context.overrides,
            contextMatches: context.contextMatches,
          }),
          onDone: [
            {
              guard: "isProfileStale",
              target: "refreshingProfile",
              actions: assign(({ event }) => ({
                packageProfile: event.output?.packageProfile,
                contextProfileReason: event.output?.contextProfileReason,
                staleness: event.output?.staleness,
              })),
            },
            {
              target: "analyzingRecording",
              actions: assign(({ event }) => ({
                packageProfile: event.output?.packageProfile,
                contextProfileReason: event.output?.contextProfileReason,
                staleness: event.output?.staleness,
              })),
            },
          ],
          onError: {
            target: "failed",
            actions: assign({ error: ({ event }) => event.error as Error }),
          },
        },
      },
      refreshingProfile: {
        invoke: {
          src: "refreshProfileActor",
          input: ({ context }) => ({
            projectRoot: context.projectRoot,
            contextMatches: context.contextMatches,
            overrides: context.overrides,
          }),
          onDone: {
            target: "refiningProfile",
            actions: assign(({ event }) => ({
              bootstrappedState: event.output?.bootstrappedState,
              overrides: event.output?.overrides,
              packageProfile: event.output?.packageProfile,
              contextProfileReason: event.output?.contextProfileReason,
              staleness: event.output?.staleness,
            })),
          },
          onError: {
            target: "failed",
            actions: assign({ error: ({ event }) => event.error as Error }),
          },
        },
      },
      analyzingRecording: {
        entry: ({ context }) => {
          if (context.bootstrappedState?.summary.warnings.length) {
            for (const w of context.bootstrappedState.summary.warnings) {
              console.warn(pc.yellow(`[taro] State: ${w}`));
            }
          }
          if (context.hadState === false)
            log(
              pc.dim("[taro]") +
                " Bootstrapped .taro/state.json from current repo tests."
            );
          if (context.contextMatches?.length)
            log(pc.dim("[taro]") + ` Context matches found.`);
          if (context.contextProfileReason && context.packageProfile) {
            log(
              pc.dim("[taro]") +
                ` Context-selected package profile ${context.packageProfile.packagePath}: ${context.contextProfileReason}.`
            );
          }
          summarizeResolvedPackageProfile(context.packageProfile ?? null);
          summarizePlaywrightAuth(context.packageProfile ?? null);
          log(
            pc.green("Parsed:") +
              ` ${pc.bold(context.normalizedRecording!.title)} — ${context.normalizedRecording!.steps.length} steps`
          );
        },
        invoke: {
          src: "analyzeRecordingActor",
          input: ({ context }) => ({
            normalizedRecording: context.normalizedRecording,
            packageProfile: context.packageProfile,
            projectRoot: context.projectRoot,
            visualState: context.visualState,
            visualAuth: context.visualAuth,
            explicitAuthPath: context.explicitAuthPath,
          }),
          onDone: {
            target: "analyzingMocks",
            actions: assign(({ event }) => ({
              analyzedRecording: event.output?.analyzedRecording,
              markerAwareRecording: event.output?.markerAwareRecording,
              recoveredVisualAuth: event.output?.recoveredVisualAuth,
              visualAuth: event.output?.visualAuth,
            })),
          },
          onError: {
            target: "failed",
            actions: assign({ error: ({ event }) => event.error as Error }),
          },
        },
      },
      analyzingMocks: {
        entry: ({ context }) => {
          summarizeCleanup(context.analyzedRecording!);
        },
        invoke: {
          src: "analyzeMocksActor",
          input: ({ context }) => ({
            projectRoot: context.projectRoot,
            packageProfile: context.packageProfile,
          }),
          onDone: {
            target: "planning",
            actions: assign(({ event }) => ({
              mockAnalysis: event.output?.mockAnalysis,
            })),
          },
          onError: {
            target: "failed",
            actions: assign({ error: ({ event }) => event.error as Error }),
          },
        },
      },
      planning: {
        entry: ({ context }) => {
          summarizeMockAnalysis(context.mockAnalysis ?? null);
        },
        invoke: {
          src: "planGenerationActor",
          input: ({ context }) => ({
            markerAwareRecording: context.markerAwareRecording,
            analyzedRecording: context.analyzedRecording,
            mockAnalysis: context.mockAnalysis,
            normalizedRecording: context.normalizedRecording,
            packageProfile: context.packageProfile,
            projectRoot: context.projectRoot,
            defaultOutputPath: context.defaultOutputPath,
            contextMatches: context.contextMatches,
            visualState: context.visualState,
          }),
          onDone: {
            target: "resolvingSelectors",
            actions: assign(({ event }) => ({
              jsSuitePlan: event.output?.jsSuitePlan,
              outputPath: event.output?.outputPath,
              resolvedRenderTargetFile: event.output?.resolvedRenderTargetFile,
              boundarySupportPlan: event.output?.boundarySupportPlan,
              generationRenderTarget: event.output?.generationRenderTarget,
              generationRenderHelper: event.output?.generationRenderHelper,
            })),
          },
          onError: {
            target: "failed",
            actions: assign({ error: ({ event }) => event.error as Error }),
          },
        },
      },
      resolvingSelectors: {
        entry: ({ context }) => {
          if (context.boundarySupportPlan?.warnings.length) {
            for (const w of context.boundarySupportPlan.warnings)
              console.warn(pc.yellow(`[taro] Boundary support: ${w}`));
          }
          if (context.jsSuitePlan) {
            summarizeBoundaryWarnings(context.jsSuitePlan.warnings);
            summarizeSuiteContracts(context.jsSuitePlan);
          }
        },
        invoke: {
          src: "resolveSelectorsActor",
          input: ({ context }) => ({
            markerAwareRecording: context.markerAwareRecording,
            jsSuitePlan: context.jsSuitePlan,
            analyzedRecording: context.analyzedRecording,
            normalizedRecording: context.normalizedRecording,
            visualAuth: context.visualAuth,
            projectRoot: context.projectRoot,
            debugReporter: context.debugReporter,
          }),
          onDone: {
            target: "generating",
            actions: assign(({ event }) => ({
              resolvedJsGeneration: event.output?.resolvedJsGeneration,
            })),
          },
          onError: {
            target: "failed",
            actions: assign({ error: ({ event }) => event.error as Error }),
          },
        },
      },
      generating: {
        entry: ({ context }) => {
          summarizeSelectorWarnings(
            context.resolvedJsGeneration?.warnings ?? []
          );
        },
        invoke: {
          src: "generateCodeActor",
          input: ({ context }) => ({
            normalizedRecording: context.normalizedRecording,
            resolvedJsGeneration: context.resolvedJsGeneration,
            jsSuitePlan: context.jsSuitePlan,
            outputPath: context.outputPath,
            packageProfile: context.packageProfile,
            boundarySupportPlan: context.boundarySupportPlan,
            generationRenderTarget: context.generationRenderTarget,
            generationRenderHelper: context.generationRenderHelper,
            analyzedRecording: context.analyzedRecording,
          }),
          onDone: {
            target: "assessingOutput",
            actions: assign(({ event }) => ({
              generatedCode: event.output?.generatedCode,
              hydratedSuitePlan: event.output?.hydratedSuitePlan,
              scoreResult: event.output?.scoreResult,
              boundaryPolicyWarnings: event.output?.boundaryPolicyWarnings,
              candidateAssessment: event.output?.candidateAssessment,
            })),
          },
          onError: {
            target: "failed",
            actions: assign({ error: ({ event }) => event.error as Error }),
          },
        },
      },
      assessingOutput: {
        invoke: {
          src: "assessOutputActor",
          input: ({ context }) => ({
            outputPath: context.outputPath,
            generatedCode: context.generatedCode,
            analyzedRecording: context.analyzedRecording,
          }),
          onDone: [
            {
              guard: "shouldWrite",
              target: "writing",
              actions: assign(({ context, event }) => ({
                existingCode: event.output?.existingCode,
                existingAssessment: event.output?.existingAssessment,
                shouldOverwrite: event.output?.existingCode != null,
              })),
            },
            {
              guard: "shouldKeepExisting",
              target: "done",
              actions: ({ context, event }) => {
                if (
                  event.output?.existingCode &&
                  event.output?.existingAssessment
                ) {
                  logExistingOutputDecision({
                    outputPath: context.outputPath!,
                    candidate: context.candidateAssessment!,
                    existing: event.output.existingAssessment,
                    overwrite: false,
                  });
                }
              },
            },
          ],
          // intentional: preserve existing on assessment error
          onError: { target: "done" },
        },
      },
      writing: {
        entry: ({ context }) => {
          if (context.existingCode && context.existingAssessment) {
            logExistingOutputDecision({
              outputPath: context.outputPath!,
              candidate: context.candidateAssessment!,
              existing: context.existingAssessment,
              overwrite: true,
            });
          }
          logScore(context.scoreResult!);
          emitMarkerCoverageSection(context.scoreResult!);
          emitRecoveredMarkerDiagnostics(context.hydratedSuitePlan ?? null);
          emitMarkerPlacementCorrections(context.hydratedSuitePlan ?? null);
          emitUnresolvedMarkerWarnings(context.hydratedSuitePlan ?? null);
          for (const w of context.boundaryPolicyWarnings ?? []) {
            console.warn(pc.yellow(`[taro] Boundary policy: ${w}`));
          }
          if (context.boundarySupportPlan?.requiresReview) {
            console.warn(
              pc.yellow(
                "[taro] Boundary support requires manual review because one or more collaborators were scaffolded with generic defaults."
              )
            );
          }
          emitLowConfidenceBanner(context.scoreResult!);
          emitScoreHints(
            context.scoreResult!,
            context.resolvedJsGeneration?.queryResults ?? []
          );
        },
        invoke: {
          src: "writeOutputActor",
          input: ({ context }) => ({
            generatedCode: context.generatedCode,
            outputPath: context.outputPath,
            shouldOverwrite: context.shouldOverwrite,
            boundarySupportPlan: context.boundarySupportPlan,
          }),
          onDone: { target: "finalizing" },
          onError: {
            target: "failed",
            actions: assign({ error: ({ event }) => event.error as Error }),
          },
        },
      },
      finalizing: {
        invoke: {
          src: "finalizeActor",
          input: ({ context }) => ({
            generatedCode: context.generatedCode,
            outputPath: context.outputPath,
            projectRoot: context.projectRoot,
            filePath: context.filePath,
            scoreResult: context.scoreResult,
            packageProfile: context.packageProfile,
          }),
          onDone: {
            target: "done",
            actions: ({ context }) => {
              const action = context.shouldOverwrite
                ? pc.yellow("Updated")
                : pc.green("Created");
              log(`${action}: ${pc.bold(context.outputPath!)}`);
              log(pc.green("[taro] ✓ post-write verified"));
            },
          },
          onError: {
            target: "failed",
            actions: assign({ error: ({ event }) => event.error as Error }),
          },
        },
      },
      done: { type: "final" },
      failed: { type: "final" },
    },
  });
}
```

- [ ] **Step 2: Run machine tests to verify they pass**

```bash
npx vitest run src/cli/commands/tests/generate.machine.test.ts
```

Expected: all 3 tests PASS

- [ ] **Step 3: Commit**

```bash
git add src/cli/commands/generate.machine.ts
git commit -m "feat: add generate.machine.ts XState state machine (green)"
```

---

### Task 6: Rewrite generate.ts to wire the machine

**Files:**

- Modify: `src/cli/commands/generate.ts`

- [ ] **Step 1: Replace the `action` handler body with machine wiring**

Keep the `Command` setup (`generate.description(...)`, `.argument(...)`, `.option(...)`) unchanged. Replace only the `.action(async (file) => { ... })` body:

```typescript
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

  const initialContext: GenerateMachineContext = {
    filePath,
    projectRoot,
    commandOptions,
    debugReporter,
    findings: [],
  }

  await new Promise<void>((resolvePromise) => {
    const actor = createActor(createGenerateMachine(actors), { input: initialContext })

    actor.subscribe((state) => {
      if (state.value === 'done') {
        debugReporter.persist().then(() => {
          flushFindings(state.context.findings)
        })
        resolvePromise()
      }
      if (state.value === 'failed') {
        const err = state.context.error
        debugReporter.persist().then(() => {
          if (err) process.stderr.write(pc.red('Error:') + ` ${err.message}\n`)
          process.exit(2)
        })
        resolvePromise()
      }
    })

    actor.start()
  })
})
```

Add imports at top of file:

```typescript
import { createActor } from "xstate";
import { createGenerateMachine } from "#cli/commands/generate.machine.ts";
import * as actors from "#cli/commands/generate.actors.ts";
import type { GenerateMachineContext } from "#cli/commands/generate.utils.ts";
import { flushFindings } from "#cli/commands/generate.utils.ts";
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 3: Run all generate tests**

```bash
npx vitest run src/cli/commands/tests/
```

Expected: all tests pass

- [ ] **Step 4: Commit**

```bash
git add src/cli/commands/generate.ts
git commit -m "feat: rewrite generate.ts action handler to use XState machine"
```

---

## Chunk 4: Verification

### Task 7: Full test suite + build verification

- [ ] **Step 1: Run full test suite**

```bash
npx vitest run
```

Expected: all tests pass, no regressions

- [ ] **Step 2: Verify TypeScript strict build**

```bash
npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 3: Verify the `generateCommandInternals` import still works from test files**

```bash
npx vitest run src/cli/commands/tests/generate.internals.test.ts
```

Expected: all tests pass

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "chore: verify xstate migration — all tests passing"
```
