import { describe, expect, it } from "vitest";

import type { Finding } from "#core/findings-reporter.ts";
import {
  formatFindingsBlock,
  hasBlockingFindings,
} from "#core/findings-reporter.ts";

describe("formatFindingsBlock", () => {
  it("returns empty string when findings array is empty", () => {
    expect(formatFindingsBlock([])).toBe("");
  });

  it("wraps findings in sentinel lines", () => {
    const findings: Finding[] = [
      {
        severity: "BLOCKING",
        category: "boundary",
        message: "tenant-provider missing.",
      },
    ];
    const result = formatFindingsBlock(findings);
    expect(result).toBe(
      "=== taro:findings:start ===\n[BLOCKING] boundary — tenant-provider missing.\n=== taro:findings:end ==="
    );
  });

  it("emits one line per finding in severity order as provided", () => {
    const findings: Finding[] = [
      { severity: "BLOCKING", category: "boundary", message: "A." },
      { severity: "HIGH", category: "data-layer", message: "B." },
      { severity: "ADVISORY", category: "mutation", message: "C." },
    ];
    const lines = formatFindingsBlock(findings).split("\n");
    expect(lines).toHaveLength(5);
    expect(lines[0]).toBe("=== taro:findings:start ===");
    expect(lines[1]).toBe("[BLOCKING] boundary — A.");
    expect(lines[2]).toBe("[HIGH] data-layer — B.");
    expect(lines[3]).toBe("[ADVISORY] mutation — C.");
    expect(lines[4]).toBe("=== taro:findings:end ===");
  });

  it("does not include a trailing newline (caller appends it)", () => {
    const findings: Finding[] = [
      {
        severity: "ADVISORY",
        category: "follow-up",
        message: "Fix render path.",
      },
    ];
    expect(formatFindingsBlock(findings).endsWith("\n")).toBe(false);
  });
});

describe("hasBlockingFindings", () => {
  it("returns false for empty array", () => {
    expect(hasBlockingFindings([])).toBe(false);
  });

  it("returns false when only HIGH and ADVISORY findings exist", () => {
    expect(
      hasBlockingFindings([
        { severity: "HIGH", category: "data-layer", message: "X." },
        { severity: "ADVISORY", category: "mutation", message: "Y." },
      ])
    ).toBe(false);
  });

  it("returns true when at least one BLOCKING finding exists", () => {
    expect(
      hasBlockingFindings([
        { severity: "ADVISORY", category: "mutation", message: "Y." },
        { severity: "BLOCKING", category: "boundary", message: "Z." },
      ])
    ).toBe(true);
  });
});
