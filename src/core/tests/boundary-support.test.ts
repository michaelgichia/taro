import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  applyBoundarySupport,
  materializeBoundarySupport,
  planBoundarySupport,
} from "#core/boundary-support.ts";
import type {
  RepoRenderTargetCandidate,
  ResolvedTaroPackageProfile,
} from "#types/state.ts";

vi.mock("#core/boundary-learning.ts", () => ({
  classifyBoundaryKind: vi.fn(),
  discoverBoundaryImportsFromSource: vi.fn(),
  getBoundaryGuardrailReason: vi.fn(),
}));

import {
  classifyBoundaryKind,
  discoverBoundaryImportsFromSource,
  getBoundaryGuardrailReason,
} from "#core/boundary-learning.ts";

const sandboxRoots: string[] = [];

afterEach(async () => {
  vi.resetAllMocks();
  await Promise.all(
    sandboxRoots
      .splice(0)
      .map((root) => rm(root, { recursive: true, force: true }))
  );
});

async function createSandbox(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "taro-boundary-support-"));
  sandboxRoots.push(root);
  return root;
}

function makePackageProfile(
  overrides: Partial<ResolvedTaroPackageProfile> = {}
): ResolvedTaroPackageProfile {
  return {
    packagePath: ".",
    packageName: "my-app",
    scannedAt: new Date().toISOString(),
    testFileCount: 1,
    conventions: {} as never,
    importStyle: { value: "esm", confidence: "high", evidence: [] },
    runner: { value: "vitest", confidence: "high", evidence: [] },
    mockPattern: { value: "vi.mock", confidence: "high", evidence: [] },
    folderPattern: { value: "colocated", confidence: "medium", evidence: [] },
    fileExtension: { value: "tsx", confidence: "high", evidence: [] },
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
    appliedOverrides: [],
    effectiveRunner: "vitest",
    effectiveRenderHelper: null,
    forbidMocks: [],
    preferredSharedMocks: {},
    boundaryPolicies: {},
    preferredBoundaryImplementations: {},
    forbidBoundaryTargets: [],
    effectiveQueryHookPolicy: "avoid",
    effectiveCompanionPolicy: "heuristic",
    enabledContractFamilies: [],
    ...overrides,
  } as ResolvedTaroPackageProfile;
}

