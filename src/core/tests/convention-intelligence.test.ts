import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import type { TestFileContent } from "#core/convention-intelligence.ts";
import {
  __conventionIntelligenceTestUtils,
  analyzeTestFile,
  deriveConventions,
  extractRenderTargetCandidatesFromFile,
  findTestFiles,
  readTestFiles,
} from "#core/convention-intelligence.ts";

const tempDirs: string[] = [];

async function createRoot() {
  const root = await mkdtemp(join(tmpdir(), "taro-convention-intel-"));
  tempDirs.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((root) => rm(root, { recursive: true, force: true }))
  );
});

describe("convention-intelligence", () => {
  it("skips unreadable directories and ignored roots while finding tests", async () => {
    const root = await createRoot();
    await mkdir(join(root, "src", "__tests__"), { recursive: true });
    await mkdir(join(root, ".git"), { recursive: true });
    await writeFile(
      join(root, "src", "__tests__", "good.test.tsx"),
      'describe("x",()=>{})',
      "utf8"
    );
    await writeFile(
      join(root, ".git", "bad.test.ts"),
      'describe("x",()=>{})',
      "utf8"
    );

    const files = await findTestFiles(join(root, "missing-parent"));
    const actual = await findTestFiles(root);

    expect(files).toEqual([]);
    expect(actual).toHaveLength(1);
    expect(actual[0]).toContain("good.test.tsx");
  });

  it("reads test files while dropping unreadable entries and handles missing files", async () => {
    const root = await createRoot();
    await mkdir(join(root, "tests"), { recursive: true });
    await writeFile(
      join(root, "tests", "first.test.ts"),
      'vi.mock("x")',
      "utf8"
    );

    const loaded = await readTestFiles(root);
    const missing = await analyzeTestFile(
      join(root, "tests", "missing.test.ts")
    );

    expect(loaded).toEqual([
      expect.objectContaining({
        path: expect.stringContaining("first.test.ts"),
        content: 'vi.mock("x")',
      }),
    ]);
    expect(missing).toEqual({
      path: join(root, "tests", "missing.test.ts"),
      importStyle: "esm",
      hasDescribeBlock: false,
      mockPattern: "none",
      hasHelperWithExpect: false,
    });
  });

  it("detects cjs + jest conventions and handles empty or import-free render targets", async () => {
    const root = await createRoot();
    const testFile = join(root, "__tests__", "legacy.spec.js");
    await mkdir(join(root, "__tests__"), { recursive: true });
    await writeFile(
      testFile,
      [
        "const subject = require('./subject')",
        "jest.mock('./api/orders')",
        "const openDialog = async () => { expect(true).toBe(true) }",
        "describe('legacy', () => {})",
      ].join("\n"),
      "utf8"
    );

    const analyzed = await analyzeTestFile(testFile);
    const emptyDerived = deriveConventions([], root);
    const jsOnlyDerived = deriveConventions([analyzed], root);
    const candidates = extractRenderTargetCandidatesFromFile(root, {
      path: testFile,
      content:
        "render(<MissingImport />)\nconst openDialog = async () => { expect(true).toBe(true) }",
    });

    expect(analyzed).toEqual(
      expect.objectContaining({
        importStyle: "cjs",
        mockPattern: "jest.mock",
        hasHelperWithExpect: true,
      })
    );
    expect(emptyDerived.projectRoot).toBe(root);
    expect(emptyDerived.folderPattern).toBe("unknown");
    expect(emptyDerived.fileExtension).toBe("ts");
    expect(jsOnlyDerived.folderPattern).toBe("__tests__");
    expect(jsOnlyDerived.fileExtension).toBe("js");
    expect(candidates).toEqual([]);
  });

  it("derives mixed extensions when both js and ts tests are present", async () => {
    const root = await createRoot();
    const derived = deriveConventions(
      [
        {
          path: join(root, "src", "__tests__", "legacy.test.js"),
          importStyle: "cjs",
          hasDescribeBlock: true,
          mockPattern: "none",
          hasHelperWithExpect: false,
        },
        {
          path: join(root, "src", "widget.test.tsx"),
          importStyle: "esm",
          hasDescribeBlock: true,
          mockPattern: "none",
          hasHelperWithExpect: false,
        },
      ],
      root
    );

    expect(derived.folderPattern).toBe("mixed");
    expect(derived.fileExtension).toBe("mixed");
  });

  it("derives conventions for mixed layouts and extracts render targets with helper metadata", async () => {
    const root = await createRoot();
    const files = [
      {
        path: join(root, "src", "__tests__", "dialog.test.tsx"),
        importStyle: "cjs",
        hasDescribeBlock: true,
        mockPattern: "jest.mock",
        hasHelperWithExpect: true,
      },
      {
        path: join(root, "src", "Widget.test.ts"),
        importStyle: "esm",
        hasDescribeBlock: false,
        mockPattern: "none",
        hasHelperWithExpect: false,
      },
    ];

    const derived = deriveConventions(files, root);
    expect(derived.importStyle).toBe("esm");
    expect(derived.mockPattern).toBe("jest.mock");
    expect(derived.folderPattern).toBe("mixed");
    expect(derived.fileExtension).toBe("ts");

    const candidates = extractRenderTargetCandidatesFromFile(root, {
      path: join(root, "src", "Widget.test.tsx"),
      content: [
        "import OrdersPage from './OrdersPage'",
        "import Modal from './Modal'",
        "const openDialog = async () => { expect(true).toBe(true) }",
        "render(<OrdersPage />)",
        "render(<Modal />)",
        'within(screen.getByRole("dialog"))',
      ].join("\n"),
    } satisfies TestFileContent);

    expect(candidates).toEqual([
      {
        symbol: "OrdersPage",
        importPath: "./OrdersPage",
        importKind: "default",
        sourceTestFile: "src/Widget.test.tsx",
        helperNames: ["openDialog"],
        usesWithin: true,
      },
      {
        symbol: "Modal",
        importPath: "./Modal",
        importKind: "default",
        sourceTestFile: "src/Widget.test.tsx",
        helperNames: ["openDialog"],
        usesWithin: true,
      },
    ]);
  });

  it("exposes folder and extension defaults for empty convention sets", () => {
    expect(
      __conventionIntelligenceTestUtils.detectFolderPattern([], "/repo")
    ).toBe("unknown");
    expect(__conventionIntelligenceTestUtils.detectFileExtension([])).toBe(
      "ts"
    );
  });

  it("detects tests/ subdirectory pattern", () => {
    const root = "/repo";
    const files = [
      {
        path: "/repo/src/core/tests/scanner.test.ts",
        importStyle: "esm" as const,
        hasDescribeBlock: true,
        mockPattern: "none" as const,
        hasHelperWithExpect: false,
      },
      {
        path: "/repo/src/analyzer/tests/inspector.test.ts",
        importStyle: "esm" as const,
        hasDescribeBlock: true,
        mockPattern: "none" as const,
        hasHelperWithExpect: false,
      },
    ];
    expect(
      __conventionIntelligenceTestUtils.detectFolderPattern(files, root)
    ).toBe("tests");
  });

  it("detects mixed pattern when __tests__ and tests/ both appear", () => {
    const root = "/repo";
    const files = [
      {
        path: "/repo/src/__tests__/foo.test.ts",
        importStyle: "esm" as const,
        hasDescribeBlock: false,
        mockPattern: "none" as const,
        hasHelperWithExpect: false,
      },
      {
        path: "/repo/src/bar/tests/bar.test.ts",
        importStyle: "esm" as const,
        hasDescribeBlock: false,
        mockPattern: "none" as const,
        hasHelperWithExpect: false,
      },
    ];
    expect(
      __conventionIntelligenceTestUtils.detectFolderPattern(files, root)
    ).toBe("mixed");
  });
});
