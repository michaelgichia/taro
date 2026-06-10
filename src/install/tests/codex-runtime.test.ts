import {
  access,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { resolveInstallTargets } from "#install/resolver.ts";
import { buildCodexOperations } from "#install/runtimes/codex.ts";
import {
  createSingleRuntimeSelection,
  materializeOperations,
} from "#install/tests/test-utils.ts";
import type { InstallLocation } from "#install/types.ts";

const EXPECTED_SKILLS = [
  "@tr/rtl-conventions",
  "@tr/rtl-gen",
  "@tr/rtl-geni",
  "@tr/rtl-grade",
  "@tr/rtl-help",
  "@tr/rtl-init",
  "@tr/rtl-mocks",
  "@tr/rtl-overrides",
  "@tr/rtl-regrade",
  "@tr/rtl-refresh",
  "@tr/rtl-target",
] as const;
const EXPECTED_GENERATE_REFERENCES = [
  "assertion-markers.md",
  "auth.md",
  "boundary-patterns.md",
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
).sort();
const sandboxRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    sandboxRoots
      .splice(0)
      .map((rootPath) => rm(rootPath, { recursive: true, force: true }))
  );
});

async function createSandbox(label: string) {
  const rootPath = await mkdtemp(join(tmpdir(), `taro-${label}-`));
  sandboxRoots.push(rootPath);

  const homePath = join(rootPath, "home");
  const projectPath = join(rootPath, "workspace", "app");

  await mkdir(homePath, { recursive: true });
  await mkdir(projectPath, { recursive: true });

  return { rootPath, homePath, projectPath };
}

