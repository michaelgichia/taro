import { describe, expect, it, vi } from "vitest";

import {
  createVersionCommand,
  runVersionCommand,
} from "#cli/commands/version.ts";
import { TARO_VERSION } from "#version.ts";

function createLogger() {
  const logs: string[] = [];

  return { logs, logger: { log: (value: string) => logs.push(value) } };
}

describe("runVersionCommand", () => {
  it("prints the current Taro version", () => {
    const { logs, logger } = createLogger();

    runVersionCommand({ logger });

    expect(logs).toEqual([TARO_VERSION]);
  });

  it("falls back to console.log when no logger is provided", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});

    try {
      runVersionCommand();

      expect(log).toHaveBeenCalledWith(TARO_VERSION);
    } finally {
      log.mockRestore();
    }
  });
});

describe("createVersionCommand", () => {
  it("creates a version subcommand that prints the current version", async () => {
    const { logs, logger } = createLogger();
    const command = createVersionCommand({ logger });

    await command.parseAsync([], { from: "user" });

    expect(command.name()).toBe("version");
    expect(logs).toEqual([TARO_VERSION]);
  });
});
