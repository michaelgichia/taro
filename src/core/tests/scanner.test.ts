import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  findTestFiles,
  readConventions,
  scanConventions,
} from "#core/scanner.ts";
import { DEFAULT_CONVENTIONS } from "#types/conventions.ts";

let testDir: string;

beforeEach(async () => {
  testDir = join(tmpdir(), `taro-test-${Date.now()}`);
  await mkdir(testDir, { recursive: true });
});

afterEach(async () => {
  await rm(testDir, { recursive: true, force: true });
});

describe("findTestFiles", () => {
  it("finds .test.ts files recursively", async () => {
    const subDir = join(testDir, "src", "components");
    await mkdir(subDir, { recursive: true });
    await writeFile(join(subDir, "Button.test.ts"), "// test");
    const files = await findTestFiles(testDir);
    expect(files).toHaveLength(1);
    expect(files[0]).toContain("Button.test.ts");
  });

  it("finds .spec.tsx files", async () => {
    await writeFile(join(testDir, "App.spec.tsx"), "// spec");
    const files = await findTestFiles(testDir);
    expect(files.some((f) => f.endsWith("App.spec.tsx"))).toBe(true);
  });

  it("skips node_modules directory", async () => {
    const nodeModulesDir = join(testDir, "node_modules", "pkg");
    await mkdir(nodeModulesDir, { recursive: true });
    await writeFile(
      join(nodeModulesDir, "index.test.ts"),
      "// should be skipped"
    );
    const files = await findTestFiles(testDir);
    expect(files).toHaveLength(0);
  });
});

describe("scanConventions", () => {
  it("returns DEFAULT_CONVENTIONS with projectRoot set when no test files found", async () => {
    const result = await scanConventions(testDir);
    expect(result.testFiles).toHaveLength(0);
    expect(result.projectRoot).toBe(testDir);
    expect(result.importStyle).toBe("esm");
  });

  it("detects ESM import style from test file", async () => {
    await writeFile(
      join(testDir, "App.test.ts"),
      `import { render } from '@testing-library/react'\ndescribe("x", () => { it("y", () => {}) })`
    );
    const result = await scanConventions(testDir);
    expect(result.importStyle).toBe("esm");
  });

  it("detects CJS require style from test file", async () => {
    await writeFile(
      join(testDir, "App.test.js"),
      `const { render } = require('@testing-library/react')\ndescribe("x", () => { it("y", () => {}) })`
    );
    const result = await scanConventions(testDir);
    expect(result.importStyle).toBe("cjs");
  });

  it("detects vi.mock pattern", async () => {
    await writeFile(
      join(testDir, "App.test.ts"),
      `import { render } from '@testing-library/react'\nvi.mock('./foo')\ndescribe("x", () => { it("y", () => {}) })`
    );
    const result = await scanConventions(testDir);
    expect(result.mockPattern).toBe("vi.mock");
  });

  it("flags helpers that contain expect() statements (TEST-02)", async () => {
    await writeFile(
      join(testDir, "helpers.test.ts"),
      `function renderHelper() { expect(screen.getByText('hi')).toBeInTheDocument() }\ndescribe("x", () => { it("y", () => {}) })`
    );
    const result = await scanConventions(testDir);
    const flagged = result.testFiles.find((f) => f.hasHelperWithExpect);
    expect(flagged).toBeDefined();
  });

  it("persists result to .taro/state.json (CTX-05)", async () => {
    const { readFile } = await import("node:fs/promises");
    await scanConventions(testDir);
    const content = await readFile(
      join(testDir, ".taro", "state.json"),
      "utf-8"
    );
    const parsed = JSON.parse(content);
    expect(parsed.packages).toEqual({});
  });

  it("reads compatibility conventions.json from .taro when state.json is missing", async () => {
    await mkdir(join(testDir, ".taro"), { recursive: true });
    await writeFile(
      join(testDir, ".taro", "conventions.json"),
      JSON.stringify({
        ...DEFAULT_CONVENTIONS,
        projectRoot: testDir,
        scannedAt: new Date().toISOString(),
      }),
      "utf-8"
    );

    const result = await readConventions(testDir);

    expect(result?.projectRoot).toBe(testDir);
  });
});
