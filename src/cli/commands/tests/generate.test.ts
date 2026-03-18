import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { stripVTControlCharacters } from "node:util";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createGenerateCommand } from "#cli/commands/generate.ts";
import { analyzeBoundaryIsolation } from "#core/boundary-intelligence.ts";
import { sampleRestRecordingJs } from "#tests/fixtures/sample-fixtures.ts";
import type {
  QueryDescriptor,
  SelectorDescriptor,
  SelectorResolutionResult,
} from "#types/recording.ts";

const {
  captureVisualStateMock,
  openCapturePageMock,
  replayStepMock,
  resolveSelectorMock,
} = vi.hoisted(() => ({
  captureVisualStateMock: vi.fn(async () => null),
  openCapturePageMock: vi.fn(),
  replayStepMock: vi.fn(),
  resolveSelectorMock: vi.fn(),
}));

vi.mock("#core/resolver.ts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("#core/resolver.ts")>();

  return {
    ...actual,
    captureVisualState: captureVisualStateMock,
    openCapturePage: openCapturePageMock,
    replayStep: replayStepMock,
    resolveSelector: resolveSelectorMock,
  };
});

vi.mock("#core/mock-intelligence.ts", () => ({
  analyzeMocks: vi.fn(async () => null),
}));

const {
  loadOrBootstrapTaroStateMock,
  detectPackageProfileStalenessMock,
  resolveTaroPackageProfileMock,
  appendGeneratedTestRecordMock,
  persistPlaywrightAuthProfileMock,
  readTaroOverridesMock,
  refreshTaroStateMock,
} = vi.hoisted(() => ({
  loadOrBootstrapTaroStateMock: vi.fn(),
  detectPackageProfileStalenessMock: vi.fn(),
  resolveTaroPackageProfileMock: vi.fn(),
  appendGeneratedTestRecordMock: vi.fn(),
  persistPlaywrightAuthProfileMock: vi.fn(),
  readTaroOverridesMock: vi.fn(),
  refreshTaroStateMock: vi.fn(),
}));

const defaultProfile = {
  packagePath: ".",
  packageName: null,
  scannedAt: new Date(0).toISOString(),
  testFileCount: 0,
  conventions: {
    scannedAt: new Date(0).toISOString(),
    projectRoot: "/tmp/project",
    importStyle: "esm",
    mockPattern: "none",
    testFiles: [],
    folderPattern: "unknown",
    fileExtension: "ts",
  },
  importStyle: { value: "esm", confidence: "high", evidence: [] as string[] },
  runner: {
    value: "unknown" as const,
    confidence: "low",
    evidence: [] as string[],
  },
  mockPattern: {
    value: "none" as const,
    confidence: "low",
    evidence: [] as string[],
  },
  folderPattern: {
    value: "unknown" as const,
    confidence: "low",
    evidence: [] as string[],
  },
  fileExtension: {
    value: "ts" as const,
    confidence: "high",
    evidence: [] as string[],
  },
  renderHelpers: [],
  providerWrappers: [],
  renderTargets: [] as Array<{
    symbol: string;
    importPath: string;
    sourceTestFile: string;
    helperNames: string[];
    usesWithin: boolean;
  }>,
  repeatedMockTargets: [],
  sharedMockFactories: [],
  boundaryProfiles: [],
  boundaryExemplars: [],
  interactionContracts: [],
  inlineSafeMockTargets: [],
  mutationLifecycles: [],
  instabilityWarnings: [],
  mockRecommendations: [],
  fixtureRoots: [],
  exemplars: [],
  playwrightAuth: null as {
    strategy: string;
    path: string;
    detectedAt: string;
    source: string;
  } | null,
  warnings: [],
  effectiveRunner: "unknown" as const,
  effectiveRenderHelper: null,
  appliedOverrides: [] as string[],
  forbidMocks: [] as string[],
  preferredSharedMocks: {},
  boundaryPolicies: {},
  preferredBoundaryImplementations: {},
  forbidBoundaryTargets: [] as string[],
  effectiveQueryHookPolicy: "avoid" as const,
  effectiveCompanionPolicy: "heuristic" as const,
  enabledContractFamilies: ["mutation-form"] as const,
};

function createDefaultTaroState(packages: Record<string, unknown> = {}) {
  return {
    state: {
      version: 1,
      meta: {
        createdAt: new Date(0).toISOString(),
        updatedAt: new Date(0).toISOString(),
        taroVersion: "test",
      },
      packages: packages as Record<string, never>,
      mockStore: {
        rootDir: null,
        importHint: null,
        resources: [],
      },
      generatedTests: [],
    },
    summary: {
      packageCount: 1,
      renderHelperCount: 0,
      repeatedMockTargetCount: 0,
      boundaryProfileCount: 0,
      lowConfidenceBoundaryCount: 0,
      fixtureRootCount: 0,
      migratedLegacyState: false,
      overridePackageCount: 0,
      packages: [],
      warnings: [],
    },
  };
}

function createPackageResolver(
  packages: Record<string, typeof defaultProfile>,
  fallbackProfile = defaultProfile,
) {
  return (_state: unknown, _projectRoot: string, targetPath: string) => {
    const normalizedTarget = targetPath.replace(/\\/g, "/");
    const matchingPackage = Object.keys(packages)
      .filter((packagePath) => packagePath !== ".")
      .sort((left, right) => right.length - left.length)
      .find((packagePath) => normalizedTarget.includes(`/${packagePath}/`));

    if (matchingPackage) {
      return packages[matchingPackage] ?? fallbackProfile;
    }

    return fallbackProfile;
  };
}

vi.mock("#core/state.ts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("#core/state.ts")>();

  return {
    ...actual,
    appendGeneratedTestRecord: appendGeneratedTestRecordMock,
    loadOrBootstrapTaroState: loadOrBootstrapTaroStateMock,
    detectPackageProfileStaleness: detectPackageProfileStalenessMock,
    persistPlaywrightAuthProfile: persistPlaywrightAuthProfileMock,
    readTaroOverrides: readTaroOverridesMock,
    refreshTaroState: refreshTaroStateMock,
    resolveTaroPackageProfile: resolveTaroPackageProfileMock,
  };
});

const { planJsSuiteMock } = vi.hoisted(() => ({
  planJsSuiteMock: vi.fn(),
}));

vi.mock("#core/suite-planner.ts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("#core/suite-planner.ts")>();
  planJsSuiteMock.mockImplementation(actual.planJsSuite);
  return {
    ...actual,
    planJsSuite: planJsSuiteMock,
  };
});

const sandboxes: string[] = [];
const accessibleSelector = "div.css-19bb58m";
const inspectionFailureSelector =
  "#radix-_r_8s_-content-items > div:nth-of-type(1) > div:nth-of-type(2) span";
const inaccessibleSelector =
  "#radix-_r_8s_-content-otherDetails > div:nth-of-type(1) > div:nth-of-type(1) div.css-19bb58m";
const environmentUrlMarker = "@jest-environment" + " url";
const environmentOptionsMarker = "@jest-environment" + "-options";

