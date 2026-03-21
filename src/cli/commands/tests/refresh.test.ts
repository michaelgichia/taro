import { describe, expect, it, vi } from "vitest";

const { cwdMock, refreshTaroStateMock, formatStateSummaryMock, logMock } =
  vi.hoisted(() => ({
    cwdMock: vi.fn(() => "/repo"),
    refreshTaroStateMock: vi.fn(),
    formatStateSummaryMock: vi.fn(),
    logMock: vi.fn(),
  }));

vi.mock("node:process", () => ({ cwd: cwdMock }));

vi.mock("#core/state.ts", () => ({
  refreshTaroState: refreshTaroStateMock,
  formatStateSummary: formatStateSummaryMock,
}));

import { createRefreshCommand } from "#cli/commands/refresh.ts";

describe("createRefreshCommand", () => {
  it("refreshes state for the current working directory and prints the summary", async () => {
    refreshTaroStateMock.mockResolvedValue({ summary: { packageCount: 1 } });
    formatStateSummaryMock.mockReturnValue(["refresh line"]);

    const logSpy = vi.spyOn(console, "log").mockImplementation(logMock);

    try {
      const command = createRefreshCommand();
      await command.parseAsync([], { from: "user" });

      expect(command.name()).toBe("__refresh");
      expect(cwdMock).toHaveBeenCalled();
      expect(refreshTaroStateMock).toHaveBeenCalledWith("/repo");
      expect(formatStateSummaryMock).toHaveBeenCalledWith(
        { packageCount: 1 },
        "refresh"
      );
      expect(logMock).toHaveBeenCalledWith("refresh line");
    } finally {
      logSpy.mockRestore();
    }
  });
});
