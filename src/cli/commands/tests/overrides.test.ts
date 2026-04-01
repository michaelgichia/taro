import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  cwdMock,
  writeFileMock,
  runLoadOrBootstrapStateWorkflowMock,
  ensureProjectStateDirMock,
  findReadableProjectStatePathMock,
  getProjectStatePathMock,
  logMock,
} = vi.hoisted(() => ({
  cwdMock: vi.fn(() => "/repo"),
  writeFileMock: vi.fn(),
  runLoadOrBootstrapStateWorkflowMock: vi.fn(),
  ensureProjectStateDirMock: vi.fn(),
  findReadableProjectStatePathMock: vi.fn(),
  getProjectStatePathMock: vi.fn(
    (projectRoot: string, ...segments: string[]) => {
      return `${projectRoot}/.taro/${segments.join("/")}`;
    }
  ),
  logMock: vi.fn(),
}));

vi.mock("node:process", () => ({ cwd: cwdMock }));

vi.mock("node:fs/promises", () => ({ writeFile: writeFileMock }));

vi.mock("#core/state.ts", () => ({
  runLoadOrBootstrapStateWorkflow: runLoadOrBootstrapStateWorkflowMock,
}));

vi.mock("#project-state.ts", () => ({
  ensureProjectStateDir: ensureProjectStateDirMock,
  findReadableProjectStatePath: findReadableProjectStatePathMock,
  getProjectStatePath: getProjectStatePathMock,
}));

import {
  createOverridesCommand,
  overridesCommandInternals,
} from "#cli/commands/overrides.ts";

function createBoundaryProfile(overrides: Record<string, unknown> = {}) {
  return {
    target: "@/features/example/api",
    kind: "data-module",
    strategy: "real-runtime",
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
    payloadSource: "unknown",
    confidence: "low",
    files: ["src/example.test.tsx"],
    evidence: [],
    conflictTargets: [],
    lowConfidenceScaffold: false,
    ...overrides,
  };
}

function createPackageProfile(overrides: Record<string, unknown> = {}) {
  return {
    packagePath: ".",
    packageName: "@repo/app",
    scannedAt: "2026-03-18T20:00:00.000Z",
    testFileCount: 1,
    conventions: {} as any,
    importStyle: { value: "esm", confidence: "high", evidence: [] },
    runner: { value: "vitest", confidence: "high", evidence: [] },
    jestDomSetup: { value: "global-setup", confidence: "high", evidence: [] },
    mockPattern: { value: "vi.mock", confidence: "high", evidence: [] },
    folderPattern: { value: "mixed", confidence: "high", evidence: [] },
    fileExtension: { value: "ts", confidence: "high", evidence: [] },
    renderHelpers: [],
    providerWrappers: [],
    renderTargets: [],
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
    playwrightAuth: null,
    warnings: [],
    ...overrides,
  };
}

function createState(packages: Record<string, unknown>) {
  return {
    version: 1,
    meta: {
      createdAt: "2026-03-18T20:00:00.000Z",
      updatedAt: "2026-03-18T20:00:00.000Z",
      taroVersion: "1.5.1",
    },
    packages,
    mockStore: { rootDir: null, importHint: null, resources: [] },
    generatedTests: [],
  };
}

describe("overridesCommandInternals.buildSuggestedOverrides", () => {
  it("scaffolds only explicit runner and high-confidence boundary policy from learned state", () => {
    const overrides = overridesCommandInternals.buildSuggestedOverrides(
      createState({
        ".": createPackageProfile({
          renderHelpers: [
            {
              name: "renderDashboard",
              importPath: "@/tests/renderDashboard",
              importKind: "named",
              sourceTestFile: "src/tests/example.test.tsx",
              usageCount: 3,
              usesWithin: true,
            },
          ],
          boundaryProfiles: [
            createBoundaryProfile({
              target: "@/components/library/AddButton",
              kind: "local-child",
              strategy: "forbid",
              confidence: "high",
              guardrailReason: "repo-owned-ui-wrapper",
            }),
            createBoundaryProfile({
              target: "next/navigation",
              kind: "router",
              strategy: "inline-safe",
              files: ["src/a.test.tsx", "src/b.test.tsx"],
            }),
            createBoundaryProfile({
              target: "@/features/orders/api",
              strategy: "shared-module-factory",
              confidence: "high",
              supportImportPath: "@/tests/mocks/orders-api",
              supportPath: "src/tests/mocks/orders-api.ts",
            }),
            createBoundaryProfile({
              target: "@digitax/data-layer",
              strategy: "real-runtime",
              files: ["src/a.test.tsx", "src/b.test.tsx"],
            }),
          ],
        }),
      }) as any
    );

    expect(overrides).toEqual({
      packages: {
        ".": {
          runner: "vitest",
          boundaryPolicies: {
            "@/features/orders/api": "shared-module-factory",
          },
          preferredBoundaryImplementations: {
            "@/features/orders/api": "@/tests/mocks/orders-api",
          },
          forbidBoundaryTargets: ["@/components/library/AddButton"],
        },
      },
    });
  });
});

describe("createOverridesCommand", () => {
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    logSpy = vi.spyOn(console, "log").mockImplementation(logMock);

    ensureProjectStateDirMock.mockResolvedValue("/repo/.taro");
    findReadableProjectStatePathMock.mockResolvedValue(null);
    runLoadOrBootstrapStateWorkflowMock.mockResolvedValue({
      state: createState({ ".": createPackageProfile() }),
      summary: { packageCount: 1 },
    });
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  it("writes a starter .taro/overrides.json scaffold for the current working directory", async () => {
    const command = createOverridesCommand();
    await command.parseAsync([], { from: "user" });

    expect(cwdMock).toHaveBeenCalled();
    expect(runLoadOrBootstrapStateWorkflowMock).toHaveBeenCalledWith("/repo");
    expect(ensureProjectStateDirMock).toHaveBeenCalledWith("/repo");
    expect(writeFileMock).toHaveBeenCalledWith(
      "/repo/.taro/overrides.json",
      expect.stringContaining('"runner": "vitest"'),
      "utf-8"
    );

    const output = logMock.mock.calls
      .map(([message]) => String(message))
      .join("\n");
    expect(output).toContain("Wrote /repo/.taro/overrides.json");
    expect(output).toContain(
      "Scaffolded .taro/overrides.json for 1 package(s)"
    );
  });

  it("refuses to overwrite an existing .taro/overrides.json scaffold without --force", async () => {
    findReadableProjectStatePathMock.mockResolvedValue(
      "/repo/.taro/overrides.json"
    );

    const command = createOverridesCommand();
    await command.parseAsync([], { from: "user" });

    expect(writeFileMock).not.toHaveBeenCalled();

    const output = logMock.mock.calls
      .map(([message]) => String(message))
      .join("\n");
    expect(output).toContain(".taro/overrides.json already exists");
    expect(output).toContain("--force");
  });
});