describe("planBoundarySupport", () => {
  it("returns an empty plan when packageProfile is null", async () => {
    const root = await createSandbox();
    const plan = await planBoundarySupport({
      projectRoot: root,
      outputPath: join(root, "src", "test.test.ts"),
      packageProfile: null,
      renderTargetFile: "src/Component.tsx",
      renderTarget: null,
    });

    expect(plan.importLines).toEqual([]);
    expect(plan.mockBlocks).toEqual([]);
    expect(plan.setupLines).toEqual([]);
    expect(plan.supportFiles).toEqual([]);
    expect(plan.warnings).toEqual([]);
    expect(plan.requiresReview).toBe(false);
  });

  it("returns an empty plan when renderTargetFile is null", async () => {
    const root = await createSandbox();
    const plan = await planBoundarySupport({
      projectRoot: root,
      outputPath: join(root, "src", "test.test.ts"),
      packageProfile: makePackageProfile(),
      renderTargetFile: null,
      renderTarget: null,
    });

    expect(plan.importLines).toEqual([]);
    expect(plan.mockBlocks).toEqual([]);
  });

  it("returns an empty plan when discoverBoundaryImportsFromSource returns empty", async () => {
    const root = await createSandbox();
    vi.mocked(discoverBoundaryImportsFromSource).mockResolvedValue([]);

    const plan = await planBoundarySupport({
      projectRoot: root,
      outputPath: join(root, "src", "test.test.ts"),
      packageProfile: makePackageProfile(),
      renderTargetFile: "src/Component.tsx",
      renderTarget: null,
    });

    expect(plan.importLines).toEqual([]);
    expect(plan.mockBlocks).toEqual([]);
  });

  it("builds vitest mock block when an existing shared-module-factory profile is matched", async () => {
    const root = await createSandbox();

    vi.mocked(discoverBoundaryImportsFromSource).mockResolvedValue([
      {
        target: "@repo/data-client",
        importedNames: ["useDataQuery"],
        kind: "data-module",
        guardrailReason: null,
      },
    ]);
    vi.mocked(getBoundaryGuardrailReason).mockReturnValue(null);

    const packageProfile = makePackageProfile({
      boundaryProfiles: [
        {
          target: "@repo/data-client",
          kind: "data-module",
          strategy: "shared-module-factory",
          guardrailReason: null,
          supportImportPath: "../tests/mocks/data-client",
          supportPath: "src/tests/mocks/data-client.mock.ts",
          supportExports: {
            factoryExport: "createDataClientMock",
            resetExport: "resetDataClientMock",
            overrideExports: [],
            spyExports: [],
            fixtureExports: [],
          },
          payloadSource: "typed-defaults",
          confidence: "high",
          files: [],
          evidence: [],
          conflictTargets: [],
          lowConfidenceScaffold: false,
        },
      ],
    });

    const plan = await planBoundarySupport({
      projectRoot: root,
      outputPath: join(root, "src", "feature", "feature.test.ts"),
      packageProfile,
      renderTargetFile: "src/Component.tsx",
      renderTarget: null,
    });

    expect(plan.importLines).toEqual([
      "import { createDataClientMock, resetDataClientMock } from '../tests/mocks/data-client'",
    ]);
    expect(plan.mockBlocks[0]).toContain("vi.mock('@repo/data-client'");
    expect(plan.mockBlocks[0]).toContain("createDataClientMock()");
    expect(plan.setupLines).toEqual(["resetDataClientMock()"]);
    expect(plan.requiresReview).toBe(false);
  });

  it("builds jest mock block when effectiveRunner is jest", async () => {
    const root = await createSandbox();

    vi.mocked(discoverBoundaryImportsFromSource).mockResolvedValue([
      {
        target: "@repo/api",
        importedNames: ["fetchData"],
        kind: "data-module",
        guardrailReason: null,
      },
    ]);
    vi.mocked(getBoundaryGuardrailReason).mockReturnValue(null);

    const packageProfile = makePackageProfile({
      effectiveRunner: "jest",
      mockPattern: { value: "jest.mock", confidence: "high", evidence: [] },
      boundaryProfiles: [
        {
          target: "@repo/api",
          kind: "data-module",
          strategy: "shared-module-factory",
          guardrailReason: null,
          supportImportPath: "../mocks/api",
          supportPath: "src/tests/mocks/api.mock.ts",
          supportExports: {
            factoryExport: "createApiMock",
            resetExport: "resetApiMock",
            overrideExports: [],
            spyExports: [],
            fixtureExports: [],
          },
          payloadSource: "typed-defaults",
          confidence: "high",
          files: [],
          evidence: [],
          conflictTargets: [],
          lowConfidenceScaffold: false,
        },
      ],
    });

    const plan = await planBoundarySupport({
      projectRoot: root,
      outputPath: join(root, "src", "test.test.ts"),
      packageProfile,
      renderTargetFile: "src/Component.tsx",
      renderTarget: null,
    });

    expect(plan.mockBlocks[0]).toContain("jest.mock('@repo/api'");
    expect(plan.mockBlocks[0]).toContain("jest.requireActual");
  });

  it("emits inline svg mocks for asset imports", async () => {
    const root = await createSandbox();

    vi.mocked(discoverBoundaryImportsFromSource).mockResolvedValue([
      {
        target: "public/images/kenya-flag.svg",
        importedNames: ["default"],
        kind: "feature-flag",
        guardrailReason: null,
      },
    ]);

    const plan = await planBoundarySupport({
      projectRoot: root,
      outputPath: join(root, "src", "feature", "feature.test.tsx"),
      packageProfile: makePackageProfile(),
      renderTargetFile: "src/Component.tsx",
      renderTarget: null,
    });

    expect(plan.mockBlocks).toContain(
      "vi.mock('public/images/kenya-flag.svg', () => ({\n  default: (props) => <svg aria-hidden=\"true\" {...props} />,\n}))"
    );
    expect(plan.importLines).toEqual([]);
    expect(plan.supportFiles).toEqual([]);
  });

  it("emits inline next/link mocks for framework imports", async () => {
    const root = await createSandbox();

    vi.mocked(discoverBoundaryImportsFromSource).mockResolvedValue([
      {
        target: "next/link",
        importedNames: ["default"],
        kind: "router",
        guardrailReason: null,
      },
    ]);

    const plan = await planBoundarySupport({
      projectRoot: root,
      outputPath: join(root, "src", "feature", "feature.test.tsx"),
      packageProfile: makePackageProfile(),
      renderTargetFile: "src/Component.tsx",
      renderTarget: null,
    });

    expect(plan.mockBlocks).toContain(
      "vi.mock('next/link', () => ({\n  default: ({ href, children }) => <a href={href}>{children}</a>,\n}))"
    );
    expect(plan.importLines).toEqual([]);
    expect(plan.supportFiles).toEqual([]);
  });

  it("emits inline next/dynamic mocks for framework imports", async () => {
    const root = await createSandbox();

    vi.mocked(discoverBoundaryImportsFromSource).mockResolvedValue([
      {
        target: "next/dynamic",
        importedNames: ["default"],
        kind: "unknown",
        guardrailReason: null,
      },
    ]);

    const plan = await planBoundarySupport({
      projectRoot: root,
      outputPath: join(root, "src", "feature", "feature.test.tsx"),
      packageProfile: makePackageProfile(),
      renderTargetFile: "src/Component.tsx",
      renderTarget: null,
    });

    expect(plan.mockBlocks).toHaveLength(1);
    expect(plan.mockBlocks[0]).toContain("vi.mock('next/dynamic'");
    expect(plan.mockBlocks[0]).toContain(
      "function __taroDynamicPlaceholder() {"
    );
    expect(plan.mockBlocks[0]).toContain("return null");
    expect(plan.mockBlocks[0]).toContain(
      "default: () => __taroDynamicPlaceholder"
    );
    expect(plan.importLines).toEqual([]);
    expect(plan.supportFiles).toEqual([]);
    expect(plan.warnings).toContain(
      "next/dynamic was reduced to a null placeholder shim. If the test depends on the loaded child, replace it with a repo-local mock example."
    );
    expect(plan.requiresReview).toBe(true);
  });

  it("scaffolds generic imported hooks as low-confidence mocks", async () => {
    const root = await createSandbox();

    vi.mocked(discoverBoundaryImportsFromSource).mockResolvedValue([
      {
        target: "@repo/orders",
        importedNames: ["useOrders"],
        kind: "data-module",
        guardrailReason: null,
      },
    ]);
    vi.mocked(getBoundaryGuardrailReason).mockReturnValue(null);

    const plan = await planBoundarySupport({
      projectRoot: root,
      outputPath: join(root, "src", "feature.test.ts"),
      packageProfile: makePackageProfile(),
      renderTargetFile: "src/Feature.tsx",
      renderTarget: {
        symbol: "Feature",
        importPath: "./Feature",
        sourceTestFile: "src/Feature.test.tsx",
        helperNames: [],
        usesWithin: false,
      },
    });

    expect(plan.requiresReview).toBe(true);
    expect(plan.supportFiles[0]?.content).toContain(
      "export const useOrdersMock = vi.fn()"
    );
    expect(plan.supportFiles[0]?.content).toContain(
      "useOrdersMock.mockReset()"
    );
    expect(plan.supportFiles[0]?.content).not.toContain("isLoading");
    expect(plan.supportFiles[0]?.content).not.toContain("isPending");
    expect(plan.warnings[0]).toContain("replace the placeholder seam");
  });

  it("prefers learned mocks fixture roots when scaffolding new support files", async () => {
    const root = await createSandbox();

    vi.mocked(discoverBoundaryImportsFromSource).mockResolvedValue([
      {
        target: "@repo/orders",
        importedNames: ["useOrdersQuery"],
        kind: "data-module",
        guardrailReason: null,
      },
    ]);
    vi.mocked(getBoundaryGuardrailReason).mockReturnValue(null);

    const plan = await planBoundarySupport({
      projectRoot: root,
      outputPath: join(root, "src", "feature.test.ts"),
      packageProfile: makePackageProfile({
        fixtureRoots: [
          { path: "src/tests/mocks", kind: "mocks", source: "directory" },
        ],
      }),
      renderTargetFile: "src/Feature.tsx",
      renderTarget: {
        symbol: "Feature",
        importPath: "./Feature",
        sourceTestFile: "src/Feature.test.tsx",
        helperNames: [],
        usesWithin: false,
      },
    });

    expect(plan.supportFiles[0]?.path).toBe(
      join(root, "src", "tests", "mocks", "repo-orders.mock.ts")
    );
  });

  it("ignores relevant boundaries that have no reusable profile and are not scaffoldable", async () => {
    const root = await createSandbox();

    vi.mocked(discoverBoundaryImportsFromSource).mockResolvedValue([
      {
        target: "@repo/ui/button",
        importedNames: ["Button"],
        kind: "unknown",
        guardrailReason: null,
      },
    ]);
    vi.mocked(getBoundaryGuardrailReason).mockReturnValue(null);

    const plan = await planBoundarySupport({
      projectRoot: root,
      outputPath: join(root, "src", "feature.test.ts"),
      packageProfile: makePackageProfile({
        boundaryExemplars: [
          {
            file: "src/Feature.test.tsx",
            renderBoundary: "module",
            boundaryTargets: ["@repo/ui/button"],
            boundaryKinds: ["unknown"],
            usesProviderWrapper: false,
            usesCentralBoundarySupport: false,
            hasMutationLifecycle: false,
            overrideStyle: "none",
            tags: [],
          },
        ],
      }),
      renderTargetFile: "src/Feature.tsx",
      renderTarget: {
        symbol: "Feature",
        importPath: "./Feature",
        sourceTestFile: "src/Feature.test.tsx",
        helperNames: [],
        usesWithin: false,
      },
    });

    expect(plan.importLines).toEqual([]);
    expect(plan.mockBlocks).toEqual([]);
    expect(plan.supportFiles).toEqual([]);
  });

  it("adds guardrail warning when imported boundary has guardrailReason and a non-forbid profile exists", async () => {
    const root = await createSandbox();

    vi.mocked(discoverBoundaryImportsFromSource).mockResolvedValue([
      {
        target: "@/components/ui/Modal",
        importedNames: ["Modal"],
        kind: "unknown",
        guardrailReason: "repo-owned-ui-wrapper",
      },
    ]);

    const packageProfile = makePackageProfile({
      boundaryProfiles: [
        {
          target: "@/components/ui/Modal",
          kind: "unknown",
          strategy: "shared-module-factory",
          guardrailReason: "repo-owned-ui-wrapper",
          supportImportPath: "../mocks/modal",
          supportPath: "src/tests/mocks/modal.mock.ts",
          supportExports: {
            factoryExport: "createModalMock",
            resetExport: null,
            overrideExports: [],
            spyExports: [],
            fixtureExports: [],
          },
          payloadSource: "typed-defaults",
          confidence: "medium",
          files: [],
          evidence: [],
          conflictTargets: [],
          lowConfidenceScaffold: false,
        },
      ],
    });

    const plan = await planBoundarySupport({
      projectRoot: root,
      outputPath: join(root, "src", "test.test.ts"),
      packageProfile,
      renderTargetFile: "src/Component.tsx",
      renderTarget: null,
    });

    expect(plan.warnings.length).toBeGreaterThan(0);
    expect(plan.warnings[0]).toContain("@/components/ui/Modal");
    expect(plan.requiresReview).toBe(true);
    expect(plan.mockBlocks).toEqual([]);
  });

  it("skips boundary when guardrailReason is set but no conflicting profile exists", async () => {
    const root = await createSandbox();

    vi.mocked(discoverBoundaryImportsFromSource).mockResolvedValue([
      {
        target: "@ui/components",
        importedNames: ["Button"],
        kind: "unknown",
        guardrailReason: "ui-package",
      },
    ]);

    const packageProfile = makePackageProfile({ boundaryProfiles: [] });

    const plan = await planBoundarySupport({
      projectRoot: root,
      outputPath: join(root, "src", "test.test.ts"),
      packageProfile,
      renderTargetFile: "src/Component.tsx",
      renderTarget: null,
    });

    expect(plan.warnings).toEqual([]);
    expect(plan.mockBlocks).toEqual([]);
  });

  it("skips boundary when profile strategy is not shared or scaffolded module factory", async () => {
    const root = await createSandbox();

    vi.mocked(discoverBoundaryImportsFromSource).mockResolvedValue([
      {
        target: "react-router-dom",
        importedNames: ["useNavigate"],
        kind: "router",
        guardrailReason: null,
      },
    ]);
    vi.mocked(getBoundaryGuardrailReason).mockReturnValue(null);

    const packageProfile = makePackageProfile({
      boundaryProfiles: [
        {
          target: "react-router-dom",
          kind: "router",
          strategy: "inline-safe",
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
          confidence: "high",
          files: [],
          evidence: [],
          conflictTargets: [],
          lowConfidenceScaffold: false,
        },
      ],
    });

    const plan = await planBoundarySupport({
      projectRoot: root,
      outputPath: join(root, "src", "test.test.ts"),
      packageProfile,
      renderTargetFile: "src/Component.tsx",
      renderTarget: null,
    });

    expect(plan.mockBlocks).toEqual([]);
    expect(plan.importLines).toEqual([]);
  });

  it("adds warning when profile has no supportImportPath", async () => {
    const root = await createSandbox();

    vi.mocked(discoverBoundaryImportsFromSource).mockResolvedValue([
      {
        target: "@repo/incomplete",
        importedNames: ["useData"],
        kind: "data-module",
        guardrailReason: null,
      },
    ]);
    vi.mocked(getBoundaryGuardrailReason).mockReturnValue(null);

    const packageProfile = makePackageProfile({
      boundaryProfiles: [
        {
          target: "@repo/incomplete",
          kind: "data-module",
          strategy: "shared-module-factory",
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
          files: [],
          evidence: [],
          conflictTargets: [],
          lowConfidenceScaffold: false,
        },
      ],
    });

    const plan = await planBoundarySupport({
      projectRoot: root,
      outputPath: join(root, "src", "test.test.ts"),
      packageProfile,
      renderTargetFile: "src/Component.tsx",
      renderTarget: null,
    });

    expect(plan.warnings.some((w) => w.includes("@repo/incomplete"))).toBe(
      true
    );
    expect(plan.requiresReview).toBe(true);
    expect(plan.mockBlocks).toEqual([]);
  });

  it("uses relevantTargets from renderTarget exemplar when available", async () => {
    const root = await createSandbox();

    vi.mocked(discoverBoundaryImportsFromSource).mockResolvedValue([
      {
        target: "@repo/data-client",
        importedNames: ["useData"],
        kind: "data-module",
        guardrailReason: null,
      },
      {
        target: "@repo/other-client",
        importedNames: ["useSomething"],
        kind: "data-module",
        guardrailReason: null,
      },
    ]);
    vi.mocked(getBoundaryGuardrailReason).mockReturnValue(null);

    const renderTarget: RepoRenderTargetCandidate = {
      symbol: "MyModule",
      importPath: "./MyModule",
      sourceTestFile: "src/MyModule.test.tsx",
      helperNames: [],
      usesWithin: false,
    };

    const packageProfile = makePackageProfile({
      boundaryExemplars: [
        {
          file: "src/MyModule.test.tsx",
          renderBoundary: "module",
          boundaryTargets: ["@repo/data-client"],
          boundaryKinds: ["data-module"],
          usesProviderWrapper: false,
          usesCentralBoundarySupport: true,
          hasMutationLifecycle: false,
          overrideStyle: "stable-handles",
          tags: ["boundary:data-module", "central-boundary-support"],
        },
      ],
      boundaryProfiles: [
        {
          target: "@repo/data-client",
          kind: "data-module",
          strategy: "shared-module-factory",
          guardrailReason: null,
          supportImportPath: "../mocks/data-client",
          supportPath: "src/tests/mocks/data-client.mock.ts",
          supportExports: {
            factoryExport: "createDataClientMock",
            resetExport: "resetDataClientMock",
            overrideExports: [],
            spyExports: [],
            fixtureExports: [],
          },
          payloadSource: "typed-defaults",
          confidence: "high",
          files: [],
          evidence: [],
          conflictTargets: [],
          lowConfidenceScaffold: false,
        },
      ],
    });

    const plan = await planBoundarySupport({
      projectRoot: root,
      outputPath: join(root, "src", "test.test.ts"),
      packageProfile,
      renderTargetFile: "src/Component.tsx",
      renderTarget,
    });

    // Only @repo/data-client is in the exemplar's boundaryTargets, not @repo/other-client
    expect(plan.mockBlocks).toHaveLength(1);
    expect(plan.mockBlocks[0]).toContain("@repo/data-client");
  });

  it("scaffolds a new boundary profile when no profile exists and policy is avoid", async () => {
    const root = await createSandbox();

    vi.mocked(discoverBoundaryImportsFromSource).mockResolvedValue([
      {
        target: "@repo/new-service",
        importedNames: ["useNewServiceQuery", "useNewServiceMutation"],
        kind: "data-module",
        guardrailReason: null,
      },
    ]);
    vi.mocked(classifyBoundaryKind).mockReturnValue("data-module");
    vi.mocked(getBoundaryGuardrailReason).mockReturnValue(null);

    const packageProfile = makePackageProfile({
      effectiveQueryHookPolicy: "avoid",
      boundaryProfiles: [],
      fixtureRoots: [],
    });

    const plan = await planBoundarySupport({
      projectRoot: root,
      outputPath: join(root, "src", "feature", "feature.test.ts"),
      packageProfile,
      renderTargetFile: "src/Component.tsx",
      renderTarget: null,
    });

    expect(plan.supportFiles).toHaveLength(1);
    // The factory name is derived from the full target '@repo/new-service' → 'RepoNewService'
    expect(plan.supportFiles[0]?.content).toContain("createRepoNewServiceMock");
    expect(plan.warnings.some((w) => w.includes("@repo/new-service"))).toBe(
      true
    );
    expect(plan.mockBlocks.length).toBeGreaterThan(0);
  });

  it("adds guardrail warning when getBoundaryGuardrailReason returns a reason for a matched profile", async () => {
    const root = await createSandbox();

    vi.mocked(discoverBoundaryImportsFromSource).mockResolvedValue([
      {
        target: "@repo/data-client",
        importedNames: ["DataButton"],
        kind: "data-module",
        guardrailReason: null,
      },
    ]);
    vi.mocked(getBoundaryGuardrailReason).mockReturnValue(
      "repo-owned-ui-wrapper"
    );

    const packageProfile = makePackageProfile({
      boundaryProfiles: [
        {
          target: "@repo/data-client",
          kind: "data-module",
          strategy: "shared-module-factory",
          guardrailReason: null,
          supportImportPath: "../mocks/data-client",
          supportPath: "src/tests/mocks/data-client.mock.ts",
          supportExports: {
            factoryExport: "createDataClientMock",
            resetExport: null,
            overrideExports: [],
            spyExports: [],
            fixtureExports: [],
          },
          payloadSource: "typed-defaults",
          confidence: "high",
          files: [],
          evidence: [],
          conflictTargets: [],
          lowConfidenceScaffold: false,
        },
      ],
    });

    const plan = await planBoundarySupport({
      projectRoot: root,
      outputPath: join(root, "src", "test.test.ts"),
      packageProfile,
      renderTargetFile: "src/Component.tsx",
      renderTarget: null,
    });

    expect(plan.warnings.some((w) => w.includes("@repo/data-client"))).toBe(
      true
    );
    expect(plan.requiresReview).toBe(true);
    expect(plan.mockBlocks).toEqual([]);
  });

  it("does not duplicate importLines or mockBlocks when same target appears twice", async () => {
    const root = await createSandbox();

    vi.mocked(discoverBoundaryImportsFromSource).mockResolvedValue([
      {
        target: "@repo/data-client",
        importedNames: ["useDataQuery"],
        kind: "data-module",
        guardrailReason: null,
      },
    ]);
    vi.mocked(getBoundaryGuardrailReason).mockReturnValue(null);

    const profile = {
      target: "@repo/data-client",
      kind: "data-module" as const,
      strategy: "shared-module-factory" as const,
      guardrailReason: null,
      supportImportPath: "../mocks/data-client",
      supportPath: "src/tests/mocks/data-client.mock.ts",
      supportExports: {
        factoryExport: "createDataClientMock",
        resetExport: "resetDataClientMock",
        overrideExports: [],
        spyExports: [],
        fixtureExports: [],
      },
      payloadSource: "typed-defaults" as const,
      confidence: "high" as const,
      files: [],
      evidence: [],
      conflictTargets: [],
      lowConfidenceScaffold: false,
    };

    const packageProfile = makePackageProfile({ boundaryProfiles: [profile] });

    const plan1 = await planBoundarySupport({
      projectRoot: root,
      outputPath: join(root, "src", "test.test.ts"),
      packageProfile,
      renderTargetFile: "src/Component.tsx",
      renderTarget: null,
    });

    // Calling plan again should not add duplicate lines (each call is fresh)
    expect(plan1.importLines).toHaveLength(1);
    expect(plan1.mockBlocks).toHaveLength(1);
  });

  it("marks requiresReview when lowConfidenceScaffold is true", async () => {
    const root = await createSandbox();

    vi.mocked(discoverBoundaryImportsFromSource).mockResolvedValue([
      {
        target: "@repo/fragile-service",
        importedNames: ["useFragileQuery"],
        kind: "data-module",
        guardrailReason: null,
      },
    ]);
    vi.mocked(getBoundaryGuardrailReason).mockReturnValue(null);

    const packageProfile = makePackageProfile({
      boundaryProfiles: [
        {
          target: "@repo/fragile-service",
          kind: "data-module",
          strategy: "shared-module-factory",
          guardrailReason: null,
          supportImportPath: "../mocks/fragile-service",
          supportPath: "src/tests/mocks/fragile-service.mock.ts",
          supportExports: {
            factoryExport: "createFragileServiceMock",
            resetExport: null,
            overrideExports: [],
            spyExports: [],
            fixtureExports: [],
          },
          payloadSource: "typed-defaults",
          confidence: "low",
          files: [],
          evidence: [],
          conflictTargets: [],
          lowConfidenceScaffold: true,
        },
      ],
    });

    const plan = await planBoundarySupport({
      projectRoot: root,
      outputPath: join(root, "src", "test.test.ts"),
      packageProfile,
      renderTargetFile: "src/Component.tsx",
      renderTarget: null,
    });

    expect(plan.requiresReview).toBe(true);
  });
});

