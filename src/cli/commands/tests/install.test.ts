import { readFile, rm, writeFile } from "node:fs/promises";
import { mkdir, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { runInstallCommand } from "#cli/commands/install.ts";
import { buildRuntimeCommand } from "#install/runtime-launcher.ts";

const sandboxRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    sandboxRoots
      .splice(0)
      .map((root) => rm(root, { recursive: true, force: true }))
  );
  process.exitCode = undefined;
});

async function createSandbox(label: string) {
  const root = await mkdtemp(join(tmpdir(), `taro-cli-${label}-`));
  const cwd = join(root, "project");
  const home = join(root, "home");
  const packageRoot = join(root, "package");

  sandboxRoots.push(root);
  await mkdir(cwd, { recursive: true });
  await mkdir(home, { recursive: true });
  await mkdir(join(packageRoot, "dist"), { recursive: true });
  await writeFile(
    join(packageRoot, "dist", "index.js"),
    "if (process.argv.includes('--version')) process.stdout.write('0.0.0\\n')\n"
  );

  return { cwd, home, packageRoot };
}

function createLogger() {
  const logs: string[] = [];
  const errors: string[] = [];

  return {
    logs,
    errors,
    logger: {
      log: (value: string) => logs.push(value),
      error: (value: string) => errors.push(value),
    },
  };
}

describe("runInstallCommand", () => {
  it("installs all runtimes and reports verification commands", async () => {
    const sandbox = await createSandbox("all-global");
    const { logs, logger } = createLogger();

    await runInstallCommand(
      { all: true, global: true },
      {
        cwd: sandbox.cwd,
        home: sandbox.home,
        packageRoot: sandbox.packageRoot,
        logger,
      }
    );

    const output = logs.join("\n");

    expect(process.exitCode).toBeUndefined();
    expect(output).toContain("Install complete.");
    expect(output).toContain("/@tr/rtl:help (verified at");
    expect(output).toContain("/@tr/rtl-help (verified at");
    expect(output).toContain("$@tr/rtl-help (verified at");

    const runtimeCommand = buildRuntimeCommand(
      process.execPath,
      join(sandbox.packageRoot, "dist", "index.js")
    );

    await expect(
      readFile(
        join(
          sandbox.home,
          ".codex",
          "skills",
          "@tr",
          "rtl-help",
          "SKILL.md"
        ),
        "utf8"
      )
    ).resolves.toContain("$@tr/rtl-help");
    await expect(
      readFile(
        join(
          sandbox.home,
          ".claude",
          "commands",
          "@tr",
          "rtl",
          "init.md"
        ),
        "utf8"
      )
    ).resolves.toContain(`${runtimeCommand} __init`);
    await expect(
      readFile(
        join(
          sandbox.home,
          ".claude",
          "commands",
          "@tr",
          "rtl",
          "refresh.md"
        ),
        "utf8"
      )
    ).resolves.toContain(`${runtimeCommand} __refresh`);
    await expect(
      readFile(
        join(
          sandbox.home,
          ".claude",
          "commands",
          "@tr",
          "rtl",
          "overrides.md"
        ),
        "utf8"
      )
    ).resolves.toContain(`${runtimeCommand} __overrides`);
    await expect(
      readFile(
        join(
          sandbox.home,
          ".codex",
          "skills",
          "@tr",
          "rtl-init",
          "SKILL.md"
        ),
        "utf8"
      )
    ).resolves.toContain("$@tr/rtl-init");
    await expect(
      readFile(
        join(
          sandbox.home,
          ".codex",
          "skills",
          "@tr",
          "rtl-refresh",
          "SKILL.md"
        ),
        "utf8"
      )
    ).resolves.toContain("$@tr/rtl-refresh");
    await expect(
      readFile(
        join(
          sandbox.home,
          ".codex",
          "skills",
          "@tr",
          "rtl-overrides",
          "SKILL.md"
        ),
        "utf8"
      )
    ).resolves.toContain("$@tr/rtl-overrides");
    await expect(
      readFile(
        join(
          sandbox.home,
          ".codex",
          "skills",
          "@tr",
          "rtl-grade",
          "SKILL.md"
        ),
        "utf8"
      )
    ).resolves.toContain("$@tr/rtl-grade");
    await expect(
      readFile(
        join(
          sandbox.home,
          ".claude",
          "commands",
          "@tr",
          "rtl",
          "regrade.md"
        ),
        "utf8"
      )
    ).resolves.toContain(`${runtimeCommand} __regrade <test-file>`);
  });

  it("reports update results on rerun in non-interactive mode", async () => {
    const sandbox = await createSandbox("replace");
    const firstRun = createLogger();
    const secondRun = createLogger();

    await runInstallCommand(
      { claude: true, global: true },
      {
        cwd: sandbox.cwd,
        home: sandbox.home,
        packageRoot: sandbox.packageRoot,
        logger: firstRun.logger,
      }
    );

    process.exitCode = undefined;

    await runInstallCommand(
      { claude: true, global: true },
      {
        cwd: sandbox.cwd,
        home: sandbox.home,
        packageRoot: sandbox.packageRoot,
        logger: secondRun.logger,
      }
    );

    const output = secondRun.logs.join("\n");

    expect(process.exitCode).toBeUndefined();
    expect(output).toMatch(/updated \d+ owned asset\(s\)/);
  });

  it("reports repaired outcomes when a rerun restores a missing owned asset", async () => {
    const sandbox = await createSandbox("repair");
    const firstRun = createLogger();
    const secondRun = createLogger();

    await runInstallCommand(
      { gemini: true, global: true },
      {
        cwd: sandbox.cwd,
        home: sandbox.home,
        packageRoot: sandbox.packageRoot,
        logger: firstRun.logger,
      }
    );

    await rm(
      join(
        sandbox.home,
        ".gemini",
        "commands",
        "@tr",
        "rtl",
        "help.toml"
      ),
      { force: true }
    );
    process.exitCode = undefined;

    await runInstallCommand(
      { gemini: true, global: true },
      {
        cwd: sandbox.cwd,
        home: sandbox.home,
        packageRoot: sandbox.packageRoot,
        logger: secondRun.logger,
      }
    );

    const output = secondRun.logs.join("\n");

    expect(process.exitCode).toBeUndefined();
    expect(output).toMatch(/repaired \d+ owned asset\(s\)/);
  });
});
