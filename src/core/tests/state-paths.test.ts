import { describe, expect, it } from "vitest";

import {
  normalizeGeneratedTestHistoryPath,
  normalizeRepoRelativePath,
} from "#core/state-paths.ts";

describe("state-paths", () => {
  it("normalizes repo-relative files against the project root", () => {
    const projectRoot = "/tmp/taro-project";

    expect(
      normalizeRepoRelativePath(projectRoot, "src/tests/example.test.tsx")
    ).toBe("src/tests/example.test.tsx");
  });

  it("normalizes generated test history paths consistently for absolute and relative inputs", () => {
    const projectRoot = "/tmp/taro-project";
    const relativePath = "src/tests/example.test.tsx";
    const absolutePath = "/tmp/taro-project/src/tests/example.test.tsx";

    expect(normalizeGeneratedTestHistoryPath(projectRoot, relativePath)).toBe(
      "src/tests/example.test.tsx"
    );
    expect(normalizeGeneratedTestHistoryPath(projectRoot, absolutePath)).toBe(
      "src/tests/example.test.tsx"
    );
  });
});