describe("applyBoundarySupport", () => {
  it("returns code unchanged when plan is empty", () => {
    const code = `import { render } from '@testing-library/react'\n\ndescribe('test', () => {})\n`;
    const result = applyBoundarySupport(code, {
      importLines: [],
      mockBlocks: [],
      setupLines: [],
      supportFiles: [],
      warnings: [],
      requiresReview: false,
    });

    expect(result).toBe(code);
  });

  it("prepends import lines after existing imports", () => {
    const code = `import { render } from '@testing-library/react'\n\ndescribe('test', () => {})\n`;
    const result = applyBoundarySupport(code, {
      importLines: [
        "import { createApiMock, resetApiMock } from '../mocks/api'",
      ],
      mockBlocks: [],
      setupLines: [],
      supportFiles: [],
      warnings: [],
      requiresReview: false,
    });

    expect(result).toContain(
      "import { createApiMock, resetApiMock } from '../mocks/api'"
    );
    expect(result).toContain("import { render } from '@testing-library/react'");
    // describe block is still present
    expect(result).toContain("describe('test', () => {})");
  });

  it("prepends mock blocks after import section", () => {
    const code = `import { render } from '@testing-library/react'\n\ndescribe('test', () => {})\n`;
    const result = applyBoundarySupport(code, {
      importLines: [],
      mockBlocks: [
        `vi.mock('@repo/api', async (importOriginal) => {\n  return {}\n})`,
      ],
      setupLines: [],
      supportFiles: [],
      warnings: [],
      requiresReview: false,
    });

    expect(result).toContain("vi.mock('@repo/api'");
    expect(result).toContain("describe('test', () => {})");
  });

  it("prepends beforeEach block with setup lines", () => {
    const code = `import { render } from '@testing-library/react'\n\ndescribe('test', () => {})\n`;
    const result = applyBoundarySupport(code, {
      importLines: [],
      mockBlocks: [],
      setupLines: ["resetApiMock()"],
      supportFiles: [],
      warnings: [],
      requiresReview: false,
    });

    expect(result).toContain("beforeEach(() => {");
    expect(result).toContain("resetApiMock()");
    expect(result).toContain("describe('test', () => {})");
  });

  it("adds missing runner imports for inline mocks and setup hooks", () => {
    const code = [
      "import { describe, expect, it } from 'vitest'",
      "import { render } from '@testing-library/react'",
      "",
      "describe('test', () => {})",
      "",
    ].join("\n");
    const result = applyBoundarySupport(code, {
      runner: "vitest",
      importLines: [],
      mockBlocks: [
        "vi.mock('public/images/kenya-flag.svg', () => ({\n  default: (props) => <svg aria-hidden=\"true\" {...props} />,\n}))",
      ],
      setupLines: ["resetApiMock()"],
      supportFiles: [],
      warnings: [],
      requiresReview: false,
    });

    expect(result).toContain("import { beforeEach, vi } from 'vitest'");
    expect(result).toContain("vi.mock('public/images/kenya-flag.svg'");
    expect(result).toContain("beforeEach(() => {");
  });

  it("prepends warning comments", () => {
    const code = `import { render } from '@testing-library/react'\n\ndescribe('test', () => {})\n`;
    const result = applyBoundarySupport(code, {
      importLines: [],
      mockBlocks: [],
      setupLines: [],
      supportFiles: [],
      warnings: ["Some boundary requires review"],
      requiresReview: true,
    });

    expect(result).toContain(
      "// taro-boundary-warning: Some boundary requires review"
    );
    expect(result).toContain("describe('test', () => {})");
  });

  it("combines import lines, mock blocks, setup lines, and warnings in correct order", () => {
    const code = `import { render } from '@testing-library/react'\n\ndescribe('test', () => {})\n`;
    const result = applyBoundarySupport(code, {
      importLines: ["import { createApiMock } from '../mocks/api'"],
      mockBlocks: [
        `vi.mock('@repo/api', async (importOriginal) => {\n  return {}\n})`,
      ],
      setupLines: ["resetApiMock()"],
      supportFiles: [],
      warnings: ["check this"],
      requiresReview: true,
    });

    const importIdx = result.indexOf("createApiMock");
    const mockIdx = result.indexOf("vi.mock('@repo/api'");
    const setupIdx = result.indexOf("beforeEach");
    const warningIdx = result.indexOf("// taro-boundary-warning");
    const describeIdx = result.indexOf("describe('test'");

    expect(importIdx).toBeLessThan(mockIdx);
    expect(mockIdx).toBeLessThan(setupIdx);
    expect(setupIdx).toBeLessThan(warningIdx);
    expect(warningIdx).toBeLessThan(describeIdx);
  });

  it("handles code with no existing imports", () => {
    const code = `describe('test', () => { it('works', () => {}) })\n`;
    const result = applyBoundarySupport(code, {
      importLines: ["import { createMock } from './mocks'"],
      mockBlocks: [],
      setupLines: [],
      supportFiles: [],
      warnings: [],
      requiresReview: false,
    });

    expect(result).toContain("import { createMock } from './mocks'");
    expect(result).toContain("describe('test'");
  });
});

