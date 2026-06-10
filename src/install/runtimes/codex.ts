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
    destinationSegments: ["skills", "@tr", "rtl-help", "SKILL.md"],
    entrypoint: "$@tr/rtl-help",
  },
  {
    id: "init",
    kind: "skill",
    sourceSegments: ["agents", "taro-init.md"],
    destinationSegments: ["skills", "@tr", "rtl-init", "SKILL.md"],
    entrypoint: "$@tr/rtl-init",
  },
  {
    id: "generate",
    kind: "skill",
    sourceSegments: ["agents", "taro-generate.md"],
    destinationSegments: ["skills", "@tr", "rtl-gen", "SKILL.md"],
    entrypoint: "$@tr/rtl-gen",
  },
  {
    id: "generate-i",
    kind: "skill",
    sourceSegments: ["agents", "taro-generate-i.md"],
    destinationSegments: ["skills", "@tr", "rtl-geni", "SKILL.md"],
    entrypoint: "$@tr/rtl-geni",
  },
  {
    id: "grade",
    kind: "skill",
    sourceSegments: ["agents", "taro-grade.md"],
    destinationSegments: ["skills", "@tr", "rtl-grade", "SKILL.md"],
    entrypoint: "$@tr/rtl-grade",
  },
  {
    id: "regrade",
    kind: "skill",
    sourceSegments: ["agents", "taro-regrade.md"],
    destinationSegments: ["skills", "@tr", "rtl-regrade", "SKILL.md"],
    entrypoint: "$@tr/rtl-regrade",
  },
  {
    id: "target",
    kind: "skill",
    sourceSegments: ["agents", "taro-target.md"],
    destinationSegments: ["skills", "@tr", "rtl-target", "SKILL.md"],
    entrypoint: "$@tr/rtl-target",
  },
  {
    id: "refresh",
    kind: "skill",
    sourceSegments: ["agents", "taro-refresh.md"],
    destinationSegments: ["skills", "@tr", "rtl-refresh", "SKILL.md"],
    entrypoint: "$@tr/rtl-refresh",
  },
  {
    id: "overrides",
    kind: "skill",
    sourceSegments: ["agents", "taro-overrides.md"],
    destinationSegments: ["skills", "@tr", "rtl-overrides", "SKILL.md"],
    entrypoint: "$@tr/rtl-overrides",
  },
  ...TARO_REFERENCE_FILES.map((fileName) => ({
    id: `generate-reference-${fileName.replace(/\.md$/, "")}`,
    kind: "skill" as const,
    sourceSegments: ["taro", "references", fileName],
    destinationSegments: [
      "skills",
      "@tr",
      "rtl-gen",
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
      "@tr",
      "rtl-geni",
      "references",
      fileName,
    ],
  })),
  {
    id: "conventions",
    kind: "skill",
    sourceSegments: ["agents", "taro-conventions.md"],
    destinationSegments: [
      "skills",
      "@tr",
      "rtl-conventions",
      "SKILL.md",
    ],
    entrypoint: "$@tr/rtl-conventions",
  },
  {
    id: "mocks",
    kind: "skill",
    sourceSegments: ["agents", "taro-mocks.md"],
    destinationSegments: ["skills", "@tr", "rtl-mocks", "SKILL.md"],
    entrypoint: "$@tr/rtl-mocks",
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
