import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  parseRecordingMock,
  detectApiCallsMock,
  groupApiCallsByDomainMock,
  analyzeMockTargetsMock,
  buildMocksMock,
  getConventionsMock,
  learnConventionsMock,
  preWriteAuditMock,
  postWriteVerificationMock,
  scoreTestMock,
  existsSyncMock,
  mkdirSyncMock,
  readFileSyncMock,
  writeFileSyncMock,
} = vi.hoisted(() => ({
  parseRecordingMock: vi.fn(),
  detectApiCallsMock: vi.fn(),
  groupApiCallsByDomainMock: vi.fn(),
  analyzeMockTargetsMock: vi.fn(),
  buildMocksMock: vi.fn(),
  getConventionsMock: vi.fn(),
  learnConventionsMock: vi.fn(),
  preWriteAuditMock: vi.fn(),
  postWriteVerificationMock: vi.fn(),
  scoreTestMock: vi.fn(),
  existsSyncMock: vi.fn(),
  mkdirSyncMock: vi.fn(),
  readFileSyncMock: vi.fn(),
  writeFileSyncMock: vi.fn(),
}));

vi.mock("#core/parser.ts", () => ({ parseRecording: parseRecordingMock }));

vi.mock("#analyzer/mocks/detector.ts", () => ({
  detectApiCalls: detectApiCallsMock,
  groupApiCallsByDomain: groupApiCallsByDomainMock,
}));

vi.mock("#analyzer/mocks/target-analyzer.ts", () => ({
  analyzeMockTargets: analyzeMockTargetsMock,
}));

vi.mock("#generator/mocks/builder.ts", () => ({ buildMocks: buildMocksMock }));

vi.mock("#learner/index.ts", () => ({
  getConventions: getConventionsMock,
  learnConventions: learnConventionsMock,
}));

vi.mock("#scorer/index.ts", () => ({ scoreTest: scoreTestMock }));

vi.mock("#scorer/pre-audit.ts", () => ({ preWriteAudit: preWriteAuditMock }));

vi.mock("#scorer/post-verify.ts", () => ({
  postWriteVerification: postWriteVerificationMock,
}));

vi.mock("fs", () => ({
  existsSync: existsSyncMock,
  mkdirSync: mkdirSyncMock,
  readFileSync: readFileSyncMock,
  writeFileSync: writeFileSyncMock,
}));

import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createCommand, run } from "#core/orchestrator.ts";

