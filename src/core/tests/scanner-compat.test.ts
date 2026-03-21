import { beforeEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_CONVENTIONS } from "#types/conventions.ts";

const {
  readFileMock,
  initTaroStateMock,
  readTaroStateMock,
  refreshTaroStateMock,
  writeTaroStateMock,
  findReadableProjectStatePathMock,
  findRepoFallbackPackageProfileMock,
} = vi.hoisted(() => ({
  readFileMock: vi.fn(),
  initTaroStateMock: vi.fn(),
  readTaroStateMock: vi.fn(),
  refreshTaroStateMock: vi.fn(),
  writeTaroStateMock: vi.fn(),
  findReadableProjectStatePathMock: vi.fn(),
  findRepoFallbackPackageProfileMock: vi.fn(),
}));

vi.mock("node:fs/promises", () => ({ readFile: readFileMock }));

vi.mock("#core/state.ts", () => ({
  initTaroState: initTaroStateMock,
  readTaroState: readTaroStateMock,
  refreshTaroState: refreshTaroStateMock,
  writeTaroState: writeTaroStateMock,
  findRepoFallbackPackageProfile: findRepoFallbackPackageProfileMock,
}));

vi.mock("#project-state.ts", () => ({
  findReadableProjectStatePath: findReadableProjectStatePathMock,
}));

import {
  mergeConventions,
  persistConventions,
  readConventions,
  scanConventions,
} from "#core/scanner.ts";