function resolveTarget(location: InstallLocation, cwd: string, home: string) {
  const [target] = resolveInstallTargets(
    createSingleRuntimeSelection("codex", location),
    { cwd, home }
  );

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
      await readdir(join(target.destinationDirectory, "skills", "@tr"))
    ).sort();
    expect(installedSkills).toEqual([...EXPECTED_SKILL_DIRECTORIES]);

    const helpSkill = await readFile(
      join(
        target.destinationDirectory,
        "skills",
        "@tr",
        "rtl-help",
        "SKILL.md"
      ),
      "utf8"
    );
    expect(helpSkill).toContain("$@tr/rtl-help");
    expect(helpSkill).toContain("## Routing guide");
    expect(helpSkill).toContain("--directory-loop");
    expect(helpSkill).toContain(".taro/directory-loop/");
    expect(operations.map((operation) => operation.entrypoint)).toContain(
      "$@tr/rtl-help"
    );
    expect(operations.map((operation) => operation.entrypoint)).toContain(
      "$@tr/rtl-init"
    );
    expect(operations.map((operation) => operation.entrypoint)).toContain(
      "$@tr/rtl-geni"
    );
    expect(operations.map((operation) => operation.entrypoint)).toContain(
      "$@tr/rtl-grade"
    );
    expect(operations.map((operation) => operation.entrypoint)).toContain(
      "$@tr/rtl-regrade"
    );
    expect(operations.map((operation) => operation.entrypoint)).toContain(
      "$@tr/rtl-target"
    );
    expect(operations.map((operation) => operation.entrypoint)).toContain(
      "$@tr/rtl-mocks"
    );
    expect(operations.map((operation) => operation.entrypoint)).toContain(
      "$@tr/rtl-refresh"
    );
    expect(operations.map((operation) => operation.entrypoint)).toContain(
      "$@tr/rtl-overrides"
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
      await readdir(join(target.destinationDirectory, "skills", "@tr"))
    ).sort();
    expect(installedSkills).toEqual([...EXPECTED_SKILL_DIRECTORIES]);

    const helpSkill = await readFile(
      join(
        target.destinationDirectory,
        "skills",
        "@tr",
        "rtl-help",
        "SKILL.md"
      ),
      "utf8"
    );
    expect(helpSkill).toContain(
      "Invoke this skill with `$@tr/rtl-help`."
    );
    expect(helpSkill).toContain("$@tr/rtl-mocks");
    expect(helpSkill).toContain("Return:");
    expect(helpSkill).toContain("--directory-loop");
    expect(helpSkill).toContain(".taro/directory-loop/");

    const generateSkill = await readFile(
      join(
        target.destinationDirectory,
        "skills",
        "@tr",
        "rtl-gen",
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
        "@tr",
        "rtl-geni",
        "SKILL.md"
      ),
      "utf8"
    );
    expect(interactiveGenerateSkill).toContain("$@tr/rtl-geni");
    expect(interactiveGenerateSkill).toContain(
      `Run \`${target.runtimeCommand} __generate -i <recording-file>\``
    );

    const gradeSkill = await readFile(
      join(
        target.destinationDirectory,
        "skills",
        "@tr",
        "rtl-grade",
        "SKILL.md"
      ),
      "utf8"
    );
    expect(gradeSkill).toContain("$@tr/rtl-grade");
    expect(gradeSkill).toContain("## Worked Examples");
    expect(gradeSkill).toContain(
      `${target.runtimeCommand} __grade <test-file>`
    );

    const regradeSkill = await readFile(
      join(
        target.destinationDirectory,
        "skills",
        "@tr",
        "rtl-regrade",
        "SKILL.md"
      ),
      "utf8"
    );
    expect(regradeSkill).toContain("$@tr/rtl-regrade");
    expect(regradeSkill).toContain("latest 5 snapshots");
    expect(regradeSkill).toContain(
      `${target.runtimeCommand} __regrade <test-directory> --directory-loop`
    );
    expect(regradeSkill).toContain(
      `${target.runtimeCommand} __regrade <test-file>`
    );
    expect(regradeSkill).toContain(".taro/directory-loop/");
    expect(regradeSkill).toContain("current score threshold");
    expect(regradeSkill).toContain("updated score threshold");

    const targetSkill = await readFile(
      join(
        target.destinationDirectory,
        "skills",
        "@tr",
        "rtl-target",
        "SKILL.md"
      ),
      "utf8"
    );
    expect(targetSkill).toContain("$@tr/rtl-target");
    expect(targetSkill).toContain(
      `Run \`${target.runtimeCommand} __target <component-file>\``
    );
    expect(targetSkill).toContain(
      `Run \`${target.runtimeCommand} __target <component-directory> --directory-loop\``
    );

    const installedGenerateReferences = (
      await readdir(
        join(
          target.destinationDirectory,
          "skills",
          "@tr",
          "rtl-gen",
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
        "@tr",
        "rtl-conventions",
        "SKILL.md"
      ),
      "utf8"
    );
    expect(conventionsSkill).toContain("## Investigation Workflow");

    const mocksSkillPath = join(
      target.destinationDirectory,
      "skills",
      "@tr",
      "rtl-mocks",
      "SKILL.md"
    );
    await access(mocksSkillPath);
    const mocksSkill = await readFile(mocksSkillPath, "utf8");
    expect(mocksSkill).toContain("## Boundary Review Workflow");
    expect(mocksSkill).toContain("MockReviewFeedback");

    const initSkill = await readFile(
      join(
        target.destinationDirectory,
        "skills",
        "@tr",
        "rtl-init",
        "SKILL.md"
      ),
      "utf8"
    );
    expect(initSkill).toContain("$@tr/rtl-init");

    const refreshSkill = await readFile(
      join(
        target.destinationDirectory,
        "skills",
        "@tr",
        "rtl-refresh",
        "SKILL.md"
      ),
      "utf8"
    );
    expect(refreshSkill).toContain("$@tr/rtl-refresh");

    const overridesSkill = await readFile(
      join(
        target.destinationDirectory,
        "skills",
        "@tr",
        "rtl-overrides",
        "SKILL.md"
      ),
      "utf8"
    );
    expect(overridesSkill).toContain("$@tr/rtl-overrides");
    expect(overridesSkill).toContain(
      `Run \`${target.runtimeCommand} __overrides\``
    );
  });
});
