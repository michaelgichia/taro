import { TARO_REFERENCE_FILES } from "#install/reference-files.ts";
import { buildRuntimeOperationsFromAssets } from "#install/runtime-launcher.ts";
import type {
  InstallFileOperation,
  ResolvedInstallTarget,
  RuntimeAssetDefinition,
} from "#install/types.ts";

const CODEX_SKILL_ASSETS: RuntimeAssetDefinition[] = [
  {
    id: "help",
    kind: "skill",
    sourceSegments: ["agents", "taro-help.md"],
    destinationSegments: ["skills", "@tr-rtl", "cli-help", "SKILL.md"],
    entrypoint: "$@tr-rtl/cli-help",
  },
  {
    id: "init",
    kind: "skill",
    sourceSegments: ["agents", "taro-init.md"],
    destinationSegments: ["skills", "@tr-rtl", "cli-init", "SKILL.md"],
    entrypoint: "$@tr-rtl/cli-init",
  },
  {
    id: "generate",
    kind: "skill",
    sourceSegments: ["agents", "taro-generate.md"],
    destinationSegments: ["skills", "@tr-rtl", "cli-gen", "SKILL.md"],
    entrypoint: "$@tr-rtl/cli-gen",
  },
  {
    id: "generate-i",
    kind: "skill",
    sourceSegments: ["agents", "taro-generate-i.md"],
    destinationSegments: ["skills", "@tr-rtl", "cli-geni", "SKILL.md"],
    entrypoint: "$@tr-rtl/cli-geni",
  },
  {
    id: "grade",
    kind: "skill",
    sourceSegments: ["agents", "taro-grade.md"],
    destinationSegments: ["skills", "@tr-rtl", "cli-grade", "SKILL.md"],
    entrypoint: "$@tr-rtl/cli-grade",
  },
  {
    id: "regrade",
    kind: "skill",
    sourceSegments: ["agents", "taro-regrade.md"],
    destinationSegments: ["skills", "@tr-rtl", "cli-regrade", "SKILL.md"],
    entrypoint: "$@tr-rtl/cli-regrade",
  },
  {
    id: "target",
    kind: "skill",
    sourceSegments: ["agents", "taro-target.md"],
    destinationSegments: ["skills", "@tr-rtl", "cli-target", "SKILL.md"],
    entrypoint: "$@tr-rtl/cli-target",
  },
  {
    id: "refresh",
    kind: "skill",
    sourceSegments: ["agents", "taro-refresh.md"],
    destinationSegments: ["skills", "@tr-rtl", "cli-refresh", "SKILL.md"],
    entrypoint: "$@tr-rtl/cli-refresh",
  },
  {
    id: "overrides",
    kind: "skill",
    sourceSegments: ["agents", "taro-overrides.md"],
    destinationSegments: ["skills", "@tr-rtl", "cli-overrides", "SKILL.md"],
    entrypoint: "$@tr-rtl/cli-overrides",
  },
  ...TARO_REFERENCE_FILES.map((fileName) => ({
    id: `generate-reference-${fileName.replace(/\.md$/, "")}`,
    kind: "skill" as const,
    sourceSegments: ["taro", "references", fileName],
    destinationSegments: [
      "skills",
      "@tr-rtl",
      "cli-gen",
      "references",
      fileName,
    ],
  })),
  ...TARO_REFERENCE_FILES.map((fileName) => ({
    id: `generate-i-reference-${fileName.replace(/\.md$/, "")}`,
    kind: "skill" as const,
    sourceSegments: ["taro", "references", fileName],
    destinationSegments: [
      "skills",
      "@tr-rtl",
      "cli-geni",
      "references",
      fileName,
    ],
  })),
  {
    id: "conventions",
    kind: "skill",
    sourceSegments: ["agents", "taro-conventions.md"],
    destinationSegments: ["skills", "@tr-rtl", "cli-conventions", "SKILL.md"],
    entrypoint: "$@tr-rtl/cli-conventions",
  },
  {
    id: "mocks",
    kind: "skill",
    sourceSegments: ["agents", "taro-mocks.md"],
    destinationSegments: ["skills", "@tr-rtl", "cli-mocks", "SKILL.md"],
    entrypoint: "$@tr-rtl/cli-mocks",
  },
];

export function buildCodexOperations(
  target: ResolvedInstallTarget,
  fromModuleUrl: string = import.meta.url
): InstallFileOperation[] {
  if (target.id !== "codex") {
    throw new Error(`Codex runtime builder received ${target.id}.`);
  }

  return buildRuntimeOperationsFromAssets(
    target,
    CODEX_SKILL_ASSETS,
    fromModuleUrl
  );
}
