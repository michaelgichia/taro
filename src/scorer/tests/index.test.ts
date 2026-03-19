import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  writeFileSyncMock,
  evaluateQualityGatesMock,
  preWriteAuditMock,
  postWriteVerificationMock,
  fixedNow,
} = vi.hoisted(() => ({
  writeFileSyncMock: vi.fn(),
  evaluateQualityGatesMock: vi.fn(),
  preWriteAuditMock: vi.fn(),
  postWriteVerificationMock: vi.fn(),
  fixedNow: 1_710_000_000_000,
}));

vi.mock("fs", () => ({ writeFileSync: writeFileSyncMock }));

vi.mock("#scorer/quality-gates.ts", () => ({
  evaluateQualityGates: evaluateQualityGatesMock,
}));

vi.mock("#scorer/pre-audit.ts", () => ({ preWriteAudit: preWriteAuditMock }));

vi.mock("#scorer/post-verify.ts", () => ({
  postWriteVerification: postWriteVerificationMock,
}));

import { orchestrateWithScoring, scoreTest } from "#scorer/index.ts";

describe("scoreTest", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(Date, "now").mockReturnValue(fixedNow);
    evaluateQualityGatesMock.mockReturnValue({
      overall: 82,
      criteria: { structure: 90, queries: 80, matchers: 78, noFragility: 79 },
      issues: [],
      passed: true,
    });
  });

  it("returns the evaluated score with the original code and timestamp", () => {
    const result = scoreTest("expect(true).toBe(true)");

    expect(result).toEqual({
      code: "expect(true).toBe(true)",
      score: expect.objectContaining({ overall: 82 }),
      timestamp: fixedNow,
    });
  });
});

describe("orchestrateWithScoring", () => {
  const recording = {
    id: "rec-1",
    name: "Checkout flow",
    steps: [{ action: "click", selector: "#save" }],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    evaluateQualityGatesMock.mockReturnValue({
      overall: 88,
      criteria: { structure: 90, queries: 85, matchers: 88, noFragility: 87 },
      issues: [],
      passed: true,
    });
    preWriteAuditMock.mockReturnValue({
      valid: true,
      blocking: [],
      warnings: [],
      qualityScore: {
        overall: 88,
        criteria: { structure: 90, queries: 85, matchers: 88, noFragility: 87 },
        issues: [],
        passed: true,
      },
    });
    postWriteVerificationMock.mockReturnValue({
      valid: true,
      errors: [],
      warnings: [],
      filePath: "/tmp/generated.test.tsx",
      parsed: true,
    });
  });

  it("returns a scored success result when generation, audit, write, and verification all pass", () => {
    const result = orchestrateWithScoring({
      recording,
      outputPath: "/tmp/generated.test.tsx",
      generateTest: () => "generated test code",
    });

    expect(writeFileSyncMock).toHaveBeenCalledWith(
      "/tmp/generated.test.tsx",
      "generated test code",
      "utf-8"
    );
    expect(result).toEqual({
      success: true,
      outputPath: "/tmp/generated.test.tsx",
      audit: expect.objectContaining({ valid: true }),
      verification: expect.objectContaining({ valid: true }),
      score: expect.objectContaining({ overall: 88 }),
    });
  });

  it("fails when test generation throws", () => {
    const result = orchestrateWithScoring({
      recording,
      outputPath: "/tmp/generated.test.tsx",
      generateTest: () => {
        throw new Error("template failed");
      },
    });

    expect(result).toEqual({
      success: false,
      error: "Failed to generate test: template failed",
    });
    expect(preWriteAuditMock).not.toHaveBeenCalled();
  });

  it("fails when the pre-write audit blocks output", () => {
    preWriteAuditMock.mockReturnValue({
      valid: false,
      blocking: ["Missing describe block"],
      warnings: ["Using querySelector"],
    });

    const result = orchestrateWithScoring({
      recording,
      outputPath: "/tmp/generated.test.tsx",
      generateTest: () => "generated test code",
    });

    expect(result).toEqual({
      success: false,
      audit: expect.objectContaining({ valid: false }),
      error: "Pre-write audit failed: Missing describe block",
    });
    expect(writeFileSyncMock).not.toHaveBeenCalled();
  });

  it("fails when writing the generated file throws", () => {
    writeFileSyncMock.mockImplementation(() => {
      throw new Error("disk full");
    });

    const result = orchestrateWithScoring({
      recording,
      outputPath: "/tmp/generated.test.tsx",
      generateTest: () => "generated test code",
    });

    expect(result).toEqual({
      success: false,
      audit: expect.objectContaining({ valid: true }),
      error: "Failed to write test file: disk full",
    });
  });

  it("fails when post-write verification reports errors", () => {
    writeFileSyncMock.mockReset();
    postWriteVerificationMock.mockReturnValue({
      valid: false,
      errors: ["Syntax parse error"],
      warnings: [],
      filePath: "/tmp/generated.test.tsx",
      parsed: false,
    });

    const result = orchestrateWithScoring({
      recording,
      outputPath: "/tmp/generated.test.tsx",
      generateTest: () => "generated test code",
    });

    expect(result).toEqual({
      success: false,
      audit: expect.objectContaining({ valid: true }),
      verification: expect.objectContaining({ valid: false }),
      error: "Post-write verification failed: Syntax parse error",
    });
  });
});