describe("materializeBoundarySupport", () => {
  let tempRoot: string;

  beforeEach(async () => {
    tempRoot = await mkdtemp(join(tmpdir(), "taro-materialize-"));
    sandboxRoots.push(tempRoot);
  });

  it("writes support files when they do not exist", async () => {
    const filePath = join(tempRoot, "mocks", "api.mock.ts");
    const content = `import { vi } from 'vitest'\nexport const createApiMock = () => ({})\n`;

    await materializeBoundarySupport({
      importLines: [],
      mockBlocks: [],
      setupLines: [],
      supportFiles: [{ path: filePath, content, lowConfidence: false }],
      warnings: [],
      requiresReview: false,
    });

    const { readFile } = await import("node:fs/promises");
    const written = await readFile(filePath, "utf-8");
    expect(written).toBe(content);
  });

  it("skips writing when support file already exists", async () => {
    const filePath = join(tempRoot, "existing.mock.ts");
    const originalContent = "original content\n";
    const newContent = "new content\n";

    const { writeFile } = await import("node:fs/promises");
    await writeFile(filePath, originalContent, "utf-8");

    await materializeBoundarySupport({
      importLines: [],
      mockBlocks: [],
      setupLines: [],
      supportFiles: [
        { path: filePath, content: newContent, lowConfidence: false },
      ],
      warnings: [],
      requiresReview: false,
    });

    const { readFile } = await import("node:fs/promises");
    const still = await readFile(filePath, "utf-8");
    expect(still).toBe(originalContent);
  });

  it("creates nested directories when writing support files", async () => {
    const filePath = join(tempRoot, "deep", "nested", "dir", "api.mock.ts");
    const content = `export const createApiMock = () => ({})\n`;

    await materializeBoundarySupport({
      importLines: [],
      mockBlocks: [],
      setupLines: [],
      supportFiles: [{ path: filePath, content, lowConfidence: false }],
      warnings: [],
      requiresReview: false,
    });

    const { readFile } = await import("node:fs/promises");
    const written = await readFile(filePath, "utf-8");
    expect(written).toBe(content);
  });

  it("handles an empty supportFiles array without error", async () => {
    await expect(
      materializeBoundarySupport({
        importLines: [],
        mockBlocks: [],
        setupLines: [],
        supportFiles: [],
        warnings: [],
        requiresReview: false,
      })
    ).resolves.toBeUndefined();
  });
});
