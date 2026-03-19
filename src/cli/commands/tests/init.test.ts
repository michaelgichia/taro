import { describe, expect, it, vi } from "vitest";

const { cwdMock, initTaroStateMock, formatStateSummaryMock, logMock } =
  vi.hoisted(() => ({
    cwdMock: vi.fn(() => "/repo"),
    initTaroStateMock: vi.fn(),
    formatStateSummaryMock: vi.fn(),
    logMock: vi.fn(),
  }));

vi.mock("node:process", () => ({ cwd: cwdMock }));

vi.mock("#core/state.ts", () => ({
  initTaroState: initTaroStateMock,
  formatStateSummary: formatStateSummaryMock,
}));

import { createInitCommand } from "#cli/commands/init.ts";

describe("createInitCommand", () => {
  it("initializes state for the current working directory and prints the summary", async () => {
    initTaroStateMock.mockResolvedValue({ summary: { packageCount: 2 } });
    formatStateSummaryMock.mockReturnValue(["line one", "line two"]);

    const logSpy = vi.spyOn(console, "log").mockImplementation(logMock);

    try {
      const command = createInitCommand();
      await command.parseAsync([], { from: "user" });

      expect(command.name()).toBe("__init");
      expect(cwdMock).toHaveBeenCalled();
      expect(initTaroStateMock).toHaveBeenCalledWith("/repo");
      expect(formatStateSummaryMock).toHaveBeenCalledWith(
        { packageCount: 2 },
        "init"
      );
      expect(logMock).toHaveBeenCalledWith("line one");
      expect(logMock).toHaveBeenCalledWith("line two");
    } finally {
      logSpy.mockRestore();
    }
  });
});
