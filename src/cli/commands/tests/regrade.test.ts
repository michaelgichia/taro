import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { stripVTControlCharacters } from "node:util";

import { afterEach, describe, expect, it, vi } from "vitest";

import { createRegradeCommand } from "#cli/commands/regrade.ts";

const sandboxes: string[] = [];

afterEach(async () => {
  await Promise.all(
    sandboxes
      .splice(0)
      .map((root) => rm(root, { recursive: true, force: true }))
  );
});

class ProcessExitSignal {
  constructor(public readonly code: number) {}
}

async function createSandbox(label: string) {
  const root = await mkdtemp(join(tmpdir(), `taro-regrade-${label}-`));
  sandboxes.push(root);
  await mkdir(root, { recursive: true });
  return root;
}

async function runRegrade(args: string[], cwdPath: string) {
  const command = createRegradeCommand();
  const stderrChunks: string[] = [];
  const stdoutChunks: string[] = [];
  const stderrSpy = vi
    .spyOn(process.stderr, "write")
    .mockImplementation((chunk) => {
      stderrChunks.push(String(chunk));
      return true;
    });
  const stdoutSpy = vi
    .spyOn(process.stdout, "write")
    .mockImplementation((chunk) => {
      stdoutChunks.push(String(chunk));
      return true;
    });
  const exitSpy = vi
    .spyOn(process, "exit")
    .mockImplementation((code?: number) => {
      throw new ProcessExitSignal(code ?? 0);
    });
  const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
  const errorSpy = vi
    .spyOn(console, "error")
    .mockImplementation(() => undefined);
  const originalCwd = process.cwd();
  let thrown: unknown;
  let exitCode: number | undefined;

  process.chdir(cwdPath);

  try {
    await command.parseAsync(args, { from: "user" });
  } catch (error) {
    if (error instanceof ProcessExitSignal) {
      exitCode = error.code;
    } else {
      thrown = error;
    }
  } finally {
    process.chdir(originalCwd);
    stderrSpy.mockRestore();
    stdoutSpy.mockRestore();
    exitSpy.mockRestore();
    warnSpy.mockRestore();
    errorSpy.mockRestore();
  }

  return {
    errors: stripVTControlCharacters(errorSpy.mock.calls.flat().join("\n")),
    exitCode,
    logs: stripVTControlCharacters(stderrChunks.join("")),
    stdout: stripVTControlCharacters(stdoutChunks.join("")),
    thrown,
    warnings: stripVTControlCharacters(warnSpy.mock.calls.flat().join("\n")),
  };
}

describe("createRegradeCommand", () => {
  it("rejects directory input unless --directory-loop is passed", async () => {
    const root = await createSandbox("dir-requires-flag");
    const testsDir = join(root, "src", "tests");
    await mkdir(testsDir, { recursive: true });
    await writeFile(
      join(testsDir, "CheckoutFlow.test.tsx"),
      "describe('CheckoutFlow', () => {})\n",
      "utf-8"
    );

    const result = await runRegrade([testsDir], root);

    expect(result.exitCode).toBe(2);
    expect(result.logs).toContain("Directory input requires --directory-loop");
  });

  it("rejects --directory-loop when the target is a single file", async () => {
    const root = await createSandbox("file-rejects-dir-flag");
    const testFile = join(root, "src", "CheckoutFlow.test.tsx");
    await mkdir(dirname(testFile), { recursive: true });
    await writeFile(testFile, "describe('CheckoutFlow', () => {})\n", "utf-8");

    const result = await runRegrade([testFile, "--directory-loop"], root);

    expect(result.exitCode).toBe(2);
    expect(result.logs).toContain(
      "--directory-loop is only valid when the target path is a directory"
    );
  });
});
