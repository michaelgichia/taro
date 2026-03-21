import {
  access,
  copyFile,
  mkdtemp,
  readdir,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { TARO_REFERENCE_FILES } from "#install/reference-files.ts";
import { resolveInstallTargets } from "#install/resolver.ts";
import { buildClaudeRuntimeOperations } from "#install/runtimes/claude.ts";
import { buildGeminiRuntimeOperations } from "#install/runtimes/gemini.ts";
import { buildOpenCodeRuntimeOperations } from "#install/runtimes/opencode.ts";
import { buildPromptRuntimeOperations } from "#install/runtimes/prompt-runtimes.ts";
import type {
  InstallFileOperation,
  InstallLocation,
  InstallSelection,
  RuntimeLocationSelections,
  RuntimeTarget,
} from "#install/types.ts";

const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempRoots
      .splice(0)
      .map(async (root) => rm(root, { recursive: true, force: true }))
  );
});

function createSelection(
  runtime: RuntimeTarget,
  location: InstallLocation
): InstallSelection {
  return {
    mode: "non-interactive",
    runtimes: [runtime],
    locations: { [runtime]: location } as RuntimeLocationSelections,
    source: "flags",
  };
}

async function createInstallContext(): Promise<{ cwd: string; home: string }> {
  const root = await mkdtemp(join(tmpdir(), "taro-install-"));
  const cwd = join(root, "project");
  const home = join(root, "home");

  tempRoots.push(root);
  await mkdir(cwd, { recursive: true });
  await mkdir(home, { recursive: true });

  return { cwd, home };
}

async function materializeOperations(
  operations: InstallFileOperation[]
): Promise<void> {
  for (const operation of operations) {
    await mkdir(dirname(operation.targetPath), { recursive: true });
    if (operation.renderedContent != null) {
      await writeFile(operation.targetPath, operation.renderedContent);
    } else {
      await copyFile(operation.sourcePath, operation.targetPath);
    }
  }
}

async function expectFile(path: string): Promise<string> {
  await access(path);
  return readFile(path, "utf8");
}

function resolveTarget(
  runtime: RuntimeTarget,
  location: InstallLocation,
  cwd: string,
  home: string
) {
  const [target] = resolveInstallTargets(createSelection(runtime, location), {
    cwd,
    home,
  });

  expect(target).toBeDefined();
  return target!;
}

