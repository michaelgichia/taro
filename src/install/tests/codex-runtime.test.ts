import {
  access,
  copyFile,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { resolveInstallTargets } from "#install/resolver.ts";
import { buildCodexOperations } from "#install/runtimes/codex.ts";
import type {
  InstallFileOperation,
  InstallLocation,
  InstallSelection,
  RuntimeLocationSelections,
} from "#install/types.ts";

const EXPECTED_SKILLS = [
  "@taro-test/rtl-conventions",
  "@taro-test/rtl-generate",
  "@taro-test/rtl-generate-i",
  "@taro-test/rtl-help",
  "@taro-test/rtl-init",
  "@taro-test/rtl-mocks",
  "@taro-test/rtl-overrides",
  "@taro-test/rtl-refresh",
  "@taro-test/rtl-target",
] as const;
const EXPECTED_GENERATE_REFERENCES = [
  "assertion-markers.md",
  "auth.md",
  "conventions-schema.md",
  "entry-path-fidelity.md",
  "intent-model.md",
  "mock-store.md",
  "quality-scoring.md",
  "state-schema.md",
  "test-index.md",
  "verification-gate.md",
] as const;
const EXPECTED_SKILL_DIRECTORIES = EXPECTED_SKILLS.map(
  (skillName) => skillName.split("/")[1]!
);
const sandboxRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    sandboxRoots
      .splice(0)
      .map((rootPath) => rm(rootPath, { recursive: true, force: true }))
  );
});

function createSelection(location: InstallLocation): InstallSelection {
  return {
    mode: "non-interactive",
    runtimes: ["codex"],
    locations: { codex: location } as RuntimeLocationSelections,
    source: "flags",
  };
}

