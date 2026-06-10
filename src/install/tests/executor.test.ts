import { describe, expect, it, vi } from "vitest";

const { verifyInstalledRuntimeMock, writeInstallPlanMock } = vi.hoisted(() => ({
  verifyInstalledRuntimeMock: vi.fn(),
  writeInstallPlanMock: vi.fn(),
}));

vi.mock("#install/verification.ts", () => ({
  verifyInstalledRuntime: verifyInstalledRuntimeMock,
}));

vi.mock("#install/writer.ts", () => ({
  writeInstallPlan: writeInstallPlanMock,
}));

import { executeInstallPlan } from "#install/executor.ts";

const basePlan = {
  packageName: "@tr-rtl/cli",
  targets: [
    {
      id: "claude",
      runtime: "claude",
      displayName: "Claude",
      location: "global",
      destinationDirectory: "/home/.claude",
      verificationCommand: "cmd",
      operations: [],
    },
  ],
} as any;

describe("executeInstallPlan", () => {
  it("returns blocked when every target is blocked before verification", async () => {
    writeInstallPlanMock.mockResolvedValue({
      runtime: "claude",
      status: "blocked",
      conflicts: [],
      writtenFiles: [],
    });

    const result = await executeInstallPlan(basePlan);

    expect(result.status).toBe("blocked");
    expect(verifyInstalledRuntimeMock).not.toHaveBeenCalled();
  });

  it("returns partial when writes succeed but verification fails", async () => {
    writeInstallPlanMock.mockResolvedValue({
      runtime: "claude",
      status: "installed",
      conflicts: [],
      writtenFiles: ["help.md"],
    });
    verifyInstalledRuntimeMock.mockResolvedValue({
      status: "runtime-check-failed",
      missingPaths: [],
    });

    const result = await executeInstallPlan(basePlan, {
      generatedAt: "2026-03-16T12:00:00Z",
    });

    expect(result.status).toBe("partial");
    expect(writeInstallPlanMock).toHaveBeenCalledWith(
      basePlan.targets[0],
      expect.objectContaining({ generatedAt: "2026-03-16T12:00:00Z" })
    );
  });
});
