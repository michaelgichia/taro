import { describe, expect, it, vi } from "vitest";

import {
  ALL_RUNTIMES_CHOICE,
  deriveSelectionSource,
  parseLocation,
  parseRuntimeSelection,
  promptForInstallChoices,
  runtimeMenu,
} from "#install/prompts.ts";

describe("install prompts", () => {
  it("renders a runtime menu with every runtime and the all runtimes choice", () => {
    const menu = runtimeMenu();

    expect(menu).toContain("1. Claude Code");
    expect(menu).toContain("2. OpenCode");
    expect(menu).toContain("3. Gemini CLI");
    expect(menu).toContain("4. Codex");
    expect(menu).toContain(`${ALL_RUNTIMES_CHOICE}. All runtimes`);
  });

  it("parses specific runtime selections and removes duplicates", () => {
    expect(parseRuntimeSelection("1, 2, 2, 4")).toEqual([
      "claude",
      "opencode",
      "codex",
    ]);
  });

  it("returns all runtimes when the all choice is selected", () => {
    expect(parseRuntimeSelection(String(ALL_RUNTIMES_CHOICE))).toEqual([
      "claude",
      "opencode",
      "gemini",
      "codex",
    ]);
  });

  it("rejects invalid runtime selections", () => {
    expect(parseRuntimeSelection("0, 99")).toBeNull();
    expect(parseRuntimeSelection("abc")).toBeNull();
  });

  it("parses both numeric and shorthand location answers", () => {
    expect(parseLocation("1")).toBe("global");
    expect(parseLocation("g")).toBe("global");
    expect(parseLocation("local")).toBe("local");
    expect(parseLocation("2")).toBe("local");
  });

  it("rejects unsupported location answers", () => {
    expect(parseLocation("remote")).toBeNull();
  });

  it("derives prompt, flags, and mixed selection sources", () => {
    expect(
      deriveSelectionSource({
        mode: "non-interactive",
        runtimes: ["claude"],
        locations: { claude: "global" },
        needsRuntimePrompt: false,
        runtimesNeedingLocation: [],
        source: "flags",
      })
    ).toBe("flags");

    expect(
      deriveSelectionSource({
        mode: "interactive",
        runtimes: ["claude"],
        locations: { claude: "global" },
        needsRuntimePrompt: false,
        runtimesNeedingLocation: [],
        source: "prompt",
      })
    ).toBe("prompt");

    expect(
      deriveSelectionSource({
        mode: "interactive",
        runtimes: ["claude"],
        locations: { claude: "global" },
        needsRuntimePrompt: false,
        runtimesNeedingLocation: [],
        source: "flags",
      })
    ).toBe("mixed");
  });

  it("prompts until valid runtime and location answers are provided", async () => {
    const close = vi.fn();
    const question = vi
      .fn()
      .mockResolvedValueOnce("invalid")
      .mockResolvedValueOnce("1,4")
      .mockResolvedValueOnce("bad")
      .mockResolvedValueOnce("1")
      .mockResolvedValueOnce("2");

    const output = { write: vi.fn() } as unknown as NodeJS.WritableStream;

    const result = await promptForInstallChoices(
      {
        mode: "interactive",
        runtimes: [],
        locations: {},
        needsRuntimePrompt: true,
        runtimesNeedingLocation: ["claude", "codex"],
        source: "prompt",
      },
      {
        input: {} as NodeJS.ReadableStream,
        output,
        createInterfaceImpl: () => ({ question, close }),
        log: vi.fn(),
      } as never
    );

    expect(result).toEqual({
      mode: "interactive",
      runtimes: ["claude", "codex"],
      locations: { claude: "global", codex: "local" },
      source: "prompt",
    });
    expect(close).toHaveBeenCalled();
  });

  it("only prompts for missing runtime locations when runtimes are already selected", async () => {
    const close = vi.fn();
    const question = vi.fn().mockResolvedValueOnce("2");

    const result = await promptForInstallChoices(
      {
        mode: "interactive",
        runtimes: ["claude", "gemini"],
        locations: { claude: "global" },
        needsRuntimePrompt: false,
        runtimesNeedingLocation: ["gemini"],
        source: "flags",
      },
      {
        input: {} as NodeJS.ReadableStream,
        output: {} as NodeJS.WritableStream,
        createInterfaceImpl: () => ({ question, close }),
        log: vi.fn(),
      } as never
    );

    expect(result).toEqual({
      mode: "interactive",
      runtimes: ["claude", "gemini"],
      locations: { claude: "global", gemini: "local" },
      source: "mixed",
    });
    expect(question).toHaveBeenCalledTimes(1);
    expect(close).toHaveBeenCalled();
  });
});