describe("scanner compatibility helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("reads conventions from the fallback package profile in state", async () => {
    const conventions = {
      ...DEFAULT_CONVENTIONS,
      projectRoot: "/repo",
      scannedAt: "2026-03-16T12:00:00.000Z",
    };
    readTaroStateMock.mockResolvedValue({ packages: { ".": {} } });
    findRepoFallbackPackageProfileMock.mockReturnValue({ conventions });

    await expect(readConventions("/repo")).resolves.toEqual(conventions);
    expect(findReadableProjectStatePathMock).not.toHaveBeenCalled();
  });

  it("falls back to compatibility conventions.json and returns null for invalid JSON", async () => {
    readTaroStateMock.mockResolvedValue(null);
    findReadableProjectStatePathMock.mockResolvedValue(
      "/repo/.taro/conventions.json"
    );
    readFileMock.mockResolvedValueOnce(
      JSON.stringify({
        ...DEFAULT_CONVENTIONS,
        projectRoot: "/repo",
        scannedAt: "2026-03-16T12:00:00.000Z",
      })
    );

    await expect(readConventions("/repo")).resolves.toEqual(
      expect.objectContaining({ projectRoot: "/repo" })
    );

    readFileMock.mockRejectedValueOnce(new Error("bad file"));
    await expect(readConventions("/repo")).resolves.toBeNull();
  });

  it("returns null when neither state nor compatibility conventions.json exists", async () => {
    readTaroStateMock.mockResolvedValue(null);
    findReadableProjectStatePathMock.mockResolvedValue(null);

    await expect(readConventions("/repo")).resolves.toBeNull();
    expect(readFileMock).not.toHaveBeenCalled();
  });

  it("returns null when state exists but no fallback package conventions are available", async () => {
    readTaroStateMock.mockResolvedValue({ packages: { ".": {} } });
    findRepoFallbackPackageProfileMock.mockReturnValue(undefined);

    await expect(readConventions("/repo")).resolves.toBeNull();
  });

  it("returns default conventions when initTaroState reports no packages and uses fallback profile when available", async () => {
    const stderrSpy = vi
      .spyOn(process.stderr, "write")
      .mockImplementation(() => true);
    initTaroStateMock.mockResolvedValueOnce({
      state: {},
      summary: { packageCount: 0 },
    });

    const defaultResult = await scanConventions("/repo");

    expect(defaultResult).toEqual(
      expect.objectContaining({
        projectRoot: "/repo",
        importStyle: "esm",
        testFiles: [],
      })
    );
    expect(stderrSpy).toHaveBeenCalledWith(
      expect.stringContaining("No test files found")
    );

    const conventions = {
      ...DEFAULT_CONVENTIONS,
      projectRoot: "/repo",
      scannedAt: "2026-03-16T12:00:00.000Z",
    };
    initTaroStateMock.mockResolvedValueOnce({
      state: { packages: { ".": {} } },
      summary: { packageCount: 2 },
    });
    findRepoFallbackPackageProfileMock.mockReturnValueOnce({ conventions });

    await expect(scanConventions("/repo")).resolves.toEqual(conventions);

    stderrSpy.mockRestore();
  });

  it("falls back to default conventions when scan state has packages but no fallback profile", async () => {
    initTaroStateMock.mockResolvedValue({
      state: { packages: { ".": {} } },
      summary: { packageCount: 1 },
    });
    findRepoFallbackPackageProfileMock.mockReturnValue(undefined);

    const result = await scanConventions("/repo");

    expect(result).toEqual(
      expect.objectContaining({
        projectRoot: "/repo",
        importStyle: "esm",
        testFiles: [],
      })
    );
  });

  it("persists conventions into the compatibility package slot and refreshes state on merge", async () => {
    readTaroStateMock.mockResolvedValue(null);

    await persistConventions("/repo", {
      ...DEFAULT_CONVENTIONS,
      projectRoot: "/repo",
      scannedAt: "2026-03-16T12:00:00.000Z",
      mockPattern: "vi.mock",
      folderPattern: "colocated",
      fileExtension: "ts",
      testFiles: [
        {
          path: "src/example.test.ts",
          importsTestingLibrary: true,
          usesRequire: false,
          mockPattern: "vi.mock",
          hasRenderHelper: false,
          hasHelperWithExpect: false,
          folderPattern: "colocated",
          fileExtension: "ts",
        },
      ],
    });

    expect(writeTaroStateMock).toHaveBeenCalledWith(
      "/repo",
      expect.objectContaining({
        packages: expect.objectContaining({
          ".": expect.objectContaining({
            packagePath: ".",
            testFileCount: 1,
            conventions: expect.objectContaining({ mockPattern: "vi.mock" }),
            warnings: ["Persisted from compatibility conventions interface"],
          }),
        }),
      })
    );

    await mergeConventions("/repo", {
      path: "src/example.test.ts",
      importsTestingLibrary: true,
      usesRequire: false,
      mockPattern: "vi.mock",
      hasRenderHelper: false,
      hasHelperWithExpect: false,
      folderPattern: "colocated",
      fileExtension: "ts",
    });

    expect(refreshTaroStateMock).toHaveBeenCalledWith("/repo");
  });

  it("persists low-confidence compatibility signals when conventions are incomplete", async () => {
    readTaroStateMock.mockResolvedValue({
      version: 1,
      meta: {
        createdAt: "2026-03-16T12:00:00.000Z",
        updatedAt: "2026-03-16T12:00:00.000Z",
        taroVersion: "1.0.0",
      },
      packages: {},
      mockStore: { rootDir: null, importHint: null, resources: [] },
      generatedTests: [],
    });

    await persistConventions("/repo", {
      ...DEFAULT_CONVENTIONS,
      projectRoot: "/repo",
      scannedAt: "",
      mockPattern: "none",
      folderPattern: "unknown",
      fileExtension: "mixed",
      testFiles: [],
    });

    expect(writeTaroStateMock).toHaveBeenCalledWith(
      "/repo",
      expect.objectContaining({
        packages: expect.objectContaining({
          ".": expect.objectContaining({
            scannedAt: expect.any(String),
            importStyle: expect.objectContaining({
              confidence: "low",
              evidence: [],
            }),
            mockPattern: expect.objectContaining({
              confidence: "low",
              evidence: [],
            }),
            folderPattern: expect.objectContaining({ confidence: "low" }),
            fileExtension: expect.objectContaining({ confidence: "medium" }),
          }),
        }),
      })
    );
  });
});