function countOccurrences(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

function deriveOutputPath(recordingPath: string): string {
  return recordingPath.replace(/\.js$/, ".test.tsx");
}

async function createProjectInlineJsFixture(label: string, source: string) {
  const sandbox = await createSandbox(label);
  const recordingsDir = join(sandbox.outputDir, "recordings");
  await mkdir(recordingsDir, { recursive: true });
  const recordingPath = join(recordingsDir, `${label}.js`);
  await writeFile(recordingPath, source, "utf-8");
  return { ...sandbox, recordingPath };
}

function resolvedSelector(
  selector: SelectorDescriptor,
  query: QueryDescriptor,
  source: "baseline" | "live-dom" = "live-dom",
): SelectorResolutionResult {
  return {
    status: "resolved",
    outcome: source === "baseline" ? "preserved-query" : "accessible-query",
    source,
    stepId: selector.stepId,
    selector,
    url: "http://localhost:3001/workspace",
    query,
    warnings: [],
  };
}

function unresolvedSelector(
  selector: SelectorDescriptor,
  outcome: Extract<
    SelectorResolutionResult,
    { status: "unresolved" }
  >["outcome"],
  reason: string,
  extras: {
    debug?: SelectorResolutionResult["debug"];
    url?: string;
    inspectionError?: string;
  } = {},
): SelectorResolutionResult {
  return {
    debug: extras.debug,
    status: "unresolved",
    outcome,
    stepId: selector.stepId,
    selector,
    url: extras.url,
    reason,
    inspectionError: extras.inspectionError,
    warnings: [reason],
  };
}

function makeLiveDomQuery(selector: SelectorDescriptor): QueryDescriptor {
  return {
    stepId: selector.stepId,
    method: "getByRole",
    queryRoot: "screen",
    line: selector.line,
    target: selector.selector,
    quality: "excellent",
    raw: "screen.getByRole('combobox', { name: 'Item selector' })",
  };
}

function defaultResolveSelector(
  selector: SelectorDescriptor,
  options: {
    url?: string;
    preservedQuery?: QueryDescriptor;
  } = {},
): SelectorResolutionResult {
  if (options.preservedQuery) {
    return resolvedSelector(selector, options.preservedQuery, "baseline");
  }

  if (!options.url) {
    return unresolvedSelector(
      selector,
      "no-url",
      `No recorded URL is available to inspect selector ${selector.selector}.`,
    );
  }

  if (selector.selector === accessibleSelector) {
    return resolvedSelector(selector, makeLiveDomQuery(selector));
  }

  if (selector.selector === inaccessibleSelector) {
    return unresolvedSelector(
      selector,
      "selector-inaccessible",
      `Selector ${selector.selector} did not expose trustworthy accessible query evidence.`,
      { url: options.url },
    );
  }

  if (selector.selector === inspectionFailureSelector) {
    return unresolvedSelector(
      selector,
      "inspection-failed",
      `Playwright inspection failed for selector ${selector.selector}.`,
      {
        url: options.url,
        inspectionError: "browser blocked",
      },
    );
  }

  return unresolvedSelector(
    selector,
    "selector-not-found",
    `Selector ${selector.selector} was not found at ${options.url}.`,
    { url: options.url },
  );
}

async function createSandbox(label: string) {
  const root = await mkdtemp(join(tmpdir(), `taro-generate-${label}-`));
  sandboxes.push(root);
  await mkdir(join(root, "project"), { recursive: true });
  return { outputDir: join(root, "project"), root };
}

async function createRecordingFixture(
  label: string,
  mutate?: (source: string) => string,
) {
  const sandbox = await createSandbox(label);
  const source = sampleRestRecordingJs;
  const recordingPath = join(sandbox.root, `${label}.js`);
  await writeFile(recordingPath, mutate ? mutate(source) : source, "utf-8");
  return { ...sandbox, recordingPath };
}

async function createInlineJsFixture(label: string, source: string) {
  const sandbox = await createSandbox(label);
  const recordingPath = join(sandbox.root, `${label}.js`);
  await writeFile(recordingPath, source, "utf-8");
  return { ...sandbox, recordingPath };
}

class ProcessExitSignal {
  constructor(public readonly code: number) {}
}

async function runGenerate(
  args: string[],
  cwdPath: string,
  context?: Parameters<typeof createGenerateCommand>[0],
) {
  const command = createGenerateCommand(context);
  const stderrChunks: string[] = [];
  const stdoutChunks: string[] = [];
  const stderrSpy = vi
    .spyOn(process.stderr, "write")
    .mockImplementation((chunk) => {
      stderrChunks.push(String(chunk));
      return true;
    });
  const stdoutSpy = vi
    .spyOn(process.stdout, "write")
    .mockImplementation((chunk) => {
      stdoutChunks.push(String(chunk));
      return true;
    });
  const exitSpy = vi
    .spyOn(process, "exit")
    .mockImplementation((code?: number) => {
      throw new ProcessExitSignal(code ?? 0);
    });
  const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
  const errorSpy = vi
    .spyOn(console, "error")
    .mockImplementation(() => undefined);
  const originalCwd = process.cwd();
  let thrown: unknown;
  let capturedExitCode: number | undefined;
  let result: {
    logs: string;
    stdout: string;
    warnings: string;
    errors: string;
    thrown: unknown;
    exitCode: number | undefined;
  };

  process.chdir(cwdPath);

  try {
    await command.parseAsync(args, { from: "user" });
  } catch (error) {
    if (error instanceof ProcessExitSignal) {
      capturedExitCode = error.code;
    } else {
      thrown = error;
    }
  } finally {
    result = {
      logs: stripVTControlCharacters(stderrChunks.join("")),
      stdout: stripVTControlCharacters(stdoutChunks.join("")),
      warnings: stripVTControlCharacters(warnSpy.mock.calls.flat().join("\n")),
      errors: stripVTControlCharacters(errorSpy.mock.calls.flat().join("\n")),
      thrown,
      exitCode: capturedExitCode,
    };

    process.chdir(originalCwd);
    stderrSpy.mockRestore();
    stdoutSpy.mockRestore();
    exitSpy.mockRestore();
    warnSpy.mockRestore();
    errorSpy.mockRestore();
  }

  return result;
}

beforeEach(() => {
  captureVisualStateMock.mockReset();
  captureVisualStateMock.mockResolvedValue(null);
  openCapturePageMock.mockReset();
  openCapturePageMock.mockResolvedValue({
    browser: { close: vi.fn(async () => undefined) },
    page: {},
  });
  loadOrBootstrapTaroStateMock.mockResolvedValue(createDefaultTaroState());
  detectPackageProfileStalenessMock.mockResolvedValue({
    stale: false,
    reason: null,
    latestEvidencePath: null,
  });
  resolveTaroPackageProfileMock.mockImplementation(() =>
    structuredClone(defaultProfile),
  );
  appendGeneratedTestRecordMock.mockResolvedValue(undefined);
  persistPlaywrightAuthProfileMock.mockResolvedValue(true);
  readTaroOverridesMock.mockResolvedValue({});
  refreshTaroStateMock.mockResolvedValue(createDefaultTaroState());
  planJsSuiteMock.mockClear();
  replayStepMock.mockReset();
  replayStepMock.mockResolvedValue({
    replayed: true,
  });
  resolveSelectorMock.mockReset();
  resolveSelectorMock.mockImplementation(defaultResolveSelector);
});

afterEach(async () => {
  await Promise.all(
    sandboxes
      .splice(0)
      .map((root) => rm(root, { recursive: true, force: true })),
  );
  process.exitCode = undefined;
});

describe("createGenerateCommand", () => {
  it("writes JS output with repo-aware recovery and explicit unresolved-selector warnings", async () => {
    const fixture = await createRecordingFixture("write-sample");
    const outputPath = join(
      fixture.outputDir,
      "sample",
      "FeatureFlow.test.tsx",
    );

    resolveTaroPackageProfileMock.mockImplementation(() => ({
      ...structuredClone(defaultProfile),
      renderTargets: [
        {
          symbol: "FeatureFlow",
          importPath: "./FeatureFlow",
          sourceTestFile: "sample/feature-flow.test.tsx",
          helperNames: [
            "openFeatureEntry",
            "completeFeatureFlow",
            "reviewFeatureState",
          ],
          usesWithin: true,
        },
      ],
    }));

    const result = await runGenerate(
      [fixture.recordingPath],
      fixture.outputDir,
    );
    const written = await readFile(outputPath, "utf-8");

    expect(result.thrown).toBeUndefined();
    expect(result.errors).toBe("");
    expect(result.logs).toContain(
      "Parsed: Recording-Add-Sale-KE-06/03/2026 at 08:25:15",
    );
    expect(result.logs).toContain("State profile: package=.");
    expect(result.logs).toContain("[taro] ✓ post-write verified");
    expect(result.logs).toContain("Updated .taro/state.json for package .");
    expect(result.logs).toContain("Created:");
    expect(result.logs).toContain("sample/FeatureFlow.test.tsx");
    expect(written).toContain("import FeatureFlow from './FeatureFlow'");
    expect(written).toContain("render(<FeatureFlow />)");
    expect(written).toContain("const planSupportsContinue = async");
    expect(written).toContain("await planSupportsContinue(user)");
    expect(written).toContain("within(screen.getByRole(");
    expect(written).toContain(
      "screen.getByRole('button', {name: '+ Add Item to Cart'})",
    );
    expect(written).toContain(
      "screen.getByRole('combobox', { name: 'Item selector' })",
    );
    expect(written).toContain(
      "// taro-query-checkpoint: click step requires manual RTL query recovery",
    );
    expect(written).toContain(`// selector: ${inaccessibleSelector}`);
    expect(written).not.toContain(`// selector: ${inspectionFailureSelector}`);
    expect(written).not.toContain("screen.getByTestId(");
    expect(result.warnings).toContain("Manual review required");
    expect(result.warnings).toContain("Top blockers:");
    expect(result.warnings).toContain(
      `unresolved selector ${inaccessibleSelector}`,
    );
    expect(result.warnings).toContain(
      `Playwright inspection failed for selector ${inspectionFailureSelector}.`,
    );
    expect(result.warnings).not.toContain(
      "Taro could not resolve the exact render target",
    );
    expect(analyzeBoundaryIsolation(written)).toEqual([]);
  });

  it("retries unresolved selectors after successful replay advances page state", async () => {
    const fixture = await createInlineJsFixture(
      "reveal-after-click",
      `/**
 * ${environmentUrlMarker}
 * ${environmentOptionsMarker} { "url": "http://localhost:3001/workspace" }
 */
const {screen} = require('@testing-library/dom')
const {default: userEvent} = require('@testing-library/user-event')
require('@testing-library/jest-dom')

test('Reveal flow', async () => {
  expect(location.href).toBe('http://localhost:3001/workspace')
  await userEvent.click(screen.getByRole('button', { name: 'Add Party' }))
  await userEvent.click(document.querySelector('#party-type'))
  await userEvent.click(screen.getByRole('radio', { name: 'Business' }))
})`,
    );

    const deferredSelector = "#party-type";
    const deferredQuery: QueryDescriptor = {
      stepId: "js-step-2",
      method: "getByRole",
      queryRoot: "screen",
      line: 10,
      target: "Party Type",
      role: "combobox",
      name: "Party Type",
      quality: "excellent",
      raw: "screen.getByRole('combobox', { name: 'Party Type' })",
    };

    let successfulReplays = 0;
    replayStepMock.mockImplementation(async (page, step) => {
      if (step.id === "js-step-2") {
        return {
          replayed: false,
          warning: "No locator for click on #party-type",
        };
      }

      successfulReplays += 1;
      return { replayed: true };
    });

    resolveSelectorMock.mockImplementation((selector, options = {}) => {
      if (options.preservedQuery) {
        return resolvedSelector(selector, options.preservedQuery, "baseline");
      }

      if (selector.selector !== deferredSelector) {
        return defaultResolveSelector(selector, options);
      }

      if (successfulReplays < 2) {
        return unresolvedSelector(
          selector,
          "selector-not-found",
          `Selector ${selector.selector} was not found at ${options.url}.`,
          { url: options.url },
        );
      }

      return resolvedSelector(selector, deferredQuery);
    });

    const result = await runGenerate([fixture.recordingPath], fixture.outputDir);
    const written = await readFile(
      deriveOutputPath(fixture.recordingPath),
      "utf-8",
    );

    expect(result.thrown).toBeUndefined();
    expect(result.errors).toBe("");
    expect(result.logs).toContain(
      "Resolving 1 selector(s) via Playwright with step replay...",
    );
    expect(result.warnings).toContain(
      "Step replay: No locator for click on #party-type",
    );
    expect(result.warnings).not.toContain(
      `unresolved selector ${deferredSelector}`,
    );
    expect(written).toContain(
      "screen.getByRole('combobox', { name: 'Party Type' })",
    );
    expect(written).not.toContain(`// selector: ${deferredSelector}`);
    expect(resolveSelectorMock).toHaveBeenCalledTimes(2);
  });

  it("emits selector and replay debug traces and writes JSONL when selector debugging is enabled", async () => {
    const fixture = await createRecordingFixture("selector-debug");
    const debugPath = join(fixture.outputDir, ".taro", "selector-debug.jsonl");

    replayStepMock.mockResolvedValue({
      replayed: false,
      warning: "click on #save failed: Timeout 3000ms exceeded",
      debug: {
        action: "click",
        error: "Timeout 3000ms exceeded",
        locatorSource: "metadata.query",
        locatorValue: "getByRole('button', { name: 'Save' })",
        pageTitle: "Workspace",
        pageUrl: "http://localhost:3001/workspace",
        playwrightAction: "locator.click()",
        result: "failed",
        stepId: "js-step-2",
        target: "#save",
        timeoutMs: 3000,
      },
    });
    resolveSelectorMock.mockImplementation((selector) =>
      unresolvedSelector(
        selector,
        "inspection-failed",
        `Playwright inspection failed for selector ${selector.selector}.`,
        {
          url: "http://localhost:3001/workspace",
          inspectionError: "browser blocked",
          debug: {
            cssSelector: selector.selector,
            inspectSource: "persistent-page",
            inspectionError: "browser blocked",
            pageUrl: "http://localhost:3001/workspace",
            phase: "pre-step",
            reason: `Playwright inspection failed for selector ${selector.selector}.`,
            result: "unresolved",
          },
        },
      ),
    );

    const result = await runGenerate(
      ["--debug-selectors", "--debug-selectors-json", debugPath, fixture.recordingPath],
      fixture.outputDir,
    );
    const debugOutput = await readFile(debugPath, "utf-8");

    expect(result.thrown).toBeUndefined();
    expect(result.logs).toContain("[taro][selector]");
    expect(result.logs).toContain("inspectSource=persistent-page");
    expect(result.logs).toContain("[taro][replay]");
    expect(result.logs).toContain("locatorSource=metadata.query");
    expect(debugOutput).toContain('"kind":"selector-resolution"');
    expect(debugOutput).toContain('"kind":"replay-attempt"');
  });

  it("skips step replay when the replay page is redirected away from the recorded URL", async () => {
    const fixture = await createRecordingFixture("selector-replay-redirected");
    const redirectedUrl =
      "http://localhost:3001/?redirect_url=http%3A%2F%2Flocalhost%3A3001%2Fdashboard%2Forgs%2Forganisation_01J19WTB4J3DZYD730T2K58KRF%2Fapps%2Fbusiness_01JCK47QRT925ZFTVZGJAVPQE7%3Ftab%3Dsales";

    openCapturePageMock.mockResolvedValue({
      browser: { close: vi.fn(async () => undefined) },
      page: {
        url: vi.fn(() => redirectedUrl),
      },
    });

    const result = await runGenerate([fixture.recordingPath], fixture.outputDir);
    const written = await readFile(
      deriveOutputPath(fixture.recordingPath),
      "utf-8",
    );

    expect(result.thrown).toBeUndefined();
    expect(result.warnings).toContain(
      "Step replay skipped: replay page did not reach the recorded URL. Expected http://localhost:3001/dashboard/orgs/organisation_01J19WTB4J3DZYD730T2K58KRF/apps/business_01JCK47QRT925ZFTVZGJAVPQE7?tab=sales, reached http://localhost:3001/?redirect_url=http%3A%2F%2Flocalhost%3A3001%2Fdashboard%2Forgs%2Forganisation_01J19WTB4J3DZYD730T2K58KRF%2Fapps%2Fbusiness_01JCK47QRT925ZFTVZGJAVPQE7%3Ftab%3Dsales.",
    );
    expect(result.warnings).toContain(
      "QRY-03 [js-step-13] unresolved selector div.css-19bb58m: Playwright replay page did not reach the recorded URL. Expected http://localhost:3001/dashboard/orgs/organisation_01J19WTB4J3DZYD730T2K58KRF/apps/business_01JCK47QRT925ZFTVZGJAVPQE7?tab=sales, reached http://localhost:3001/?redirect_url=http%3A%2F%2Flocalhost%3A3001%2Fdashboard%2Forgs%2Forganisation_01J19WTB4J3DZYD730T2K58KRF%2Fapps%2Fbusiness_01JCK47QRT925ZFTVZGJAVPQE7%3Ftab%3Dsales.",
    );
    expect(replayStepMock).not.toHaveBeenCalled();
    expect(written).toContain(
      "Playwright replay page did not reach the recorded URL.",
    );
  });

  it("emits browser-open debug traces when the step replay browser cannot start", async () => {
    const fixture = await createRecordingFixture("selector-debug-browser-open");
    openCapturePageMock.mockRejectedValue(new Error("browser blocked"));

    const result = await runGenerate(
      ["--debug-selectors", fixture.recordingPath],
      fixture.outputDir,
    );

    expect(result.thrown).toBeUndefined();
    expect(result.logs).toContain("[taro][replay-browser]");
    expect(result.logs).toContain('error="browser blocked"');
    expect(result.warnings).toContain(
      "Step replay browser failed: browser blocked. Selectors will remain unresolved.",
    );
  });

  it("uses recording text matches to select package context and recover a source render target", async () => {
    const fixture = await createProjectInlineJsFixture(
      "context-example",
      `/**
 * ${environmentUrlMarker}
 * ${environmentOptionsMarker} { "url": "http://localhost:3001/example" }
 */
const {screen} = require('@testing-library/dom')
const {default: userEvent} = require('@testing-library/user-event')
require('@testing-library/jest-dom')

test('Example flow', async () => {
  expect(location.href).toBe('http://localhost:3001/example')
  await userEvent.click(screen.getByRole('button', { name: 'Open Example Flow' }))
  await userEvent.dblClick(screen.getByRole('heading', { name: 'Review Example Flow' }))
  await userEvent.click(screen.getByRole('heading', { name: 'Review Example Flow' }))
})`,
    );
    const featureFlowPath = join(
      fixture.outputDir,
      "packages",
      "example-app",
      "src",
      "features",
      "FeatureFlow.tsx",
    );
    const outputPath = join(dirname(featureFlowPath), "FeatureFlow.test.tsx");
    await mkdir(dirname(featureFlowPath), { recursive: true });
    await writeFile(
      featureFlowPath,
      `
        export default function FeatureFlow() {
          return (
            <>
              <button>Open Example Flow</button>
              <h1>Review Example Flow</h1>
            </>
          )
        }
      `,
      "utf-8",
    );

    const exampleProfile = {
      ...structuredClone(defaultProfile),
      packagePath: "packages/example-app",
      packageName: "@repo/example-app",
      renderTargets: [],
      fixtureRoots: [
        {
          path: "@/test-support/mock-store",
          kind: "mock-store" as const,
          source: "import" as const,
        },
      ],
      mutationLifecycles: [
        {
          file: "packages/example-app/src/features/feature-flow.test.tsx",
          stages: ["success", "error"],
          evidence: ["mutation stages detected"],
        },
      ],
      interactionContracts: [
        {
          file: "packages/example-app/src/features/feature-flow.test.tsx",
          kind: "mutation-form" as const,
          states: ["failed-completion"] as const,
          supportTargets: ["@repo/data-client"],
          overrideStyle: "stable-handles" as const,
          confidence: "high" as const,
          evidence: ["mutation stages detected"],
        },
      ],
      effectiveRunner: "vitest" as const,
    };

    const packages = {
      ".": defaultProfile,
      "packages/example-app": exampleProfile,
    };
    loadOrBootstrapTaroStateMock.mockResolvedValue(
      createDefaultTaroState(packages),
    );
    resolveTaroPackageProfileMock.mockImplementation(
      createPackageResolver(packages as Record<string, typeof defaultProfile>),
    );

    const result = await runGenerate(
      [fixture.recordingPath],
      fixture.outputDir,
    );
    const written = await readFile(outputPath, "utf-8");

    expect(result.thrown).toBeUndefined();
    expect(result.errors).toBe("");
    expect(result.logs).toContain("Context matches:");
    expect(result.logs).toContain(
      "packages/example-app/src/features/FeatureFlow.tsx",
    );
    expect(result.logs).toContain(
      "Context-selected package profile packages/example-app: packages/example-app/src/features/FeatureFlow.tsx matched recording text evidence.",
    );
    expect(result.logs).toContain(
      "State profile: package=packages/example-app",
    );
    expect(result.logs).toContain("Created:");
    expect(result.logs).toContain(
      "packages/example-app/src/features/FeatureFlow.test.tsx",
    );
    expect(written).toContain("import FeatureFlow from './FeatureFlow'");
    expect(written).toContain("render(<FeatureFlow />)");
  });

  it("runs Playwright page confirmation before suite planning and uses confirmed landmarks to steer context matching", async () => {
    const fixture = await createProjectInlineJsFixture(
      "preflight-page-confirmation",
      `/**
 * ${environmentUrlMarker}
 * ${environmentOptionsMarker} { "url": "http://localhost:3001/example" }
 */
const {screen} = require('@testing-library/dom')
const {default: userEvent} = require('@testing-library/user-event')
require('@testing-library/jest-dom')

test('Example flow', async () => {
  expect(location.href).toBe('http://localhost:3001/example')
  await userEvent.click(screen.getByRole('button', { name: 'Open Example Flow' }))
  await userEvent.click(screen.getByText('General feature details'))
  await userEvent.click(screen.getByText('Primary identifier'))
})`,
    );
    const featureFlowPath = join(
      fixture.outputDir,
      "packages",
      "example-app",
      "src",
      "features",
      "FeatureFlow.tsx",
    );
    const alternateFeaturePath = join(
      fixture.outputDir,
      "src",
      "alternate-feature",
      "AlternateFeature.tsx",
    );
    const outputPath = join(dirname(featureFlowPath), "FeatureFlow.test.tsx");
    await mkdir(dirname(featureFlowPath), { recursive: true });
    await mkdir(dirname(alternateFeaturePath), { recursive: true });
    await writeFile(
      featureFlowPath,
      `
        export default function FeatureFlow() {
          return (
            <>
              <button>Open Example Flow</button>
              <h1>Review Example Flow</h1>
            </>
          )
        }
      `,
      "utf-8",
    );
    await writeFile(
      alternateFeaturePath,
      `
        export default function AlternateFeature() {
          return (
            <>
              <h1>General feature details</h1>
              <p>Primary identifier</p>
            </>
          )
        }
      `,
      "utf-8",
    );
    captureVisualStateMock.mockResolvedValue({
      capturedAt: new Date().toISOString(),
      dialog: null,
      element: null,
      finalUrl: "http://localhost:3001/example",
      matchedLandmarks: ["Open Example Flow"],
      pageTitle: "DigiTax",
      reason: "landmark-confirmation",
      status: "captured",
      url: "http://localhost:3001/example",
      warnings: [],
    });

    const exampleProfile = {
      ...structuredClone(defaultProfile),
      packagePath: "packages/example-app",
      packageName: "@repo/example-app",
      renderTargets: [],
      effectiveRunner: "vitest" as const,
    };

    const packages = {
      ".": defaultProfile,
      "packages/example-app": exampleProfile,
    };
    loadOrBootstrapTaroStateMock.mockResolvedValue(
      createDefaultTaroState(packages),
    );
    resolveTaroPackageProfileMock.mockImplementation(
      createPackageResolver(packages as Record<string, typeof defaultProfile>),
    );

    const result = await runGenerate(
      [fixture.recordingPath],
      fixture.outputDir,
    );
    const createdPath = result.logs.match(/Created: (.+\.test\.tsx)/)?.[1];

    expect(result.thrown).toBeUndefined();
    expect(result.logs).toContain("Page-confirmed context: Open Example Flow");
    expect(result.logs).toContain(
      "packages/example-app/src/features/FeatureFlow.tsx",
    );
    expect(result.logs).toContain(
      "Context-selected package profile packages/example-app: packages/example-app/src/features/FeatureFlow.tsx matched recording text evidence.",
    );
    expect(createdPath?.replace(/^\/private(?=\/var\/)/, "")).toBe(
      outputPath.replace(/^\/private(?=\/var\/)/, ""),
    );
    expect(captureVisualStateMock.mock.invocationCallOrder[0]).toBeLessThan(
      planJsSuiteMock.mock.invocationCallOrder[0],
    );
    const written = await readFile(createdPath!, "utf-8");
    expect(written).toContain("import FeatureFlow from './FeatureFlow'");
  });

  it("reuses learned central boundary support for imported collaborator modules", async () => {
    const fixture = await createProjectInlineJsFixture(
      "boundary-support-reuse",
      `/**
 * ${environmentUrlMarker}
 * ${environmentOptionsMarker} { "url": "http://localhost:3001/example" }
 */
const {screen} = require('@testing-library/dom')
const {default: userEvent} = require('@testing-library/user-event')
require('@testing-library/jest-dom')

test('Example flow', async () => {
  expect(location.href).toBe('http://localhost:3001/example')
  await userEvent.click(screen.getByRole('button', { name: 'Open Example Flow' }))
  await userEvent.click(screen.getByRole('heading', { name: 'Review Example Flow' }))
})`,
    );
    const featureFlowPath = join(
      fixture.outputDir,
      "packages",
      "example-app",
      "src",
      "features",
      "FeatureFlow.tsx",
    );
    const outputPath = join(dirname(featureFlowPath), "FeatureFlow.test.tsx");
    await mkdir(dirname(featureFlowPath), { recursive: true });
    await writeFile(
      featureFlowPath,
      `
        import { useCreateOrderMutation, useOrdersQuery } from '@/features/orders/api'

        export default function FeatureFlow() {
          useOrdersQuery()
          useCreateOrderMutation()

          return (
            <>
              <button>Open Example Flow</button>
              <h1>Review Example Flow</h1>
            </>
          )
        }
      `,
      "utf-8",
    );

    const exampleProfile = {
      ...structuredClone(defaultProfile),
      packagePath: "packages/example-app",
      packageName: "@repo/example-app",
      effectiveRunner: "vitest" as const,
      boundaryProfiles: [
        {
          target: "@/features/orders/api",
          kind: "data-module" as const,
          strategy: "shared-module-factory" as const,
          guardrailReason: null,
          supportImportPath: "@/tests/mocks/orders-api",
          supportPath: "packages/example-app/src/tests/mocks/orders-api.ts",
          supportExports: {
            factoryExport: "createOrdersApiMock",
            resetExport: "resetOrdersApiMock",
            overrideExports: ["useCreateOrderMutationMock"],
            spyExports: [],
            fixtureExports: [],
          },
          payloadSource: "fixtures" as const,
          confidence: "high" as const,
          files: ["packages/example-app/src/features/feature-flow.test.tsx"],
          evidence: [
            "packages/example-app/src/features/feature-flow.test.tsx: mock target @/features/orders/api",
          ],
          conflictTargets: [],
          lowConfidenceScaffold: false,
        },
      ],
    };

    const packages = {
      ".": defaultProfile,
      "packages/example-app": exampleProfile,
    };
    loadOrBootstrapTaroStateMock.mockResolvedValue(
      createDefaultTaroState(packages),
    );
    resolveTaroPackageProfileMock.mockImplementation(
      createPackageResolver(packages as Record<string, typeof defaultProfile>),
    );

    const result = await runGenerate(
      [fixture.recordingPath],
      fixture.outputDir,
    );
    const written = await readFile(outputPath, "utf-8");

    expect(result.thrown).toBeUndefined();
    expect(result.warnings).not.toContain(
      "Scaffolded central boundary support",
    );
    expect(written).toContain(
      "import { createOrdersApiMock, resetOrdersApiMock } from '@/tests/mocks/orders-api'",
    );
    expect(written).toContain(
      "vi.mock('@/features/orders/api', async (importOriginal) => {",
    );
    expect(written).toContain("return { ...actual, ...createOrdersApiMock() }");
    expect(written).toContain("beforeEach(() => {");
    expect(written).toContain("resetOrdersApiMock()");
    expect(written).not.toContain("createOrdersApiMockMock");
  });

  it("keeps repo-owned UI wrappers real even when state tries to learn them as shared mocks", async () => {
    const fixture = await createProjectInlineJsFixture(
      "boundary-support-ui-guardrail",
      `/**
 * ${environmentUrlMarker}
 * ${environmentOptionsMarker} { "url": "http://localhost:3001/example" }
 */
const {screen} = require('@testing-library/dom')
const {default: userEvent} = require('@testing-library/user-event')
require('@testing-library/jest-dom')

test('Example flow', async () => {
  expect(location.href).toBe('http://localhost:3001/example')
  await userEvent.click(screen.getByRole('button', { name: 'Open Example Flow' }))
  await userEvent.click(screen.getByRole('heading', { name: 'Review Example Flow' }))
})`,
    );
    const featureFlowPath = join(
      fixture.outputDir,
      "packages",
      "example-app",
      "src",
      "features",
      "FeatureFlow.tsx",
    );
    const outputPath = join(dirname(featureFlowPath), "FeatureFlow.test.tsx");
    await mkdir(dirname(featureFlowPath), { recursive: true });
    await writeFile(
      featureFlowPath,
      `
        import { useCreateOrderMutation, useOrdersQuery } from '@/features/orders/api'
        import { Dialog, DialogContent } from '@/components/library/Modal'

        export default function FeatureFlow() {
          useOrdersQuery()
          useCreateOrderMutation()

          return (
            <Dialog open>
              <DialogContent title="Review Example Flow">
                <button>Open Example Flow</button>
                <h1>Review Example Flow</h1>
              </DialogContent>
            </Dialog>
          )
        }
      `,
      "utf-8",
    );

    const exampleProfile = {
      ...structuredClone(defaultProfile),
      packagePath: "packages/example-app",
      packageName: "@repo/example-app",
      effectiveRunner: "vitest" as const,
      boundaryProfiles: [
        {
          target: "@/features/orders/api",
          kind: "data-module" as const,
          strategy: "shared-module-factory" as const,
          guardrailReason: null,
          supportImportPath: "@/tests/mocks/orders-api",
          supportPath: "packages/example-app/src/tests/mocks/orders-api.ts",
          supportExports: {
            factoryExport: "createOrdersApiMock",
            resetExport: "resetOrdersApiMock",
            overrideExports: ["useCreateOrderMutationMock"],
            spyExports: [],
            fixtureExports: [],
          },
          payloadSource: "fixtures" as const,
          confidence: "high" as const,
          files: ["packages/example-app/src/features/feature-flow.test.tsx"],
          evidence: [
            "packages/example-app/src/features/feature-flow.test.tsx: mock target @/features/orders/api",
          ],
          conflictTargets: [],
          lowConfidenceScaffold: false,
        },
        {
          target: "@/components/library/Modal",
          kind: "local-child" as const,
          strategy: "shared-module-factory" as const,
          guardrailReason: null,
          supportImportPath: "@/tests/mocks/modal",
          supportPath: "packages/example-app/src/tests/mocks/modal.ts",
          supportExports: {
            factoryExport: "createModalMock",
            resetExport: "resetModalMock",
            overrideExports: [],
            spyExports: [],
            fixtureExports: [],
          },
          payloadSource: "typed-defaults" as const,
          confidence: "high" as const,
          files: ["packages/example-app/src/features/feature-flow.test.tsx"],
          evidence: [
            "packages/example-app/src/features/feature-flow.test.tsx: mock target @/components/library/Modal",
          ],
          conflictTargets: [],
          lowConfidenceScaffold: false,
        },
      ],
    };

    const packages = {
      ".": defaultProfile,
      "packages/example-app": exampleProfile,
    };
    loadOrBootstrapTaroStateMock.mockResolvedValue(
      createDefaultTaroState(packages),
    );
    resolveTaroPackageProfileMock.mockImplementation(
      createPackageResolver(packages as Record<string, typeof defaultProfile>),
    );

    const result = await runGenerate(
      [fixture.recordingPath],
      fixture.outputDir,
    );
    const written = await readFile(outputPath, "utf-8");

    expect(result.thrown).toBeUndefined();
    expect(written).toContain(
      "vi.mock('@/features/orders/api', async (importOriginal) => {",
    );
    expect(written).not.toContain("vi.mock('@/components/library/Modal'");
    expect(written).not.toContain("createModalMock");
    expect(written).toContain(
      "Keeping @/components/library/Modal real at test time because it is a repo-owned-ui-wrapper",
    );
    expect(result.warnings).toContain(
      "Keeping @/components/library/Modal real at test time because it is a repo-owned-ui-wrapper",
    );
    expect(result.warnings).toContain("Manual review required");
  });

  it("scaffolds central boundary support when no learned collaborator profile exists", async () => {
    const fixture = await createProjectInlineJsFixture(
      "boundary-support-scaffold",
      `/**
 * ${environmentUrlMarker}
 * ${environmentOptionsMarker} { "url": "http://localhost:3001/example" }
 */
const {screen} = require('@testing-library/dom')
const {default: userEvent} = require('@testing-library/user-event')
require('@testing-library/jest-dom')

test('Example flow', async () => {
  expect(location.href).toBe('http://localhost:3001/example')
  await userEvent.click(screen.getByRole('button', { name: 'Open Example Flow' }))
  await userEvent.click(screen.getByRole('heading', { name: 'Review Example Flow' }))
})`,
    );
    const featureFlowPath = join(
      fixture.outputDir,
      "packages",
      "example-app",
      "src",
      "features",
      "FeatureFlow.tsx",
    );
    const outputPath = join(dirname(featureFlowPath), "FeatureFlow.test.tsx");
    const supportPath = join(
      fixture.outputDir,
      "packages",
      "example-app",
      "src",
      "tests",
      "mocks",
      "features-orders-api.mock.ts",
    );
    await mkdir(dirname(featureFlowPath), { recursive: true });
    await writeFile(
      featureFlowPath,
      `
        import { useCreateOrderMutation, useOrdersQuery } from '@/features/orders/api'

        export default function FeatureFlow() {
          useOrdersQuery()
          useCreateOrderMutation()

          return (
            <>
              <button>Open Example Flow</button>
              <h1>Review Example Flow</h1>
            </>
          )
        }
      `,
      "utf-8",
    );

    const exampleProfile = {
      ...structuredClone(defaultProfile),
      packagePath: "packages/example-app",
      packageName: "@repo/example-app",
      effectiveRunner: "vitest" as const,
      fixtureRoots: [
        {
          path: "packages/example-app/src/tests/mocks",
          kind: "mocks" as const,
          source: "directory" as const,
        },
      ],
    };

    const packages = {
      ".": defaultProfile,
      "packages/example-app": exampleProfile,
    };
    loadOrBootstrapTaroStateMock.mockResolvedValue(
      createDefaultTaroState(packages),
    );
    resolveTaroPackageProfileMock.mockImplementation(
      createPackageResolver(packages as Record<string, typeof defaultProfile>),
    );

    const result = await runGenerate(
      [fixture.recordingPath],
      fixture.outputDir,
    );
    const written = await readFile(outputPath, "utf-8");
    const scaffold = await readFile(supportPath, "utf-8");

    expect(result.thrown).toBeUndefined();
    expect(result.warnings).toContain(
      "Scaffolded central boundary support for @/features/orders/api",
    );
    expect(result.warnings).toContain("Manual review required");
    expect(written).toContain(
      "import { createFeaturesOrdersApiMock, resetFeaturesOrdersApiMock } from '../tests/mocks/features-orders-api.mock'",
    );
    expect(written).toContain(
      "vi.mock('@/features/orders/api', async (importOriginal) => {",
    );
    expect(written).toContain(
      "return { ...actual, ...createFeaturesOrdersApiMock() }",
    );
    expect(written).not.toContain("useOrdersQuery:");
    expect(scaffold).toContain(
      "export const useCreateOrderMutationMock = vi.fn",
    );
    expect(scaffold).toContain("export const useOrdersQueryMock = vi.fn");
    expect(scaffold).not.toContain("vi.fn(defaultUseCreateOrderMutationImpl)");
    expect(scaffold).not.toContain("vi.fn(defaultUseOrdersQueryImpl)");
    expect(scaffold).toContain(
      "useCreateOrderMutationMock.mockImplementation(defaultUseCreateOrderMutationImpl)",
    );
    expect(scaffold).toContain(
      "useOrdersQueryMock.mockImplementation(defaultUseOrdersQueryImpl)",
    );
    expect(scaffold).toContain("export function createFeaturesOrdersApiMock()");
    expect(scaffold).toContain("export function resetFeaturesOrdersApiMock()");
  });

  it("keeps selector degradation explicit when recorder JS has no URL evidence", async () => {
    const fixture = await createRecordingFixture("no-url", (source) =>
      source
        .replace(new RegExp(`^ \\* ${environmentOptionsMarker} .*$`, "m"), "")
        .replace(
          /^ {2}expect\(location\.href\)\.toBe\('http:\/\/localhost:3001[^']*'\)\n/m,
          "",
        ),
    );
    const outputPath = deriveOutputPath(fixture.recordingPath);

    const result = await runGenerate(
      [fixture.recordingPath],
      fixture.outputDir,
    );
    const written = await readFile(outputPath, "utf-8");

    expect(result.thrown).toBeUndefined();
    expect(result.errors).toBe("");
    expect(result.logs).toContain(`Created: ${outputPath}`);
    expect(written).toContain(`// selector: ${accessibleSelector}`);
    expect(written).toContain(
      `// reason: No recorded URL is available to inspect selector ${accessibleSelector}.`,
    );
    expect(result.warnings).toContain(
      `No recorded URL is available to inspect selector ${accessibleSelector}.`,
    );
    expect(written).not.toContain("screen.getByTestId(");
  });

  it("reports preserved markers separately and keeps proof dblClick gestures out of generated user actions", async () => {
    const fixture = await createInlineJsFixture(
      "semantic-marker",
      `/**
 * ${environmentUrlMarker}
 * ${environmentOptionsMarker} { "url": "http://localhost:3001/example" }
 */
const {screen} = require('@testing-library/dom')
const {default: userEvent} = require('@testing-library/user-event')
require('@testing-library/jest-dom')

test('Semantic marker flow', async () => {
  expect(location.href).toBe('http://localhost:3001/example')
  await userEvent.dblClick(screen.getByRole('heading', { name: 'Starting state' }))
  await userEvent.click(screen.getByRole('button', { name: 'Save' }))
  await userEvent.dblClick(screen.getByRole('heading', { name: 'Review Example' }))
  await userEvent.click(screen.getByRole('heading', { name: 'Review Example' }))
})`,
    );
    const outputPath = deriveOutputPath(fixture.recordingPath);

    const result = await runGenerate(
      [fixture.recordingPath],
      fixture.outputDir,
    );
    const written = await readFile(outputPath, "utf-8");

    expect(result.thrown).toBeUndefined();
    expect(result.errors).toBe("");
    expect(result.logs).toContain(
      "Recording cleanup: 1 redundant click(s), 1 preserved semantic marker(s), 1 unresolved semantic marker(s)",
    );
    expect(result.logs).toContain(
      "markers: detected=2, emitted=1, unresolved=1",
    );
    expect(result.logs).toContain("[taro] Marker coverage:");
    expect(result.logs).toContain(
      "QUAL-02 gate: WARN (markers-partially-converted)",
    );
    expect(result.warnings).toContain(
      "Manual review required — this generated test is still a draft",
    );
    expect(countOccurrences(result.warnings, "MKR-03 unresolved-marker")).toBe(
      1,
    );
    expect(result.warnings).toMatch(
      /MKR-03 unresolved-marker marker=js-step-\d+ line: \d+ reason=[a-z-]+ detail="[^"]+" hint="[^"]+"/,
    );
    expect(result.logs).toContain(`Created: ${outputPath}`);
    expect(written).toContain(
      "await user.click(screen.getByRole('button', { name: 'Save' }))",
    );
    expect(written).toContain(
      "expect(await screen.findByRole('heading', { name: 'Review Example' })).toBeVisible()",
    );
    expect(written).not.toContain(
      "await user.click(screen.getByRole('heading', { name: 'Review Example' }))",
    );
    expect(written).not.toContain(
      "await user.click(screen.getByRole('heading', { name: 'Starting state' }))",
    );
    expect(written).not.toContain("dblClick");
  });

  it("keeps explicit boundary-draft output when repo render target evidence is missing", async () => {
    const fixture = await createRecordingFixture("boundary-draft");
    const outputPath = deriveOutputPath(fixture.recordingPath);

    const result = await runGenerate(
      [fixture.recordingPath],
      fixture.outputDir,
    );
    const written = await readFile(outputPath, "utf-8");

    expect(result.thrown).toBeUndefined();
    expect(written).toContain(
      "// taro-boundary-warning: Taro could not resolve the exact render target from repo context; generated output should be treated as a boundary draft.",
    );
    expect(written).toContain("render(<App />)");
    expect(written).not.toContain("import FeatureFlow from './FeatureFlow'");
  });

  it("falls back to direct it-groups when suite planning returns null", async () => {
    const fixture = await createRecordingFixture("null-suite-plan");
    const outputPath = deriveOutputPath(fixture.recordingPath);
    planJsSuiteMock.mockImplementationOnce(() => null as never);

    const result = await runGenerate(
      [fixture.recordingPath],
      fixture.outputDir,
    );
    const written = await readFile(outputPath, "utf-8");

    expect(result.thrown).toBeUndefined();
    expect(result.errors).toBe("");
    expect(result.logs).toContain(`Created: ${outputPath}`);
    expect(result.logs).not.toContain("Contract planner:");
    expect(written).toContain("describe(");
    expect(written).toContain("render(<App />)");
  });

  it("injects and reports boundary policy warnings for forbidden mocked collaborators", async () => {
    const fixture = await createProjectInlineJsFixture(
      "boundary-policy-warning",
      `/**
 * ${environmentUrlMarker}
 * ${environmentOptionsMarker} { "url": "http://localhost:3001/example" }
 */
const {screen} = require('@testing-library/dom')
const {default: userEvent} = require('@testing-library/user-event')
require('@testing-library/jest-dom')

test('Example flow', async () => {
  expect(location.href).toBe('http://localhost:3001/example')
  await userEvent.click(screen.getByRole('button', { name: 'Open Example Flow' }))
  await userEvent.click(screen.getByRole('heading', { name: 'Review Example Flow' }))
})`,
    );
    const featureFlowPath = join(
      fixture.outputDir,
      "packages",
      "example-app",
      "src",
      "features",
      "FeatureFlow.tsx",
    );
    const outputPath = join(dirname(featureFlowPath), "FeatureFlow.test.tsx");
    await mkdir(dirname(featureFlowPath), { recursive: true });
    await writeFile(
      featureFlowPath,
      `
        import { useCreateOrderMutation, useOrdersQuery } from '@/features/orders/api'

        export default function FeatureFlow() {
          useOrdersQuery()
          useCreateOrderMutation()

          return (
            <>
              <button>Open Example Flow</button>
              <h1>Review Example Flow</h1>
            </>
          )
        }
      `,
      "utf-8",
    );

    const exampleProfile = {
      ...structuredClone(defaultProfile),
      packagePath: "packages/example-app",
      packageName: "@repo/example-app",
      effectiveRunner: "vitest" as const,
      forbidMocks: ["@/features/orders/api"],
      boundaryProfiles: [
        {
          target: "@/features/orders/api",
          kind: "data-module" as const,
          strategy: "shared-module-factory" as const,
          guardrailReason: null,
          supportImportPath: "@/tests/mocks/orders-api",
          supportPath: "packages/example-app/src/tests/mocks/orders-api.ts",
          supportExports: {
            factoryExport: "createOrdersApiMock",
            resetExport: "resetOrdersApiMock",
            overrideExports: ["useCreateOrderMutationMock"],
            spyExports: [],
            fixtureExports: [],
          },
          payloadSource: "fixtures" as const,
          confidence: "high" as const,
          files: ["packages/example-app/src/features/feature-flow.test.tsx"],
          evidence: [
            "packages/example-app/src/features/feature-flow.test.tsx: mock target @/features/orders/api",
          ],
          conflictTargets: [],
          lowConfidenceScaffold: false,
        },
      ],
    };

    const packages = {
      ".": defaultProfile,
      "packages/example-app": exampleProfile,
    };
    loadOrBootstrapTaroStateMock.mockResolvedValue(
      createDefaultTaroState(packages),
    );
    resolveTaroPackageProfileMock.mockImplementation(
      createPackageResolver(packages as Record<string, typeof defaultProfile>),
    );

    const result = await runGenerate(
      [fixture.recordingPath],
      fixture.outputDir,
    );
    const written = await readFile(outputPath, "utf-8");

    expect(result.thrown).toBeUndefined();
    expect(result.errors).toBe("");
    expect(written).toContain(
      `// taro-boundary-warning: Generated test mocks forbidden boundary target "@/features/orders/api".`,
    );
    expect(result.warnings).toContain(
      `Boundary policy: Generated test mocks forbidden boundary target "@/features/orders/api".`,
    );
  });

  it("refreshes stale package state before generation and reports the reason", async () => {
    const fixture = await createRecordingFixture("stale-profile");
    detectPackageProfileStalenessMock.mockResolvedValue({
      stale: true,
      reason:
        "packages/example-app/src/feature-flow.test.tsx changed after the package profile was scanned.",
      latestEvidencePath: "src/example.test.tsx",
    });

    const result = await runGenerate(
      [fixture.recordingPath],
      fixture.outputDir,
    );

    expect(result.thrown).toBeUndefined();
    expect(result.logs).toContain(
      "Detected stale package profile .; refreshing before generation.",
    );
    expect(result.warnings).toContain(
      "packages/example-app/src/feature-flow.test.tsx changed after the package profile was scanned.",
    );
  });

  it("skips screenshot artifacts but still runs Playwright page confirmation when --no-screenshots is provided", async () => {
    const fixture = await createRecordingFixture("skip-visuals");

    const result = await runGenerate(
      ["--no-screenshots", fixture.recordingPath],
      fixture.outputDir,
    );

    expect(result.thrown).toBeUndefined();
    expect(result.logs).toContain(
      "Screenshot artifacts skipped (--no-screenshots); Playwright page confirmation still ran.",
    );
    expect(captureVisualStateMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        screenshotDir: undefined,
      }),
    );
  });

  it("reports Playwright visual capture failures and continues generation", async () => {
    const fixture = await createRecordingFixture("mcp-visuals");
    captureVisualStateMock.mockResolvedValue({
      capturedAt: new Date().toISOString(),
      dialog: null,
      element: null,
      finalUrl: "http://localhost:3001/dashboard",
      pageTitle: "",
      reason: "dialog-state",
      selector: "#save",
      status: "capture-failed",
      url: "http://localhost:3001/dashboard",
      warnings: [
        "Playwright visual capture failed. browser executable is missing.",
      ],
    });

    const result = await runGenerate(
      [fixture.recordingPath],
      fixture.outputDir,
    );

    expect(result.thrown).toBeUndefined();
    expect(result.warnings).toContain(
      "Playwright visual capture failed. browser executable is missing.",
    );
    expect(result.exitCode).toBe(0);
  });

  it("persists explicit storageState auth and forwards it to visual capture", async () => {
    const fixture = await createRecordingFixture("persist-visual-auth");
    const authDir = join(fixture.outputDir, "playwright", ".auth");
    const authPath = join(authDir, "user.json");
    await mkdir(authDir, { recursive: true });
    await writeFile(authPath, '{"cookies":[],"origins":[]}', "utf-8");

    const result = await runGenerate(
      ["--auth", authPath, fixture.recordingPath],
      fixture.outputDir,
    );
    const stateModule = await import("#core/state.ts");

    expect(result.thrown).toBeUndefined();
    expect(result.logs).toContain(
      "Persisted visual auth for package .: storageState=playwright/.auth/user.json",
    );
    expect(
      vi.mocked(stateModule.persistPlaywrightAuthProfile),
    ).toHaveBeenCalledWith(
      expect.stringMatching(/persist-visual-auth-.*\/project$/),
      ".",
      expect.objectContaining({
        detectedAt: "generate",
        path: "playwright/.auth/user.json",
        source: "manual",
        strategy: "storageState",
      }),
    );
    expect(captureVisualStateMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        auth: {
          path: expect.stringMatching(/playwright\/\.auth\/user\.json$/),
          strategy: "storageState",
        },
      }),
    );
  });

  it("fails fast in non-interactive runs when visual capture reports an auth interrupt", async () => {
    const fixture = await createRecordingFixture("auth-interrupt");
    resolveTaroPackageProfileMock.mockImplementation(() => ({
      ...structuredClone(defaultProfile),
      playwrightAuth: {
        strategy: "storageState",
        path: "playwright/.auth/user.json",
        detectedAt: "init",
        source: "detected",
      },
    }));
    captureVisualStateMock.mockResolvedValue({
      capturedAt: new Date().toISOString(),
      dialog: null,
      element: null,
      finalUrl: "http://localhost:3001/login",
      interrupt: {
        kind: "auth-required",
        actualTitle: "Sign In",
        expectedTitle: "DigiTax",
        expectedUrl: "http://localhost:3001/dashboard",
        path: "/tmp/playwright/.auth/user.json",
        reachedUrl: "http://localhost:3001/login",
        signals: ["auth-route", "route-mismatch", "expected-selector-missing"],
        strategy: "storageState",
      },
      pageTitle: "Sign In",
      reason: "dialog-state",
      screenshotPath: "/tmp/taro-login.png",
      selector: "#save",
      status: "auth-interrupted",
      url: "http://localhost:3001/dashboard",
      warnings: [
        "Authentication required before visual capture could reach http://localhost:3001/dashboard.",
      ],
    });

    const result = await runGenerate(
      [fixture.recordingPath],
      fixture.outputDir,
    );

    expect(result.thrown).toBeUndefined();
    expect(result.logs).toContain(
      "Visual auth: storageState=playwright/.auth/user.json (detected)",
    );
    expect(result.logs).toContain(
      "Auth checkpoint screenshot: /tmp/taro-login.png",
    );
    expect(result.warnings).toContain(
      "Visual context unavailable: authentication required before reaching the target UI.",
    );
    expect(result.warnings).toContain(
      "Reuse or replace the saved storage state with --auth /tmp/playwright/.auth/user.json.",
    );
    expect(result.errors).toBe("");
    expect(result.exitCode).toBe(0);
  });

  it("persists recovered MCP auth in interactive runs and continues generation", async () => {
    const fixture = await createRecordingFixture("auth-recovered");
    captureVisualStateMock.mockResolvedValue({
      authRecovery: {
        completedAt: new Date().toISOString(),
        persistedAuthPath: ".taro/playwright/.auth/user.json",
        retryToExpectedUrl: {
          attempted: true,
          completedAt: new Date().toISOString(),
          outcome: "succeeded",
          targetUrl: "http://localhost:3001/dashboard",
        },
        startedAt: new Date().toISOString(),
        status: "succeeded",
        timeoutMs: 300000,
      },
      capturedAt: new Date().toISOString(),
      dialog: null,
      element: null,
      finalUrl: "http://localhost:3001/dashboard",
      interrupt: {
        kind: "auth-required",
        actualTitle: "Sign In",
        expectedTitle: "DigiTax",
        expectedUrl: "http://localhost:3001/dashboard",
        reachedUrl: "http://localhost:3001/login",
        signals: ["auth-route", "route-mismatch"],
        strategy: "instructions",
      },
      pageTitle: "DigiTax",
      reason: "dialog-state",
      screenshotPath: "/tmp/taro-dashboard.png",
      selector: "#save",
      status: "auth-recovered",
      url: "http://localhost:3001/dashboard",
      warnings: [],
    });

    const result = await runGenerate(
      [fixture.recordingPath],
      fixture.outputDir,
      {
        input: { isTTY: true },
        output: { isTTY: true },
      },
    );
    const stateModule = await import("#core/state.ts");

    expect(result.thrown).toBeUndefined();
    expect(result.errors).toBe("");
    expect(result.logs).toContain(
      "Visual auth recovered via Playwright runtime.",
    );
    expect(result.logs).toContain(
      "Retried recorded URL once after auth recovery: http://localhost:3001/dashboard",
    );
    expect(result.logs).toContain(
      "Saved Playwright storageState: .taro/playwright/.auth/user.json",
    );
    expect(result.logs).toContain(
      "Persisted visual auth for package .: storageState=.taro/playwright/.auth/user.json",
    );
    expect(
      vi.mocked(stateModule.persistPlaywrightAuthProfile),
    ).toHaveBeenCalledWith(
      expect.any(String),
      ".",
      expect.objectContaining({
        strategy: "storageState",
        path: ".taro/playwright/.auth/user.json",
        detectedAt: "generate",
        source: "manual",
      }),
    );
  });

  it("treats --interactive-auth as an interactive run for auth recovery", async () => {
    const fixture = await createRecordingFixture("forced-interactive-auth");
    captureVisualStateMock.mockResolvedValue({
      authRecovery: {
        completedAt: new Date().toISOString(),
        persistedAuthPath: ".taro/playwright/.auth/user.json",
        retryToExpectedUrl: {
          attempted: true,
          completedAt: new Date().toISOString(),
          outcome: "succeeded",
          targetUrl: "http://localhost:3001/dashboard",
        },
        startedAt: new Date().toISOString(),
        status: "succeeded",
        timeoutMs: 300000,
      },
      capturedAt: new Date().toISOString(),
      dialog: null,
      element: null,
      finalUrl: "http://localhost:3001/dashboard",
      interrupt: {
        kind: "auth-required",
        actualTitle: "Sign In",
        expectedTitle: "DigiTax",
        expectedUrl: "http://localhost:3001/dashboard",
        reachedUrl: "http://localhost:3001/login",
        signals: ["auth-route", "route-mismatch"],
        strategy: "instructions",
      },
      pageTitle: "DigiTax",
      reason: "dialog-state",
      screenshotPath: "/tmp/taro-dashboard.png",
      selector: "#save",
      status: "auth-recovered",
      url: "http://localhost:3001/dashboard",
      warnings: [],
    });

    const result = await runGenerate(
      ["--interactive-auth", fixture.recordingPath],
      fixture.outputDir,
    );
    const stateModule = await import("#core/state.ts");

    expect(result.thrown).toBeUndefined();
    expect(result.errors).toBe("");
    expect(result.logs).toContain(
      "Visual auth recovered via Playwright runtime.",
    );
    expect(result.logs).toContain(
      "Retried recorded URL once after auth recovery: http://localhost:3001/dashboard",
    );
    expect(result.logs).toContain(
      "Saved Playwright storageState: .taro/playwright/.auth/user.json",
    );
    expect(
      vi.mocked(stateModule.persistPlaywrightAuthProfile),
    ).toHaveBeenCalledWith(
      expect.any(String),
      ".",
      expect.objectContaining({
        strategy: "storageState",
        path: ".taro/playwright/.auth/user.json",
        detectedAt: "generate",
        source: "manual",
      }),
    );
    expect(captureVisualStateMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        authRecovery: expect.objectContaining({
          enabled: true,
        }),
      }),
    );
  });

  it("prints auth instructions when MCP recovery times out and stops generation", async () => {
    const fixture = await createRecordingFixture("auth-timeout");
    captureVisualStateMock.mockResolvedValue({
      authRecovery: {
        completedAt: new Date().toISOString(),
        instructionsPath: "instructions/auth.md",
        persistedAuthPath: ".taro/playwright/.auth/user.json",
        retryToExpectedUrl: {
          attempted: true,
          completedAt: new Date().toISOString(),
          error: "page.goto: Timeout 3000ms exceeded.",
          outcome: "failed",
          targetUrl: "http://localhost:3001/dashboard",
        },
        startedAt: new Date().toISOString(),
        status: "timed-out",
        timeoutMs: 300000,
      },
      capturedAt: new Date().toISOString(),
      dialog: null,
      element: null,
      finalUrl: "http://localhost:3001/login",
      interrupt: {
        kind: "auth-required",
        actualTitle: "Sign In",
        expectedTitle: "DigiTax",
        expectedUrl: "http://localhost:3001/dashboard",
        reachedUrl: "http://localhost:3001/login",
        signals: ["auth-route", "route-mismatch"],
        strategy: "instructions",
      },
      pageTitle: "Sign In",
      reason: "dialog-state",
      screenshotPath: "/tmp/taro-login-timeout.png",
      selector: "#save",
      status: "auth-recovery-timed-out",
      url: "http://localhost:3001/dashboard",
      warnings: ["Timed out waiting 300s for manual authentication."],
    });

    const result = await runGenerate(
      [fixture.recordingPath],
      fixture.outputDir,
      {
        input: { isTTY: true },
        output: { isTTY: true },
      },
    );

    expect(result.thrown).toBeUndefined();
    expect(result.warnings).toContain("Playwright authentication timed out.");
    expect(result.warnings).toContain(
      "Visual auth instructions: instructions/auth.md",
    );
    expect(result.warnings).toContain(
      "Retried recorded URL once after auth recovery: http://localhost:3001/dashboard (page.goto: Timeout 3000ms exceeded.)",
    );
    expect(result.warnings).toContain(
      "Saved Playwright storageState: .taro/playwright/.auth/user.json",
    );
    expect(result.warnings).toContain(
      "Timed out waiting 300s for manual authentication.",
    );
    expect(result.errors).toBe("");
    expect(result.exitCode).toBe(0);
  });

  it("reuses a saved storageState even when auth recovery timed out before full page confirmation", async () => {
    const fixture = await createRecordingFixture("auth-timeout-reuses-storage");
    captureVisualStateMock.mockResolvedValue({
      authRecovery: {
        completedAt: new Date().toISOString(),
        persistedAuthPath: ".taro/playwright/.auth/user.json",
        retryToExpectedUrl: {
          attempted: true,
          completedAt: new Date().toISOString(),
          outcome: "succeeded",
          targetUrl: "http://localhost:3001/dashboard",
        },
        startedAt: new Date().toISOString(),
        status: "timed-out",
        timeoutMs: 300000,
      },
      capturedAt: new Date().toISOString(),
      dialog: null,
      element: null,
      finalUrl: "http://localhost:3001/",
      interrupt: {
        kind: "auth-required",
        actualTitle: "Sign In",
        expectedTitle: "DigiTax",
        expectedUrl: "http://localhost:3001/dashboard",
        reachedUrl: "http://localhost:3001/login",
        signals: ["route-mismatch"],
        strategy: "instructions",
      },
      pageTitle: "DigiTax",
      reason: "dialog-state",
      screenshotPath: "/tmp/taro-login-timeout.png",
      selector: "#save",
      status: "auth-recovery-timed-out",
      url: "http://localhost:3001/dashboard",
      warnings: ["Timed out waiting 300s for manual authentication."],
    });

    const result = await runGenerate(
      [fixture.recordingPath],
      fixture.outputDir,
      {
        input: { isTTY: true },
        output: { isTTY: true },
      },
    );
    const stateModule = await import("#core/state.ts");

    expect(result.thrown).toBeUndefined();
    expect(openCapturePageMock).toHaveBeenCalledWith(
      expect.objectContaining({
        auth: {
          path: expect.stringMatching(/\.taro\/playwright\/\.auth\/user\.json$/),
          strategy: "storageState",
        },
      }),
    );
    expect(
      vi.mocked(stateModule.persistPlaywrightAuthProfile),
    ).toHaveBeenCalledWith(
      expect.any(String),
      ".",
      expect.objectContaining({
        path: ".taro/playwright/.auth/user.json",
        strategy: "storageState",
      }),
    );
  });

  it("keeps zero marker conversion warning-only after writing output", async () => {
    const fixture = await createInlineJsFixture(
      "qual-gate-write-fail",
      `/**
 * ${environmentUrlMarker}
 * ${environmentOptionsMarker} { "url": "http://localhost:3001/example" }
 */
const {screen} = require('@testing-library/dom')
const {default: userEvent} = require('@testing-library/user-event')
require('@testing-library/jest-dom')

test('Marker gate fail in write mode', async () => {
  expect(location.href).toBe('http://localhost:3001/example')
  await userEvent.dblClick(screen.getByRole('heading', { name: 'Starting state' }))
  await userEvent.click(screen.getByRole('button', { name: 'Save' }))
})`,
    );
    const outputPath = deriveOutputPath(fixture.recordingPath);

    const result = await runGenerate(
      [fixture.recordingPath],
      fixture.outputDir,
    );
    const written = await readFile(outputPath, "utf-8");

    expect(result.thrown).toBeUndefined();
    expect(result.logs).toContain("[taro] ✓ post-write verified");
    expect(result.logs).toContain(`Created: ${outputPath}`);
    expect(result.logs).toContain(
      "QUAL-02 gate: WARN (zero-marker-conversion)",
    );
    expect(result.warnings).toContain(
      "QUAL-02 WARN: Semantic markers were detected, but no marker-derived assertions were emitted.",
    );
    expect(result.warnings).toContain(
      "Manual review required — this generated test is still a draft",
    );
    expect(result.exitCode).toBe(0);
    expect(written).toContain("it(");
  });

  it("keeps an existing test when it already matches the recorder flow with better quality", async () => {
    const fixture = await createInlineJsFixture(
      "preserve-existing-output",
      `/**
 * ${environmentUrlMarker}
 * ${environmentOptionsMarker} { "url": "http://localhost:3001/example" }
 */
const {screen} = require('@testing-library/dom')
const {default: userEvent} = require('@testing-library/user-event')
require('@testing-library/jest-dom')

test('Example flow', async () => {
  expect(location.href).toBe('http://localhost:3001/example')
  await userEvent.click(screen.getByRole('button', { name: 'Open Example Flow' }))
  await userEvent.type(screen.getByRole('textbox', { name: 'Customer Reference' }), 'ABC-123')
  await userEvent.click(screen.getByRole('button', { name: 'Save' }))
  await userEvent.dblClick(screen.getByRole('heading', { name: 'Review Example' }))
})`,
    );
    const outputPath = deriveOutputPath(fixture.recordingPath);
    const existingTest = `
describe('Example flow', () => {
  it('covers the full example flow', async () => {
    render(<FeatureFlow />)
    await user.click(screen.getByRole('button', { name: 'Open Example Flow' }))
    await user.type(screen.getByRole('textbox', { name: 'Customer Reference' }), 'ABC-123')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByRole('heading', { name: 'Review Example' })).toBeVisible()
  })
})
`;
    await writeFile(outputPath, existingTest, "utf-8");

    const result = await runGenerate(
      [fixture.recordingPath],
      fixture.outputDir,
    );
    const written = await readFile(outputPath, "utf-8");

    expect(result.thrown).toBeUndefined();
    expect(result.errors).toBe("");
    expect(result.logs).toContain("Existing output detected:");
    expect(result.logs).toContain(
      "Existing output will be updated because Taro kept the higher-scored suite and merged distinct tests from the alternate draft.",
    );
    expect(result.logs).toContain("Preserved 1 distinct test block from the alternate suite.");
    expect(result.logs).toContain(`Updated: ${outputPath}`);
    expect(result.logs).not.toContain(`Created: ${outputPath}`);
    expect(written).toContain("it('covers the full example flow'");
    expect(written).toContain("expect(await screen.findByRole('heading', { name: 'Review Example' }))");
  });

  it("updates an existing test when generation improves recorder-flow coverage", async () => {
    const fixture = await createInlineJsFixture(
      "overwrite-existing-output",
      `/**
 * ${environmentUrlMarker}
 * ${environmentOptionsMarker} { "url": "http://localhost:3001/example" }
 */
const {screen} = require('@testing-library/dom')
const {default: userEvent} = require('@testing-library/user-event')
require('@testing-library/jest-dom')

test('Example flow', async () => {
  expect(location.href).toBe('http://localhost:3001/example')
  await userEvent.click(screen.getByRole('button', { name: 'Open Example Flow' }))
  await userEvent.type(screen.getByRole('textbox', { name: 'Customer Reference' }), 'ABC-123')
  await userEvent.click(screen.getByRole('button', { name: 'Save' }))
  await userEvent.dblClick(screen.getByRole('heading', { name: 'Review Example' }))
})`,
    );
    const outputPath = deriveOutputPath(fixture.recordingPath);
    await writeFile(
      outputPath,
      `
describe('Example flow', () => {
  it('is stale', async () => {
    render(<App />)
    await user.click(screen.getByRole('button', { name: 'Save' }))
  })
})
`,
      "utf-8",
    );

    const result = await runGenerate(
      [fixture.recordingPath],
      fixture.outputDir,
    );
    const written = await readFile(outputPath, "utf-8");

    expect(result.thrown).toBeUndefined();
    expect(result.errors).toBe("");
    expect(result.logs).toContain(
      "Existing output will be updated because Taro kept the higher-scored suite and merged distinct tests from the alternate draft.",
    );
    expect(result.logs).toContain("Preserved 1 distinct test block from the alternate suite.");
    expect(result.logs).toContain(`Updated: ${outputPath}`);
    expect(written).toContain("it('is stale'");
    expect(written).toContain("Open Example Flow");
    expect(written).toContain("Customer Reference");
    expect(written).toContain("Review Example");
  });

  it("exits with code 2 when the recording file does not exist", async () => {
    const sandbox = await createSandbox("missing-file");
    const result = await runGenerate(
      [join(sandbox.outputDir, "nonexistent.js")],
      sandbox.outputDir,
    );

    expect(result.exitCode).toBe(2);
    expect(result.errors).toContain("File not found or not accessible");
  });

  it("exits with code 2 when the recording file cannot be parsed", async () => {
    const sandbox = await createSandbox("bad-parse");
    const badPath = join(sandbox.outputDir, "bad.js");
    await writeFile(badPath, "this is not valid recorder output !!!###$$$", "utf-8");

    const { loadInput: loadInputModule } = await import("#core/input-loader.ts");
    const loadInputMock = vi.mocked(loadInputModule);

    vi.mock("#core/input-loader.ts", () => ({
      loadInput: vi.fn(async () => {
        throw new Error("Failed to parse: unexpected token");
      }),
    }));

    const result = await runGenerate([badPath], sandbox.outputDir);

    expect(result.exitCode).toBe(2);
    vi.unmock("#core/input-loader.ts");
    void loadInputMock;
  });

  it("logs bootstrapped state message when .taro/state.json does not exist yet", async () => {
    const fixture = await createRecordingFixture("bootstrap-state");

    const result = await runGenerate([fixture.recordingPath], fixture.outputDir);

    expect(result.thrown).toBeUndefined();
    expect(result.logs).toContain(
      "Bootstrapped .taro/state.json from current repo tests.",
    );
  });

  it("warns when state bootstrap has warnings", async () => {
    const fixture = await createRecordingFixture("state-warnings");
    loadOrBootstrapTaroStateMock.mockResolvedValue({
      ...createDefaultTaroState(),
      summary: {
        ...createDefaultTaroState().summary,
        warnings: ["Legacy state migrated; re-run scan to refresh."],
      },
    });

    const result = await runGenerate([fixture.recordingPath], fixture.outputDir);

    expect(result.thrown).toBeUndefined();
    expect(result.warnings).toContain(
      "Legacy state migrated; re-run scan to refresh.",
    );
  });

  it("logs applied overrides when the package profile reports them", async () => {
    const fixture = await createRecordingFixture("applied-overrides");
    resolveTaroPackageProfileMock.mockImplementation(() => ({
      ...structuredClone(defaultProfile),
      appliedOverrides: ["effectiveRunner=vitest", "mockPattern=vi.mock"],
    }));

    const result = await runGenerate([fixture.recordingPath], fixture.outputDir);

    expect(result.thrown).toBeUndefined();
    expect(result.logs).toContain(
      "Applied overrides for .: effectiveRunner=vitest, mockPattern=vi.mock",
    );
  });

  it("warns when null package profile is resolved and uses generic defaults", async () => {
    const fixture = await createRecordingFixture("null-profile");
    resolveTaroPackageProfileMock.mockReturnValue(null);

    const result = await runGenerate([fixture.recordingPath], fixture.outputDir);

    expect(result.thrown).toBeUndefined();
    expect(result.warnings).toContain(
      "State profile: no matching package profile found; using generic defaults.",
    );
  });

  it("warns when auth interrupt has an instructions strategy with a path", async () => {
    const fixture = await createRecordingFixture("auth-interrupt-instructions");
    resolveTaroPackageProfileMock.mockImplementation(() => ({
      ...structuredClone(defaultProfile),
      playwrightAuth: {
        strategy: "storageState",
        path: "playwright/.auth/user.json",
        detectedAt: "init",
        source: "detected",
      },
    }));
    captureVisualStateMock.mockResolvedValue({
      capturedAt: new Date().toISOString(),
      dialog: null,
      element: null,
      finalUrl: "http://localhost:3001/login",
      interrupt: {
        kind: "auth-required",
        actualTitle: "Sign In",
        expectedTitle: "DigiTax",
        expectedUrl: "http://localhost:3001/dashboard",
        path: "/tmp/auth-instructions.md",
        reachedUrl: "http://localhost:3001/login",
        signals: ["auth-route"],
        strategy: "instructions",
      },
      pageTitle: "Sign In",
      reason: "dialog-state",
      selector: "#save",
      status: "auth-interrupted",
      url: "http://localhost:3001/dashboard",
      warnings: [],
    });

    const result = await runGenerate(
      [fixture.recordingPath],
      fixture.outputDir,
    );

    expect(result.thrown).toBeUndefined();
    expect(result.warnings).toContain(
      "Review the saved auth instructions at /tmp/auth-instructions.md, or provide --auth for automatic session injection.",
    );
    expect(result.exitCode).toBe(0);
  });

  it("warns with generic options when auth interrupt has no strategy path", async () => {
    const fixture = await createRecordingFixture("auth-interrupt-no-path");
    resolveTaroPackageProfileMock.mockImplementation(() => ({
      ...structuredClone(defaultProfile),
      playwrightAuth: {
        strategy: "storageState",
        path: "playwright/.auth/user.json",
        detectedAt: "init",
        source: "detected",
      },
    }));
    captureVisualStateMock.mockResolvedValue({
      capturedAt: new Date().toISOString(),
      dialog: null,
      element: null,
      finalUrl: "http://localhost:3001/login",
      interrupt: {
        kind: "auth-required",
        actualTitle: "Sign In",
        expectedTitle: null,
        expectedUrl: null,
        reachedUrl: "http://localhost:3001/login",
        signals: ["auth-route"],
        strategy: "custom",
      },
      pageTitle: "Sign In",
      reason: "dialog-state",
      selector: "#save",
      status: "auth-interrupted",
      url: "http://localhost:3001/dashboard",
      warnings: [],
    });

    const result = await runGenerate(
      [fixture.recordingPath],
      fixture.outputDir,
    );

    expect(result.thrown).toBeUndefined();
    expect(result.warnings).toContain(
      "Options: --auth <storageState.json>, --instructions <auth.md>, or --no-screenshots.",
    );
    expect(result.exitCode).toBe(0);
  });

  it("shows starting point screenshot for recovered visual auth when present", async () => {
    const fixture = await createRecordingFixture("auth-recovered-screenshot");
    captureVisualStateMock.mockResolvedValue({
      authRecovery: {
        completedAt: new Date().toISOString(),
        persistedAuthPath: ".taro/playwright/.auth/user.json",
        retryToExpectedUrl: {
          attempted: true,
          completedAt: new Date().toISOString(),
          outcome: "succeeded",
          targetUrl: "http://localhost:3001/dashboard",
        },
        startedAt: new Date().toISOString(),
        status: "succeeded",
        timeoutMs: 300000,
      },
      capturedAt: new Date().toISOString(),
      dialog: null,
      element: null,
      finalUrl: "http://localhost:3001/dashboard",
      interrupt: {
        kind: "auth-required",
        actualTitle: "Sign In",
        expectedTitle: "DigiTax",
        expectedUrl: "http://localhost:3001/dashboard",
        reachedUrl: "http://localhost:3001/login",
        signals: ["auth-route"],
        strategy: "instructions",
      },
      pageTitle: "DigiTax",
      reason: "dialog-state",
      screenshotPath: "/tmp/taro-dashboard-recovered.png",
      startingPointConfirmed: true,
      selector: "#save",
      status: "auth-recovered",
      url: "http://localhost:3001/dashboard",
      warnings: [],
    });

    const result = await runGenerate(
      [fixture.recordingPath],
      fixture.outputDir,
      { input: { isTTY: true }, output: { isTTY: true } },
    );

    expect(result.thrown).toBeUndefined();
    expect(result.logs).toContain(
      "Starting point screenshot: /tmp/taro-dashboard-recovered.png",
    );
    expect(result.logs).toContain(
      "Starting point confirmed: http://localhost:3001/dashboard",
    );
    expect(result.logs).toContain("Retried recorded URL once after auth recovery:");
  });

  it("warns when auth-recovery-failed visual state occurs", async () => {
    const fixture = await createRecordingFixture("auth-recovery-failed");
    captureVisualStateMock.mockResolvedValue({
      authRecovery: {
        completedAt: new Date().toISOString(),
        instructionsPath: null,
        retryToExpectedUrl: null,
        startedAt: new Date().toISOString(),
        status: "failed",
        timeoutMs: 300000,
      },
      capturedAt: new Date().toISOString(),
      dialog: null,
      element: null,
      finalUrl: "http://localhost:3001/login",
      interrupt: {
        kind: "auth-required",
        actualTitle: "Sign In",
        expectedTitle: "DigiTax",
        expectedUrl: "http://localhost:3001/dashboard",
        reachedUrl: "http://localhost:3001/login",
        signals: ["auth-route"],
        strategy: "instructions",
      },
      pageTitle: "Sign In",
      reason: "dialog-state",
      screenshotPath: "/tmp/taro-login-failed.png",
      selector: "#save",
      status: "auth-recovery-failed",
      url: "http://localhost:3001/dashboard",
      warnings: ["Playwright authentication failed: credentials rejected."],
    });

    const result = await runGenerate(
      [fixture.recordingPath],
      fixture.outputDir,
      { input: { isTTY: true }, output: { isTTY: true } },
    );

    expect(result.thrown).toBeUndefined();
    expect(result.warnings).toContain(
      "Playwright authentication could not be completed.",
    );
    expect(result.warnings).toContain(
      "Playwright authentication failed: credentials rejected.",
    );
    expect(result.logs).toContain(
      "Auth checkpoint screenshot: /tmp/taro-login-failed.png",
    );
    expect(result.exitCode).toBe(0);
  });

  it("summarizes captured visual state with dialog title", async () => {
    const fixture = await createRecordingFixture("visual-dialog-state");
    captureVisualStateMock.mockResolvedValue({
      capturedAt: new Date().toISOString(),
      dialog: { title: "Confirm Submission", actions: ["Submit", "Cancel"] },
      element: null,
      finalUrl: "http://localhost:3001/dashboard",
      pageTitle: "DigiTax",
      reason: "dialog-state",
      screenshotPath: "/tmp/dialog-screenshot.png",
      startingPointConfirmed: false,
      status: "captured",
      url: "http://localhost:3001/dashboard",
      warnings: [],
    });

    const result = await runGenerate([fixture.recordingPath], fixture.outputDir);

    expect(result.thrown).toBeUndefined();
    expect(result.logs).toContain("Visual state: dialog-state, dialog=Confirm Submission");
    expect(result.logs).toContain("screenshot=/tmp/dialog-screenshot.png");
  });

  it("logs starting point screenshot for captured state with page confirmation", async () => {
    const fixture = await createRecordingFixture("visual-confirmed-state");
    captureVisualStateMock.mockResolvedValue({
      capturedAt: new Date().toISOString(),
      dialog: null,
      element: null,
      finalUrl: "http://localhost:3001/dashboard",
      pageTitle: "DigiTax",
      reason: "landmark-confirmation",
      screenshotPath: "/tmp/confirmed-screenshot.png",
      startingPointConfirmed: true,
      status: "captured",
      url: "http://localhost:3001/dashboard",
      warnings: [],
      matchedLandmarks: [],
    });

    const result = await runGenerate([fixture.recordingPath], fixture.outputDir);

    expect(result.thrown).toBeUndefined();
    expect(result.logs).toContain("Starting point screenshot: /tmp/confirmed-screenshot.png");
    expect(result.logs).toContain("Visual state: landmark-confirmation, page=http://localhost:3001/dashboard");
  });

  it("reports auth status as not_required when captured without auth", async () => {
    const fixture = await createRecordingFixture("auth-not-required");
    captureVisualStateMock.mockResolvedValue({
      capturedAt: new Date().toISOString(),
      dialog: null,
      element: null,
      finalUrl: "http://localhost:3001/dashboard",
      pageTitle: "DigiTax",
      reason: "landmark-confirmation",
      startingPointConfirmed: true,
      status: "captured",
      url: "http://localhost:3001/dashboard",
      warnings: [],
      matchedLandmarks: [],
    });

    const result = await runGenerate([fixture.recordingPath], fixture.outputDir);

    expect(result.thrown).toBeUndefined();
    expect(result.logs).toContain("Auth status: not_required");
  });

  it("reports auth status as authenticated when captured with auth", async () => {
    const fixture = await createRecordingFixture("auth-status-authenticated");
    const authDir = join(fixture.outputDir, "playwright", ".auth");
    const authPath = join(authDir, "user.json");
    await mkdir(authDir, { recursive: true });
    await writeFile(authPath, '{"cookies":[],"origins":[]}', "utf-8");
    captureVisualStateMock.mockResolvedValue({
      capturedAt: new Date().toISOString(),
      dialog: null,
      element: null,
      finalUrl: "http://localhost:3001/dashboard",
      pageTitle: "DigiTax",
      reason: "landmark-confirmation",
      startingPointConfirmed: true,
      status: "captured",
      url: "http://localhost:3001/dashboard",
      warnings: [],
      matchedLandmarks: [],
    });

    const result = await runGenerate(
      ["--auth", authPath, fixture.recordingPath],
      fixture.outputDir,
    );

    expect(result.thrown).toBeUndefined();
    expect(result.logs).toContain("Auth status: authenticated");
  });

  it("warns when --instructions file is not found and continues without it", async () => {
    const fixture = await createRecordingFixture("bad-instructions-path");

    const result = await runGenerate(
      ["--instructions", "/nonexistent/auth.md", fixture.recordingPath],
      fixture.outputDir,
    );

    expect(result.thrown).toBeUndefined();
    expect(result.warnings).toContain(
      "Visual auth: file not found",
    );
  });

  it("warns when both --auth and --instructions are provided and uses --auth", async () => {
    const fixture = await createRecordingFixture("both-auth-options");
    const authDir = join(fixture.outputDir, "playwright", ".auth");
    const authPath = join(authDir, "user.json");
    const instrPath = join(authDir, "auth.md");
    await mkdir(authDir, { recursive: true });
    await writeFile(authPath, '{"cookies":[],"origins":[]}', "utf-8");
    await writeFile(instrPath, "# Auth instructions", "utf-8");

    const result = await runGenerate(
      ["--auth", authPath, "--instructions", instrPath, fixture.recordingPath],
      fixture.outputDir,
    );

    expect(result.thrown).toBeUndefined();
    expect(result.warnings).toContain(
      "Visual auth: both --auth and --instructions were provided; preferring --auth for this run.",
    );
  });

  it("warns when explicit auth cannot be persisted in state", async () => {
    const fixture = await createRecordingFixture("persist-auth-failed");
    const authDir = join(fixture.outputDir, "playwright", ".auth");
    const authPath = join(authDir, "user.json");
    await mkdir(authDir, { recursive: true });
    await writeFile(authPath, '{"cookies":[],"origins":[]}', "utf-8");
    persistPlaywrightAuthProfileMock.mockResolvedValue(false);

    const result = await runGenerate(
      ["--auth", authPath, fixture.recordingPath],
      fixture.outputDir,
    );

    expect(result.thrown).toBeUndefined();
    expect(result.warnings).toContain(
      "Visual auth: resolved the auth path for this run but could not persist it in state.",
    );
  });

  it("warns when explicit auth is provided but no package profile is available to persist it", async () => {
    const fixture = await createRecordingFixture("persist-auth-no-profile");
    const authDir = join(fixture.outputDir, "playwright", ".auth");
    const authPath = join(authDir, "user.json");
    await mkdir(authDir, { recursive: true });
    await writeFile(authPath, '{"cookies":[],"origins":[]}', "utf-8");
    resolveTaroPackageProfileMock.mockReturnValue(null);

    const result = await runGenerate(
      ["--auth", authPath, fixture.recordingPath],
      fixture.outputDir,
    );

    expect(result.thrown).toBeUndefined();
    expect(result.warnings).toContain(
      "Visual auth: using the explicit auth path for this run, but no package profile was available to persist it.",
    );
  });

  it("warns when recovered visual auth has no package profile to persist to", async () => {
    const fixture = await createRecordingFixture("recovered-auth-no-profile");
    resolveTaroPackageProfileMock.mockReturnValue(null);
    captureVisualStateMock.mockResolvedValue({
      authRecovery: {
        completedAt: new Date().toISOString(),
        persistedAuthPath: ".taro/playwright/.auth/user.json",
        retryToExpectedUrl: {
          attempted: false,
          completedAt: new Date().toISOString(),
          outcome: "succeeded",
          targetUrl: "http://localhost:3001/dashboard",
        },
        startedAt: new Date().toISOString(),
        status: "succeeded",
        timeoutMs: 300000,
      },
      capturedAt: new Date().toISOString(),
      dialog: null,
      element: null,
      finalUrl: "http://localhost:3001/dashboard",
      interrupt: {
        kind: "auth-required",
        actualTitle: "Sign In",
        expectedTitle: "DigiTax",
        expectedUrl: "http://localhost:3001/dashboard",
        reachedUrl: "http://localhost:3001/login",
        signals: ["auth-route"],
        strategy: "instructions",
      },
      pageTitle: "DigiTax",
      reason: "dialog-state",
      selector: "#save",
      status: "auth-recovered",
      url: "http://localhost:3001/dashboard",
      warnings: [],
    });

    const result = await runGenerate(
      [fixture.recordingPath],
      fixture.outputDir,
      { input: { isTTY: true }, output: { isTTY: true } },
    );

    expect(result.thrown).toBeUndefined();
    expect(result.warnings).toContain(
      "Visual auth: storageState was saved, but no package profile was available to persist it in state.",
    );
  });

  it("warns when recovered visual auth persistence returns false", async () => {
    const fixture = await createRecordingFixture("recovered-auth-persist-false");
    persistPlaywrightAuthProfileMock.mockResolvedValue(false);
    captureVisualStateMock.mockResolvedValue({
      authRecovery: {
        completedAt: new Date().toISOString(),
        persistedAuthPath: ".taro/playwright/.auth/user.json",
        retryToExpectedUrl: {
          attempted: false,
          completedAt: new Date().toISOString(),
          outcome: "succeeded",
          targetUrl: "http://localhost:3001/dashboard",
        },
        startedAt: new Date().toISOString(),
        status: "succeeded",
        timeoutMs: 300000,
      },
      capturedAt: new Date().toISOString(),
      dialog: null,
      element: null,
      finalUrl: "http://localhost:3001/dashboard",
      interrupt: {
        kind: "auth-required",
        actualTitle: "Sign In",
        expectedTitle: "DigiTax",
        expectedUrl: "http://localhost:3001/dashboard",
        reachedUrl: "http://localhost:3001/login",
        signals: ["auth-route"],
        strategy: "instructions",
      },
      pageTitle: "DigiTax",
      reason: "dialog-state",
      selector: "#save",
      status: "auth-recovered",
      url: "http://localhost:3001/dashboard",
      warnings: [],
    });

    const result = await runGenerate(
      [fixture.recordingPath],
      fixture.outputDir,
      { input: { isTTY: true }, output: { isTTY: true } },
    );

    expect(result.thrown).toBeUndefined();
    expect(result.warnings).toContain(
      "Visual auth: storageState was saved, but Taro could not persist it in state.",
    );
  });

  it("warns when recovered visual auth persistence throws", async () => {
    const fixture = await createRecordingFixture("recovered-auth-persist-throws");
    persistPlaywrightAuthProfileMock.mockRejectedValue(
      new Error("disk full"),
    );
    captureVisualStateMock.mockResolvedValue({
      authRecovery: {
        completedAt: new Date().toISOString(),
        persistedAuthPath: ".taro/playwright/.auth/user.json",
        retryToExpectedUrl: {
          attempted: false,
          completedAt: new Date().toISOString(),
          outcome: "succeeded",
          targetUrl: "http://localhost:3001/dashboard",
        },
        startedAt: new Date().toISOString(),
        status: "succeeded",
        timeoutMs: 300000,
      },
      capturedAt: new Date().toISOString(),
      dialog: null,
      element: null,
      finalUrl: "http://localhost:3001/dashboard",
      interrupt: {
        kind: "auth-required",
        actualTitle: "Sign In",
        expectedTitle: "DigiTax",
        expectedUrl: "http://localhost:3001/dashboard",
        reachedUrl: "http://localhost:3001/login",
        signals: ["auth-route"],
        strategy: "instructions",
      },
      pageTitle: "DigiTax",
      reason: "dialog-state",
      selector: "#save",
      status: "auth-recovered",
      url: "http://localhost:3001/dashboard",
      warnings: [],
    });

    const result = await runGenerate(
      [fixture.recordingPath],
      fixture.outputDir,
      { input: { isTTY: true }, output: { isTTY: true } },
    );

    expect(result.thrown).toBeUndefined();
    expect(result.warnings).toContain(
      "Visual auth: storageState was saved, but persisting it in .taro/state.json failed.",
    );
  });

  it("summarizes mock analysis with repeated targets and recommendations", async () => {
    const fixture = await createRecordingFixture("mock-analysis-summary");
    const { analyzeMocks: analyzeMocksModule } = await import(
      "#core/mock-intelligence.ts"
    );
    vi.mocked(analyzeMocksModule).mockResolvedValueOnce({
      source: "package-profile",
      packagePath: "packages/example-app",
      repeatedTargets: [{ target: "@/api/orders", count: 5, files: [] }],
      mutationLifecycles: [
        { file: "src/orders.test.tsx", stages: ["success", "error"], evidence: [] },
      ],
      interactionContracts: [
        {
          file: "src/orders.test.tsx",
          kind: "mutation-form",
          states: ["failed-completion"],
          supportTargets: [],
          overrideStyle: "stable-handles",
          confidence: "high",
          evidence: [],
        },
      ],
      instabilityWarnings: [
        { reason: "over-specified mock", file: "src/orders.test.tsx" },
      ],
      boundaryProfiles: [
        {
          target: "@/api/orders",
          kind: "data-module",
          strategy: "shared-module-factory",
          guardrailReason: null,
          supportImportPath: "@/tests/mocks/orders-api",
          supportPath: "packages/example-app/src/tests/mocks/orders-api.ts",
          supportExports: {
            factoryExport: "createOrdersApiMock",
            resetExport: "resetOrdersApiMock",
            overrideExports: [],
            spyExports: [],
            fixtureExports: [],
          },
          payloadSource: "fixtures",
          confidence: "high",
          files: [],
          evidence: [],
          conflictTargets: [],
          lowConfidenceScaffold: false,
        },
      ],
      recommendations: [
        { kind: "shared-factory", target: "@/api/orders", count: 5 },
      ],
      preferredSharedMocks: { "@/api/orders": "@/tests/mocks/orders-api" },
      forbidMocks: ["@/ui/components"],
      forbidBoundaryTargets: ["@/legacy/api"],
      conventions: null,
      inlineSafeMockTargets: [],
      sharedMockFactories: [],
      preferredBoundaryImplementations: {},
      queryHookPolicy: "avoid",
      companionPolicy: "heuristic",
      enabledContractFamilies: ["mutation-form"],
    } as never);

    const result = await runGenerate([fixture.recordingPath], fixture.outputDir);

    expect(result.thrown).toBeUndefined();
    expect(result.logs).toContain("Mock analysis:");
    expect(result.logs).toContain("1 repeated target(s)");
    expect(result.logs).toContain("1 mutation flow(s)");
    expect(result.logs).toContain("1 interaction contract(s)");
    expect(result.logs).toContain("1 stability warning(s)");
    expect(result.logs).toContain("1 boundary profile(s)");
    expect(result.logs).toContain("Mock hint: shared-factory @/api/orders");
    expect(result.logs).toContain(
      "Shared mock preference: @/api/orders -> @/tests/mocks/orders-api",
    );
    expect(result.logs).toContain("Mutation lifecycle: success -> error in src/orders.test.tsx");
    expect(result.logs).toContain("Interaction contract: mutation-form (failed-completion) in src/orders.test.tsx");
    expect(result.warnings).toContain(
      "Mock policy: forbidden targets @/ui/components",
    );
    expect(result.warnings).toContain(
      "Boundary policy: forbidden targets @/legacy/api",
    );
    expect(result.warnings).toContain(
      "Mock stability: over-specified mock (src/orders.test.tsx)",
    );
  });

  it("emits existing-output assessment error warning when reading existing output fails", async () => {
    const fixture = await createInlineJsFixture(
      "existing-output-error",
      `/**
 * ${environmentUrlMarker}
 * ${environmentOptionsMarker} { "url": "http://localhost:3001/example" }
 */
const {screen} = require('@testing-library/dom')
const {default: userEvent} = require('@testing-library/user-event')
require('@testing-library/jest-dom')

test('Example flow', async () => {
  expect(location.href).toBe('http://localhost:3001/example')
  await userEvent.click(screen.getByRole('button', { name: 'Open Example Flow' }))
})`,
    );
    const outputPath = deriveOutputPath(fixture.recordingPath);
    // Create a directory at the output path so readFile() throws EISDIR
    await mkdir(outputPath, { recursive: true });

    const result = await runGenerate(
      [fixture.recordingPath],
      fixture.outputDir,
    );

    expect(result.thrown).toBeUndefined();
    expect(result.warnings).toContain(
      "Existing output could not be assessed cleanly, so Taro will preserve it instead of overwriting blindly.",
    );
    expect(result.exitCode).toBe(0);
  });

  it("exits with code 2 when writing the test file fails", async () => {
    const root = await mkdtemp(join(tmpdir(), "taro-generate-write-error-fs-"));
    sandboxes.push(root);
    const projectDir = join(root, "project");
    await mkdir(projectDir, { recursive: true });
    const recordingPath = join(root, "write-error.js");
    await writeFile(recordingPath, sampleRestRecordingJs, "utf-8");
    // outputPath = root/write-error.test.tsx; its parent (root) exists as a dir.
    // Make root read-only so writeFile(outputPath) fails with EACCES.
    await chmod(root, 0o555);

    let result: Awaited<ReturnType<typeof runGenerate>>;
    try {
      result = await runGenerate([recordingPath], projectDir);
    } finally {
      // Restore permissions so afterEach cleanup can remove the sandbox.
      await chmod(root, 0o755);
    }

    expect(result!.exitCode).toBe(2);
    expect(result!.logs).toContain("Error:");
  });

  it("keeps a test file when existing output cannot be read and warns about it", async () => {
    const fixture = await createInlineJsFixture(
      "assessment-error-preserve",
      `/**
 * ${environmentUrlMarker}
 * ${environmentOptionsMarker} { "url": "http://localhost:3001/example" }
 */
const {screen} = require('@testing-library/dom')
const {default: userEvent} = require('@testing-library/user-event')
require('@testing-library/jest-dom')

test('Example flow', async () => {
  expect(location.href).toBe('http://localhost:3001/example')
  await userEvent.click(screen.getByRole('button', { name: 'Open Example Flow' }))
  await userEvent.click(screen.getByRole('heading', { name: 'Review Example Flow' }))
})`,
    );
    const outputPath = deriveOutputPath(fixture.recordingPath);
    // Create a directory at the output path so readFile() throws EISDIR (existing output can't be read)
    await mkdir(outputPath, { recursive: true });

    const result = await runGenerate(
      [fixture.recordingPath],
      fixture.outputDir,
    );

    expect(result.thrown).toBeUndefined();
    expect(result.warnings).toContain(
      "Existing output could not be assessed cleanly, so Taro will preserve it instead of overwriting blindly.",
    );
    // Output directory (which was created as a dir) should still be a directory - generation was skipped
    expect(result.exitCode).toBe(0);
  });

  it("emits placement-correction marker warnings", async () => {
    const fixture = await createInlineJsFixture(
      "marker-placement-correction",
      `/**
 * ${environmentUrlMarker}
 * ${environmentOptionsMarker} { "url": "http://localhost:3001/example" }
 */
const {screen} = require('@testing-library/dom')
const {default: userEvent} = require('@testing-library/user-event')
require('@testing-library/jest-dom')

test('Marker placement correction flow', async () => {
  expect(location.href).toBe('http://localhost:3001/example')
  await userEvent.dblClick(screen.getByRole('heading', { name: 'Starting state' }))
  await userEvent.click(screen.getByRole('button', { name: 'Save' }))
  await userEvent.dblClick(screen.getByRole('heading', { name: 'Review state' }))
  await userEvent.click(screen.getByRole('heading', { name: 'Review state' }))
})`,
    );

    // Use getMockImplementation to get the real planJsSuite delegate without recursion
    const realPlanJsSuite = planJsSuiteMock.getMockImplementation();

    planJsSuiteMock.mockImplementationOnce((params) => {
      const plan = realPlanJsSuite?.(params);
      if (!plan) return plan;

      // Inject placement correction diagnostics into existing marker assertions
      return {
        ...plan,
        scenarios: plan.scenarios.map((scenario) => ({
          ...scenario,
          markerAssertions: (scenario.markerAssertions ?? []).map(
            (assertion, idx) =>
              idx === 0
                ? {
                    ...assertion,
                    diagnostics: {
                      ...assertion.diagnostics,
                      placementCorrection: {
                        fromScenarioName: "original",
                        toScenarioName: "corrected",
                      },
                    },
                  }
                : assertion,
          ),
        })),
      };
    });

    const result = await runGenerate(
      [fixture.recordingPath],
      fixture.outputDir,
    );

    expect(result.thrown).toBeUndefined();
    expect(result.warnings).toMatch(
      /MKR-02 placement-correction marker=.+ from="original" to="corrected"/,
    );
  });

  it("emits canonical recovery marker diagnostics", async () => {
    const fixture = await createInlineJsFixture(
      "marker-canonical-recovery",
      `/**
 * ${environmentUrlMarker}
 * ${environmentOptionsMarker} { "url": "http://localhost:3001/example" }
 */
const {screen} = require('@testing-library/dom')
const {default: userEvent} = require('@testing-library/user-event')
require('@testing-library/jest-dom')

test('Canonical recovery marker flow', async () => {
  expect(location.href).toBe('http://localhost:3001/example')
  await userEvent.dblClick(screen.getByRole('heading', { name: 'Starting state' }))
  await userEvent.click(screen.getByRole('button', { name: 'Save' }))
  await userEvent.dblClick(screen.getByRole('heading', { name: 'Review state' }))
  await userEvent.click(screen.getByRole('heading', { name: 'Review state' }))
})`,
    );

    // Use getMockImplementation to get the real planJsSuite delegate without recursion
    const realPlanJsSuite = planJsSuiteMock.getMockImplementation();

    planJsSuiteMock.mockImplementationOnce((params) => {
      const plan = realPlanJsSuite?.(params);
      if (!plan) return plan;

      // Inject canonical recovery diagnostics into existing marker assertions
      return {
        ...plan,
        scenarios: plan.scenarios.map((scenario) => ({
          ...scenario,
          markerAssertions: (scenario.markerAssertions ?? []).map(
            (assertion, idx) =>
              idx === 0
                ? {
                    ...assertion,
                    diagnostics: {
                      ...assertion.diagnostics,
                      canonicalRecovery: {
                        sourceFile: "src/review-flow.test.tsx",
                        fromText: "Starting state",
                        toText: "Review state",
                      },
                    },
                  }
                : assertion,
          ),
        })),
      };
    });

    const result = await runGenerate(
      [fixture.recordingPath],
      fixture.outputDir,
    );

    expect(result.thrown).toBeUndefined();
    expect(result.logs).toMatch(
      /MKR-01 canonical-copy marker=.+ file=src\/review-flow\.test\.tsx from="Starting state" to="Review state"/,
    );
  });

  it("summarizes boundary support warnings when plan has them", async () => {
    const fixture = await createProjectInlineJsFixture(
      "boundary-support-warnings",
      `/**
 * ${environmentUrlMarker}
 * ${environmentOptionsMarker} { "url": "http://localhost:3001/example" }
 */
const {screen} = require('@testing-library/dom')
const {default: userEvent} = require('@testing-library/user-event')
require('@testing-library/jest-dom')

test('Example flow', async () => {
  expect(location.href).toBe('http://localhost:3001/example')
  await userEvent.click(screen.getByRole('button', { name: 'Open Example Flow' }))
  await userEvent.click(screen.getByRole('heading', { name: 'Review Example Flow' }))
})`,
    );
    const featureFlowPath = join(
      fixture.outputDir,
      "packages",
      "example-app",
      "src",
      "features",
      "FeatureFlow.tsx",
    );
    await mkdir(dirname(featureFlowPath), { recursive: true });
    await writeFile(
      featureFlowPath,
      `export default function FeatureFlow() { return <div>FeatureFlow</div> }`,
      "utf-8",
    );

    const exampleProfile = {
      ...structuredClone(defaultProfile),
      packagePath: "packages/example-app",
      packageName: "@repo/example-app",
      effectiveRunner: "vitest" as const,
    };

    const packages = {
      ".": defaultProfile,
      "packages/example-app": exampleProfile,
    };
    loadOrBootstrapTaroStateMock.mockResolvedValue(
      createDefaultTaroState(packages),
    );
    resolveTaroPackageProfileMock.mockImplementation(
      createPackageResolver(packages as Record<string, typeof defaultProfile>),
    );

    const realPlanJsSuite2 = planJsSuiteMock.getMockImplementation();

    planJsSuiteMock.mockImplementationOnce((params) => {
      const plan = realPlanJsSuite2?.(params);
      if (!plan) return plan;
      return {
        ...plan,
        warnings: [
          "Taro could not resolve the exact render target from repo context; generated output should be treated as a boundary draft.",
          "Prefer a repo-local module/container render boundary",
        ],
      };
    });

    const result = await runGenerate(
      [fixture.recordingPath],
      fixture.outputDir,
    );

    expect(result.thrown).toBeUndefined();
    expect(result.warnings).toContain(
      "Boundary: Taro could not resolve the exact render target from repo context; generated output should be treated as a boundary draft.",
    );
  });

  it("shows selector debug trace with resolved (non-unresolved) status", async () => {
    const fixture = await createRecordingFixture("selector-debug-resolved");
    replayStepMock.mockResolvedValue({ replayed: true });
    resolveSelectorMock.mockImplementation((selector: SelectorDescriptor) => ({
      ...resolvedSelector(selector, makeLiveDomQuery(selector)),
      debug: {
        cssSelector: selector.selector,
        derivedQuery: "screen.getByRole('combobox', { name: 'Item selector' })",
        inspectSource: "persistent-page",
        inspectionError: undefined,
        pageUrl: "http://localhost:3001/workspace",
        phase: "pre-step",
        reason: "query-derived",
        result: "resolved",
      },
    }));

    const result = await runGenerate(
      ["--debug-selectors", fixture.recordingPath],
      fixture.outputDir,
    );

    expect(result.thrown).toBeUndefined();
    expect(result.logs).toContain("[taro][selector]");
  });

  it("uses instructions auth strategy when --instructions file is provided", async () => {
    const fixture = await createRecordingFixture("instructions-auth");
    const instrDir = join(fixture.outputDir, "auth-instructions");
    const instrPath = join(instrDir, "auth.md");
    await mkdir(instrDir, { recursive: true });
    await writeFile(instrPath, "# Auth Instructions\nGo to login page...", "utf-8");

    const result = await runGenerate(
      ["--instructions", instrPath, fixture.recordingPath],
      fixture.outputDir,
    );
    const stateModule = await import("#core/state.ts");

    expect(result.thrown).toBeUndefined();
    expect(result.logs).toMatch(
      /Persisted visual auth for package \.: instructions=.*auth-instructions\/auth\.md/,
    );
    expect(
      vi.mocked(stateModule.persistPlaywrightAuthProfile),
    ).toHaveBeenCalledWith(
      expect.any(String),
      ".",
      expect.objectContaining({
        strategy: "instructions",
        source: "manual",
      }),
    );
  });

  it("generates test without a URL and summarizes auth status as null", async () => {
    const fixture = await createInlineJsFixture(
      "no-url-no-auth",
      `const {screen} = require('@testing-library/dom')
const {default: userEvent} = require('@testing-library/user-event')
require('@testing-library/jest-dom')

test('Simple flow without URL', async () => {
  await userEvent.click(screen.getByRole('button', { name: 'Submit' }))
})`,
    );

    const result = await runGenerate([fixture.recordingPath], fixture.outputDir);

    expect(result.thrown).toBeUndefined();
    expect(result.errors).toBe("");
    expect(result.logs).not.toContain("Auth status:");
  });

  it("logs boundary support warnings when boundarySupportPlan has warnings", async () => {
    const fixture = await createProjectInlineJsFixture(
      "boundary-support-plan-warnings",
      `/**
 * ${environmentUrlMarker}
 * ${environmentOptionsMarker} { "url": "http://localhost:3001/example" }
 */
const {screen} = require('@testing-library/dom')
const {default: userEvent} = require('@testing-library/user-event')
require('@testing-library/jest-dom')

test('Example flow', async () => {
  expect(location.href).toBe('http://localhost:3001/example')
  await userEvent.click(screen.getByRole('button', { name: 'Open Example Flow' }))
  await userEvent.click(screen.getByRole('heading', { name: 'Review Example Flow' }))
})`,
    );
    const featureFlowPath = join(
      fixture.outputDir,
      "packages",
      "example-app",
      "src",
      "features",
      "FeatureFlow.tsx",
    );
    await mkdir(dirname(featureFlowPath), { recursive: true });
    await writeFile(
      featureFlowPath,
      `import { useOrders } from '@/api/orders'
export default function FeatureFlow() { useOrders(); return <div>Flow</div> }`,
      "utf-8",
    );

    const featureFlowRelPath =
      "packages/example-app/src/features/FeatureFlow.tsx";
    const exampleProfile = {
      ...structuredClone(defaultProfile),
      packagePath: "packages/example-app",
      packageName: "@repo/example-app",
      effectiveRunner: "vitest" as const,
      renderTargets: [
        {
          symbol: "FeatureFlow",
          importPath: "./FeatureFlow",
          sourceTestFile: featureFlowRelPath,
          helperNames: [],
          usesWithin: false,
        },
      ],
      boundaryProfiles: [
        {
          target: "@/api/orders",
          kind: "data-module" as const,
          strategy: "scaffolded-module-factory" as const,
          guardrailReason: null,
          supportImportPath: null,
          supportPath: null,
          supportExports: {
            factoryExport: null,
            resetExport: null,
            overrideExports: [],
            spyExports: [],
            fixtureExports: [],
          },
          payloadSource: "typed-defaults" as const,
          confidence: "low" as const,
          files: [],
          evidence: [],
          conflictTargets: [],
          lowConfidenceScaffold: true,
        },
      ],
    };

    const packages = {
      ".": defaultProfile,
      "packages/example-app": exampleProfile,
    };
    loadOrBootstrapTaroStateMock.mockResolvedValue(
      createDefaultTaroState(packages),
    );
    // Return exampleProfile for all paths so planBoundarySupport receives
    // the profile with boundaryProfiles and renderTargets.
    resolveTaroPackageProfileMock.mockImplementation(() =>
      structuredClone(exampleProfile),
    );

    const result = await runGenerate(
      [fixture.recordingPath],
      fixture.outputDir,
    );

    expect(result.thrown).toBeUndefined();
    expect(result.warnings).toContain(
      "Boundary support requires manual review because one or more collaborators were scaffolded with generic defaults.",
    );
  });

  it("resolves render target from a test file that imports the component", async () => {
    const fixture = await createProjectInlineJsFixture(
      "render-target-from-test",
      `/**
 * ${environmentUrlMarker}
 * ${environmentOptionsMarker} { "url": "http://localhost:3001/example" }
 */
const {screen} = require('@testing-library/dom')
const {default: userEvent} = require('@testing-library/user-event')
require('@testing-library/jest-dom')

test('Example flow', async () => {
  expect(location.href).toBe('http://localhost:3001/example')
  await userEvent.click(screen.getByRole('button', { name: 'Open Example Flow' }))
  await userEvent.click(screen.getByRole('heading', { name: 'Review Example Flow' }))
})`,
    );
    const featureFlowPath = join(
      fixture.outputDir,
      "src",
      "features",
      "FeatureFlow.tsx",
    );
    const testFilePath = join(
      fixture.outputDir,
      "src",
      "features",
      "FeatureFlow.test.tsx",
    );
    await mkdir(dirname(featureFlowPath), { recursive: true });
    await writeFile(
      featureFlowPath,
      `export default function FeatureFlow() { return <button>Open Example Flow</button> }`,
      "utf-8",
    );
    await writeFile(
      testFilePath,
      `import FeatureFlow from './FeatureFlow'
test('baseline', () => { render(<FeatureFlow />) })`,
      "utf-8",
    );

    resolveTaroPackageProfileMock.mockImplementation(() => ({
      ...structuredClone(defaultProfile),
      renderTargets: [
        {
          symbol: "FeatureFlow",
          importPath: "./FeatureFlow",
          sourceTestFile: "src/features/FeatureFlow.test.tsx",
          helperNames: [],
          usesWithin: false,
        },
      ],
    }));

    const result = await runGenerate(
      [fixture.recordingPath],
      fixture.outputDir,
    );
    const written = await readFile(testFilePath, "utf-8");

    expect(result.thrown).toBeUndefined();
    expect(written).toContain("import FeatureFlow from './FeatureFlow'");
  });
});