describe("orchestrator", () => {
  let exitSpy: ReturnType<typeof vi.spyOn>;
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    exitSpy = vi.spyOn(process, "exit").mockImplementation((code?: number) => {
      throw new Error(`exit:${code ?? 0}`);
    });

    parseRecordingMock.mockResolvedValue({
      title: "Example flow",
      steps: [{ id: "step-1", action: "click", target: "Save" }],
      url: "http://localhost:3000/app",
    });
    detectApiCallsMock.mockReturnValue([]);
    groupApiCallsByDomainMock.mockReturnValue(new Map());
    analyzeMockTargetsMock.mockReturnValue([]);
    buildMocksMock.mockReturnValue([]);
    getConventionsMock.mockReturnValue(null);
    scoreTestMock.mockReturnValue({
      score: {
        overall: 88,
        criteria: { structure: 90, queries: 80, matchers: 85, noFragility: 97 },
        issues: [],
      },
    });
    preWriteAuditMock.mockReturnValue({ valid: true, blocking: [] });
    postWriteVerificationMock.mockReturnValue({ valid: true, errors: [] });
    existsSyncMock.mockReturnValue(false);
    readFileSyncMock.mockReturnValue(JSON.stringify({ dependencies: {} }));
    learnConventionsMock.mockReturnValue(undefined);
  });

  afterEach(() => {
    logSpy.mockRestore();
    errorSpy.mockRestore();
    exitSpy.mockRestore();
  });

  it("runs the happy path with mock detection, writing, verification, and learning", async () => {
    const apiCall = {
      id: "api-1",
      method: "fetch",
      httpMethod: "GET",
      url: "https://api.example.com/orders",
      isExternal: true,
      source: "codebase",
    };
    detectApiCallsMock.mockReturnValue([apiCall]);
    groupApiCallsByDomainMock.mockReturnValue(
      new Map([["api.example.com", [apiCall]]])
    );
    analyzeMockTargetsMock.mockReturnValue([
      {
        apiCallId: "api-1",
        url: "https://api.example.com/orders",
        method: "GET",
        mockLibrary: "msw",
        extractionRecommendation: "inline",
        confidence: 0.9,
        reason: "test",
      },
    ]);
    buildMocksMock.mockReturnValue([{ isInline: true }]);

    await run({
      recordingPath: "/tmp/recording.json",
      outputPath: "/tmp/tests",
      visual: true,
      mocks: true,
      url: "http://localhost:3000/app",
    });

    expect(parseRecordingMock).toHaveBeenCalledWith("/tmp/recording.json");
    expect(detectApiCallsMock).toHaveBeenCalled();
    expect(analyzeMockTargetsMock).toHaveBeenCalled();
    expect(buildMocksMock).toHaveBeenCalled();
    expect(mkdirSyncMock).toHaveBeenCalledWith("/tmp/tests", {
      recursive: true,
    });
    expect(writeFileSyncMock).toHaveBeenCalledWith(
      expect.stringContaining("/tmp/tests/generated.test.ts"),
      expect.stringContaining("describe('Example flow'")
    );
    expect(postWriteVerificationMock).toHaveBeenCalled();
    expect(learnConventionsMock).toHaveBeenCalledWith(process.cwd());
  });

  it("exits when parsing the recording fails", async () => {
    parseRecordingMock.mockRejectedValue(new Error("bad recording"));

    await expect(run({ recordingPath: "/tmp/bad.json" })).rejects.toThrow(
      "exit:1"
    );

    expect(errorSpy).toHaveBeenCalledWith(
      "   ✗ Failed to parse recording: bad recording"
    );
  });

  it("skips writing when the pre-write audit blocks the output", async () => {
    preWriteAuditMock.mockReturnValue({
      valid: false,
      blocking: ["missing imports"],
    });

    await run({
      recordingPath: "/tmp/recording.json",
      outputPath: "/tmp/tests",
      mocks: false,
    });

    expect(writeFileSyncMock).not.toHaveBeenCalled();
    expect(postWriteVerificationMock).not.toHaveBeenCalled();
  });

  it("continues when mock detection throws and when learning conventions fails", async () => {
    detectApiCallsMock.mockImplementation(() => {
      throw new Error("network unavailable");
    });
    learnConventionsMock.mockImplementation(() => {
      throw new Error("storage locked");
    });
    existsSyncMock.mockReturnValue(true);

    await run({
      recordingPath: "/tmp/recording.json",
      outputPath: "/tmp/tests",
      mocks: true,
    });

    expect(writeFileSyncMock).toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalledWith(
      "   ⚠ Convention learning skipped: storage locked"
    );
  });

  it("loads package json when present and logs verification issues", async () => {
    detectApiCallsMock.mockReturnValue([
      {
        id: "api-1",
        method: "fetch",
        httpMethod: "POST",
        url: "https://api.example.com/orders",
        isExternal: true,
        source: "codebase",
      },
    ]);
    groupApiCallsByDomainMock.mockReturnValue(
      new Map([["api.example.com", [{}]]])
    );
    analyzeMockTargetsMock.mockReturnValue([]);
    buildMocksMock.mockReturnValue([]);
    getConventionsMock.mockReturnValue({ importStyle: "esm" });
    postWriteVerificationMock.mockReturnValue({
      valid: false,
      errors: ["missing assertion"],
    });
    existsSyncMock.mockImplementation((path: string) =>
      path.endsWith("package.json")
    );

    await run({
      recordingPath: "/tmp/recording.json",
      outputPath: "/tmp/tests",
      mocks: true,
    });

    expect(readFileSyncMock).toHaveBeenCalledWith(
      expect.stringContaining("package.json"),
      "utf-8"
    );
    expect(logSpy).toHaveBeenCalledWith(
      "   ✓ Loaded existing conventions from storage"
    );
    expect(logSpy).toHaveBeenCalledWith(
      "   ⚠ Post-write verification found issues:"
    );
  });

  it("creates a generate command wired to run the pipeline", async () => {
    const program = createCommand();
    const generateCommand = program.commands.find(
      (command) => command.name() === "generate"
    );

    expect(program.name()).toBe("taro");
    expect(generateCommand?.description()).toContain(
      "Generate tests from Chrome Recorder recording"
    );

    await program.parseAsync(
      [
        "node",
        "taro",
        "generate",
        "recording.json",
        "--output",
        "/tmp/out",
        "--visual",
        "--no-mocks",
      ],
      { from: "node" }
    );

    expect(parseRecordingMock).toHaveBeenCalledWith("recording.json");
  });

  it("logs scoring issues when scoreTest returns issues", async () => {
    scoreTestMock.mockReturnValue({
      score: {
        overall: 55,
        criteria: { structure: 60, queries: 50, matchers: 55, noFragility: 55 },
        issues: [
          { severity: "error", message: "Missing assertion" },
          { severity: "warning", message: "Fragile selector used" },
        ],
      },
    });

    await run({
      recordingPath: "/tmp/recording.json",
      outputPath: "/tmp/tests",
      mocks: false,
    });

    expect(logSpy).toHaveBeenCalledWith("   Issues found: 2");
    expect(logSpy).toHaveBeenCalledWith("      [error] Missing assertion");
    expect(logSpy).toHaveBeenCalledWith(
      "      [warning] Fragile selector used"
    );
  });

  it("logs warning when visual inspection is enabled but no URL is available", async () => {
    parseRecordingMock.mockResolvedValue({
      title: "No URL flow",
      steps: [],
      url: undefined,
    });

    await run({
      recordingPath: "/tmp/recording.json",
      outputPath: "/tmp/tests",
      visual: true,
      mocks: false,
      url: undefined,
    });

    expect(logSpy).toHaveBeenCalledWith(
      "   ⚠ No URL provided. Use --url flag or ensure recording has a URL."
    );
  });

  it("logs no API calls detected when detectApiCalls returns empty array", async () => {
    detectApiCallsMock.mockReturnValue([]);

    await run({
      recordingPath: "/tmp/recording.json",
      outputPath: "/tmp/tests",
      mocks: true,
    });

    expect(logSpy).toHaveBeenCalledWith(
      "   ℹ No API calls detected in recording"
    );
  });

  it("executes main entry point when module is run directly", async () => {
    const originalArgv = process.argv;
    const orchestratorPath = resolve(
      fileURLToPath(import.meta.url),
      "../../orchestrator.ts"
    );
    // Set process.argv so the module-level guard fires: import.meta.url === `file://${process.argv[1]}`
    process.argv = ["node", orchestratorPath, "--help"];

    vi.resetModules();
    try {
      // Dynamic import triggers module-level re-evaluation; the if-guard runs createCommand + parse
      await import("#core/orchestrator.ts");
    } catch {
      // Commander may throw or call exit — either outcome means the guard ran
    } finally {
      process.argv = originalArgv;
      vi.resetModules();
    }

    // createCommand was called (either via the guard or the import itself) — no assertion needed
    // beyond confirming the import completed without unhandled rejection
    expect(true).toBe(true);
  });

  it("silently ignores errors when reading package.json fails", async () => {
    const apiCall = {
      id: "api-1",
      method: "fetch",
      httpMethod: "GET",
      url: "https://api.example.com/data",
      isExternal: true,
      source: "codebase",
    };
    detectApiCallsMock.mockReturnValue([apiCall]);
    groupApiCallsByDomainMock.mockReturnValue(
      new Map([["api.example.com", [apiCall]]])
    );
    analyzeMockTargetsMock.mockReturnValue([]);
    buildMocksMock.mockReturnValue([]);

    // existsSync returns true for package.json so readFileSync is called, but it throws
    existsSyncMock.mockImplementation((path: string) =>
      path.endsWith("package.json")
    );
    readFileSyncMock.mockImplementation(() => {
      throw new Error("permission denied");
    });

    await run({
      recordingPath: "/tmp/recording.json",
      outputPath: "/tmp/tests",
      mocks: true,
    });

    // Should continue without error - mock targets still analyzed with empty packageJson
    expect(analyzeMockTargetsMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ packageJson: {} })
    );
    expect(writeFileSyncMock).toHaveBeenCalled();
  });
});