async function createSandbox(label: string) {
  const rootPath = await mkdtemp(join(tmpdir(), `taro-${label}-`));
  sandboxRoots.push(rootPath);

  const homePath = join(rootPath, "home");
  const projectPath = join(rootPath, "workspace", "app");

  await mkdir(homePath, { recursive: true });
  await mkdir(projectPath, { recursive: true });

  return { rootPath, homePath, projectPath };
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

function resolveTarget(location: InstallLocation, cwd: string, home: string) {
  const [target] = resolveInstallTargets(createSelection(location), {
    cwd,
    home,
  });

  expect(target).toBeDefined();
  return target!;
}

describe("buildCodexOperations", () => {
  it("rejects mismatched runtime ids", async () => {
    const sandbox = await createSandbox("codex-mismatch");
    const codexTarget = resolveTarget(
      "global",
      sandbox.projectPath,
      sandbox.homePath
    );

    expect(() =>
      buildCodexOperations({
        ...codexTarget,
        id: "gemini",
      } as typeof codexTarget)
    ).toThrow("Codex runtime builder received gemini.");
  });

  it("installs multiple namespaced skill directories into the global Codex home", async () => {
    const sandbox = await createSandbox("codex-global");
    const target = resolveTarget(
      "global",
      sandbox.projectPath,
      sandbox.homePath
    );
    const operations = buildCodexOperations(target);

    await materializeOperations(operations);

    expect(target.destinationDirectory).toBe(join(sandbox.homePath, ".codex"));

    const installedSkills = (
      await readdir(join(target.destinationDirectory, "skills", "@taro-test"))
    ).sort();
    expect(installedSkills).toEqual([...EXPECTED_SKILL_DIRECTORIES]);

    const helpSkill = await readFile(
      join(
        target.destinationDirectory,
        "skills",
        "@taro-test",
        "rtl-help",
        "SKILL.md"
      ),
      "utf8"
    );
    expect(helpSkill).toContain("$@taro-test/rtl-help");
    expect(helpSkill).toContain("## Routing guide");
    expect(operations.map((operation) => operation.entrypoint)).toContain(
      "$@taro-test/rtl-help"
    );
    expect(operations.map((operation) => operation.entrypoint)).toContain(
      "$@taro-test/rtl-init"
    );
    expect(operations.map((operation) => operation.entrypoint)).toContain(
      "$@taro-test/rtl-generate-i"
    );
    expect(operations.map((operation) => operation.entrypoint)).toContain(
      "$@taro-test/rtl-target"
    );
    expect(operations.map((operation) => operation.entrypoint)).toContain(
      "$@taro-test/rtl-refresh"
    );
    expect(operations.map((operation) => operation.entrypoint)).toContain(
      "$@taro-test/rtl-overrides"
    );
  });

  it("installs the same packaged skill surface into a local .codex directory", async () => {
    const sandbox = await createSandbox("codex-local");
    const target = resolveTarget(
      "local",
      sandbox.projectPath,
      sandbox.homePath
    );
    const operations = buildCodexOperations(target);

    await materializeOperations(operations);

    expect(target.destinationDirectory).toBe(
      join(sandbox.projectPath, ".codex")
    );

    const installedSkills = (
      await readdir(join(target.destinationDirectory, "skills", "@taro-test"))
    ).sort();
    expect(installedSkills).toEqual([...EXPECTED_SKILL_DIRECTORIES]);

    const helpSkill = await readFile(
      join(
        target.destinationDirectory,
        "skills",
        "@taro-test",
        "rtl-help",
        "SKILL.md"
      ),
      "utf8"
    );
    expect(helpSkill).toContain(
      "Invoke this skill with `$@taro-test/rtl-help`."
    );
    expect(helpSkill).toContain("Return:");

    const generateSkill = await readFile(
      join(
        target.destinationDirectory,
        "skills",
        "@taro-test",
        "rtl-generate",
        "SKILL.md"
      ),
      "utf8"
    );
    expect(generateSkill).toContain("## Reference Map");
    expect(generateSkill).toContain(
      `Run \`${target.runtimeCommand} __generate <recording-file>\``
    );

    const interactiveGenerateSkill = await readFile(
      join(
        target.destinationDirectory,
        "skills",
        "@taro-test",
        "rtl-generate-i",
        "SKILL.md"
      ),
      "utf8"
    );
    expect(interactiveGenerateSkill).toContain("$@taro-test/rtl-generate-i");
    expect(interactiveGenerateSkill).toContain(
      `Run \`${target.runtimeCommand} __generate -i <recording-file>\``
    );

    const targetSkill = await readFile(
      join(
        target.destinationDirectory,
        "skills",
        "@taro-test",
        "rtl-target",
        "SKILL.md"
      ),
      "utf8"
    );
    expect(targetSkill).toContain("$@taro-test/rtl-target");
    expect(targetSkill).toContain(
      `Run \`${target.runtimeCommand} __target <component-file>\``
    );

    const installedGenerateReferences = (
      await readdir(
        join(
          target.destinationDirectory,
          "skills",
          "@taro-test",
          "rtl-generate",
          "references"
        )
      )
    ).sort();
    expect(installedGenerateReferences).toEqual([
      ...EXPECTED_GENERATE_REFERENCES,
    ]);

    const conventionsSkill = await readFile(
      join(
        target.destinationDirectory,
        "skills",
        "@taro-test",
        "rtl-conventions",
        "SKILL.md"
      ),
      "utf8"
    );
    expect(conventionsSkill).toContain("## Investigation Workflow");

    const mocksSkillPath = join(
      target.destinationDirectory,
      "skills",
      "@taro-test",
      "rtl-mocks",
      "SKILL.md"
    );
    await access(mocksSkillPath);
    const mocksSkill = await readFile(mocksSkillPath, "utf8");
    expect(mocksSkill).toContain("## Boundary Review Workflow");

    const initSkill = await readFile(
      join(
        target.destinationDirectory,
        "skills",
        "@taro-test",
        "rtl-init",
        "SKILL.md"
      ),
      "utf8"
    );
    expect(initSkill).toContain("$@taro-test/rtl-init");

    const refreshSkill = await readFile(
      join(
        target.destinationDirectory,
        "skills",
        "@taro-test",
        "rtl-refresh",
        "SKILL.md"
      ),
      "utf8"
    );
    expect(refreshSkill).toContain("$@taro-test/rtl-refresh");

    const overridesSkill = await readFile(
      join(
        target.destinationDirectory,
        "skills",
        "@taro-test",
        "rtl-overrides",
        "SKILL.md"
      ),
      "utf8"
    );
    expect(overridesSkill).toContain("$@taro-test/rtl-overrides");
    expect(overridesSkill).toContain(
      `Run \`${target.runtimeCommand} __overrides\``
    );
  });
});