describe("prompt runtime install builders", () => {
  it("rejects unsupported runtime ids in the generic prompt builder", async () => {
    const { cwd, home } = await createInstallContext();

    expect(() =>
      buildPromptRuntimeOperations(resolveTarget("codex", "global", cwd, home))
    ).toThrow("Prompt runtime operations do not support codex.");
  });

  it("rejects mismatched runtime ids for the prompt-runtime wrappers", async () => {
    const { cwd, home } = await createInstallContext();

    expect(() =>
      buildClaudeRuntimeOperations(resolveTarget("gemini", "global", cwd, home))
    ).toThrow("Claude runtime builder received gemini.");
    expect(() =>
      buildGeminiRuntimeOperations(resolveTarget("claude", "global", cwd, home))
    ).toThrow("Gemini runtime builder received claude.");
    expect(() =>
      buildOpenCodeRuntimeOperations(
        resolveTarget("claude", "global", cwd, home)
      )
    ).toThrow("OpenCode runtime builder received claude.");
  });

  it("installs Claude Code assets into the global .claude command namespace", async () => {
    const { cwd, home } = await createInstallContext();
    const target = resolveTarget("claude", "global", cwd, home);

    const operations = buildClaudeRuntimeOperations(target);
    await materializeOperations(operations);

    const helpPath = join(
      home,
      ".claude",
      "commands",
      "@taro-test",
      "rtl",
      "help.md"
    );
    const helpContent = await expectFile(helpPath);
    const initContent = await expectFile(
      join(home, ".claude", "commands", "@taro-test", "rtl", "init.md")
    );
    const refreshContent = await expectFile(
      join(home, ".claude", "commands", "@taro-test", "rtl", "refresh.md")
    );
    const gradeContent = await expectFile(
      join(home, ".claude", "commands", "@taro-test", "rtl", "grade.md")
    );
    const regradeContent = await expectFile(
      join(home, ".claude", "commands", "@taro-test", "rtl", "regrade.md")
    );
    const overridesContent = await expectFile(
      join(home, ".claude", "commands", "@taro-test", "rtl", "overrides.md")
    );

    expect(operations.map((operation) => operation.entrypoint)).toContain(
      "/@taro-test/rtl:help"
    );
    expect(operations.map((operation) => operation.entrypoint)).toContain(
      "/@taro-test/rtl:init"
    );
    expect(operations.map((operation) => operation.entrypoint)).toContain(
      "/@taro-test/rtl:generate-i"
    );
    expect(operations.map((operation) => operation.entrypoint)).toContain(
      "/@taro-test/rtl:grade"
    );
    expect(operations.map((operation) => operation.entrypoint)).toContain(
      "/@taro-test/rtl:regrade"
    );
    expect(operations.map((operation) => operation.entrypoint)).toContain(
      "/@taro-test/rtl:target"
    );
    expect(operations.map((operation) => operation.entrypoint)).toContain(
      "/@taro-test/rtl:refresh"
    );
    expect(operations.map((operation) => operation.entrypoint)).toContain(
      "/@taro-test/rtl:overrides"
    );
    expect(helpContent).toContain("/@taro-test/rtl:help");
    expect(initContent).toContain(`${target.runtimeCommand} __init`);
    expect(refreshContent).toContain(`${target.runtimeCommand} __refresh`);
    expect(gradeContent).toContain("Do not invent or invoke `__grade`.");
    expect(regradeContent).toContain("Do not invent or invoke `__regrade`.");
    expect(overridesContent).toContain(`${target.runtimeCommand} __overrides`);
    expect(
      operations.map((operation) => operation.relativeDestinationPath)
    ).toContain("commands/@taro-test/rtl/references/assertion-markers.md");
  });

  it("installs Claude Code assets into the local .claude command namespace", async () => {
    const { cwd, home } = await createInstallContext();
    const target = resolveTarget("claude", "local", cwd, home);

    await materializeOperations(buildClaudeRuntimeOperations(target));

    const generateContent = await expectFile(
      join(cwd, ".claude", "commands", "@taro-test", "rtl", "generate.md")
    );
    const interactiveGenerateContent = await expectFile(
      join(cwd, ".claude", "commands", "@taro-test", "rtl", "generate-i.md")
    );
    const targetContent = await expectFile(
      join(cwd, ".claude", "commands", "@taro-test", "rtl", "target.md")
    );
    const gradeContent = await expectFile(
      join(cwd, ".claude", "commands", "@taro-test", "rtl", "grade.md")
    );
    const regradeContent = await expectFile(
      join(cwd, ".claude", "commands", "@taro-test", "rtl", "regrade.md")
    );
    const overridesContent = await expectFile(
      join(cwd, ".claude", "commands", "@taro-test", "rtl", "overrides.md")
    );
    expect(generateContent).toContain("allowed-tools:");
    expect(generateContent).toContain("references/assertion-markers.md");
    expect(interactiveGenerateContent).toContain(
      `${target.runtimeCommand} __generate -i <recording-file>`
    );
    expect(targetContent).toContain(
      `${target.runtimeCommand} __target <component-file>`
    );
    expect(gradeContent).toContain("Strong `B` example");
    expect(regradeContent).toContain("latest 5 snapshots");
    expect(overridesContent).toContain(`${target.runtimeCommand} __overrides`);

    const installedGenerateReferences = (
      await readdir(
        join(cwd, ".claude", "commands", "@taro-test", "rtl", "references")
      )
    ).sort();
    expect(installedGenerateReferences).toEqual([...TARO_REFERENCE_FILES]);
  });

  it("installs Gemini CLI assets into the global .gemini command namespace", async () => {
    const { cwd, home } = await createInstallContext();
    const target = resolveTarget("gemini", "global", cwd, home);

    const operations = buildGeminiRuntimeOperations(target);
    await materializeOperations(operations);

    const helpContent = await expectFile(
      join(home, ".gemini", "commands", "@taro-test", "rtl", "help.toml")
    );
    const initContent = await expectFile(
      join(home, ".gemini", "commands", "@taro-test", "rtl", "init.toml")
    );
    const refreshContent = await expectFile(
      join(home, ".gemini", "commands", "@taro-test", "rtl", "refresh.toml")
    );
    const gradeContent = await expectFile(
      join(home, ".gemini", "commands", "@taro-test", "rtl", "grade.toml")
    );
    const regradeContent = await expectFile(
      join(home, ".gemini", "commands", "@taro-test", "rtl", "regrade.toml")
    );
    const overridesContent = await expectFile(
      join(home, ".gemini", "commands", "@taro-test", "rtl", "overrides.toml")
    );

    expect(operations.map((operation) => operation.entrypoint)).toContain(
      "/@taro-test/rtl:help"
    );
    expect(operations.map((operation) => operation.entrypoint)).toContain(
      "/@taro-test/rtl:init"
    );
    expect(operations.map((operation) => operation.entrypoint)).toContain(
      "/@taro-test/rtl:generate-i"
    );
    expect(operations.map((operation) => operation.entrypoint)).toContain(
      "/@taro-test/rtl:grade"
    );
    expect(operations.map((operation) => operation.entrypoint)).toContain(
      "/@taro-test/rtl:regrade"
    );
    expect(operations.map((operation) => operation.entrypoint)).toContain(
      "/@taro-test/rtl:target"
    );
    expect(operations.map((operation) => operation.entrypoint)).toContain(
      "/@taro-test/rtl:refresh"
    );
    expect(operations.map((operation) => operation.entrypoint)).toContain(
      "/@taro-test/rtl:overrides"
    );
    expect(helpContent).toContain("/@taro-test/rtl:help");
    expect(initContent).toContain(`\`${target.runtimeCommand} __init\``);
    expect(refreshContent).toContain(`\`${target.runtimeCommand} __refresh\``);
    expect(gradeContent).toContain("Do not invent or invoke `__grade`.");
    expect(regradeContent).toContain("Do not invent or invoke `__regrade`.");
    expect(overridesContent).toContain(
      `\`${target.runtimeCommand} __overrides\``
    );
  });

  it("installs Gemini CLI assets into the local .gemini command namespace", async () => {
    const { cwd, home } = await createInstallContext();
    const target = resolveTarget("gemini", "local", cwd, home);

    await materializeOperations(buildGeminiRuntimeOperations(target));

    const generateContent = await expectFile(
      join(cwd, ".gemini", "commands", "@taro-test", "rtl", "generate.toml")
    );
    const interactiveGenerateContent = await expectFile(
      join(cwd, ".gemini", "commands", "@taro-test", "rtl", "generate-i.toml")
    );
    const targetContent = await expectFile(
      join(cwd, ".gemini", "commands", "@taro-test", "rtl", "target.toml")
    );
    const gradeContent = await expectFile(
      join(cwd, ".gemini", "commands", "@taro-test", "rtl", "grade.toml")
    );
    const regradeContent = await expectFile(
      join(cwd, ".gemini", "commands", "@taro-test", "rtl", "regrade.toml")
    );
    const overridesContent = await expectFile(
      join(cwd, ".gemini", "commands", "@taro-test", "rtl", "overrides.toml")
    );
    expect(generateContent).toContain(
      `\`${target.runtimeCommand} __generate <recording-file>\``
    );
    expect(interactiveGenerateContent).toContain(
      `\`${target.runtimeCommand} __generate -i <recording-file>\``
    );
    expect(targetContent).toContain(
      `\`${target.runtimeCommand} __target <component-file>\``
    );
    expect(gradeContent).toContain("Strong B");
    expect(regradeContent).toContain("latest 5 snapshots");
    expect(overridesContent).toContain(
      `\`${target.runtimeCommand} __overrides\``
    );
    expect(generateContent).not.toContain("--dry-run");
  });

  it("installs OpenCode assets into the global commands namespace", async () => {
    const { cwd, home } = await createInstallContext();
    const target = resolveTarget("opencode", "global", cwd, home);

    const operations = buildOpenCodeRuntimeOperations(target);
    await materializeOperations(operations);

    const helpContent = await expectFile(
      join(home, ".config", "opencode", "commands", "@taro-test", "rtl-help.md")
    );
    const initContent = await expectFile(
      join(home, ".config", "opencode", "commands", "@taro-test", "rtl-init.md")
    );
    const refreshContent = await expectFile(
      join(
        home,
        ".config",
        "opencode",
        "commands",
        "@taro-test",
        "rtl-refresh.md"
      )
    );
    const gradeContent = await expectFile(
      join(
        home,
        ".config",
        "opencode",
        "commands",
        "@taro-test",
        "rtl-grade.md"
      )
    );
    const regradeContent = await expectFile(
      join(
        home,
        ".config",
        "opencode",
        "commands",
        "@taro-test",
        "rtl-regrade.md"
      )
    );
    const overridesContent = await expectFile(
      join(
        home,
        ".config",
        "opencode",
        "commands",
        "@taro-test",
        "rtl-overrides.md"
      )
    );

    expect(operations.map((operation) => operation.entrypoint)).toContain(
      "/@taro-test/rtl-help"
    );
    expect(operations.map((operation) => operation.entrypoint)).toContain(
      "/@taro-test/rtl-init"
    );
    expect(operations.map((operation) => operation.entrypoint)).toContain(
      "/@taro-test/rtl-generate-i"
    );
    expect(operations.map((operation) => operation.entrypoint)).toContain(
      "/@taro-test/rtl-grade"
    );
    expect(operations.map((operation) => operation.entrypoint)).toContain(
      "/@taro-test/rtl-regrade"
    );
    expect(operations.map((operation) => operation.entrypoint)).toContain(
      "/@taro-test/rtl-target"
    );
    expect(operations.map((operation) => operation.entrypoint)).toContain(
      "/@taro-test/rtl-refresh"
    );
    expect(operations.map((operation) => operation.entrypoint)).toContain(
      "/@taro-test/rtl-overrides"
    );
    expect(helpContent).toContain("/@taro-test/rtl-help");
    expect(initContent).toContain(`${target.runtimeCommand} __init`);
    expect(refreshContent).toContain(`${target.runtimeCommand} __refresh`);
    expect(gradeContent).toContain("Do not invent or invoke `__grade`.");
    expect(regradeContent).toContain("Do not invent or invoke `__regrade`.");
    expect(overridesContent).toContain(
      `\`${target.runtimeCommand} __overrides\``
    );
  });

  it("installs OpenCode assets into the local .opencode command namespace", async () => {
    const { cwd, home } = await createInstallContext();
    const target = resolveTarget("opencode", "local", cwd, home);

    await materializeOperations(buildOpenCodeRuntimeOperations(target));

    const generateContent = await expectFile(
      join(cwd, ".opencode", "commands", "@taro-test", "rtl-generate.md")
    );
    const interactiveGenerateContent = await expectFile(
      join(cwd, ".opencode", "commands", "@taro-test", "rtl-generate-i.md")
    );
    const targetContent = await expectFile(
      join(cwd, ".opencode", "commands", "@taro-test", "rtl-target.md")
    );
    const gradeContent = await expectFile(
      join(cwd, ".opencode", "commands", "@taro-test", "rtl-grade.md")
    );
    const regradeContent = await expectFile(
      join(cwd, ".opencode", "commands", "@taro-test", "rtl-regrade.md")
    );
    const overridesContent = await expectFile(
      join(cwd, ".opencode", "commands", "@taro-test", "rtl-overrides.md")
    );
    expect(generateContent).toContain(
      `\`${target.runtimeCommand} __generate <recording-file>\``
    );
    expect(interactiveGenerateContent).toContain(
      `\`${target.runtimeCommand} __generate -i <recording-file>\``
    );
    expect(targetContent).toContain(
      `\`${target.runtimeCommand} __target <component-file>\``
    );
    expect(gradeContent).toContain("Strong `B`");
    expect(regradeContent).toContain("latest 5 snapshots");
    expect(overridesContent).toContain(
      `\`${target.runtimeCommand} __overrides\``
    );
    expect(generateContent).not.toContain("--dry-run");
  });
});
