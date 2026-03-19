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
    destinationSegments: ["skills", "@taro-test", "rtl-help", "SKILL.md"],
    entrypoint: "$@taro-test/rtl-help",
  },
  {
    id: "init",
    kind: "skill",
    sourceSegments: ["agents", "taro-init.md"],
    destinationSegments: ["skills", "@taro-test", "rtl-init", "SKILL.md"],
    entrypoint: "$@taro-test/rtl-init",
  },
  {
    id: "generate",
    kind: "skill",
    sourceSegments: ["agents", "taro-generate.md"],
    destinationSegments: ["skills", "@taro-test", "rtl-generate", "SKILL.md"],
    entrypoint: "$@taro-test/rtl-generate",
  },
  {
    id: "generate-i",
    kind: "skill",
    sourceSegments: ["agents", "taro-generate-i.md"],
    destinationSegments: ["skills", "@taro-test", "rtl-generate-i", "SKILL.md"],
    entrypoint: "$@taro-test/rtl-generate-i",
  },
  {
    id: "target",
    kind: "skill",
    sourceSegments: ["agents", "taro-target.md"],
    destinationSegments: ["skills", "@taro-test", "rtl-target", "SKILL.md"],
    entrypoint: "$@taro-test/rtl-target",
  },
  {
    id: "refresh",
    kind: "skill",
    sourceSegments: ["agents", "taro-refresh.md"],
    destinationSegments: ["skills", "@taro-test", "rtl-refresh", "SKILL.md"],
    entrypoint: "$@taro-test/rtl-refresh",
  },
  {
    id: "overrides",
    kind: "skill",
    sourceSegments: ["agents", "taro-overrides.md"],
    destinationSegments: ["skills", "@taro-test", "rtl-overrides", "SKILL.md"],
    entrypoint: "$@taro-test/rtl-overrides",
  },
  ...TARO_REFERENCE_FILES.map((fileName) => ({
    id: `generate-reference-${fileName.replace(/\.md$/, "")}`,
    kind: "skill" as const,
    sourceSegments: ["taro", "references", fileName],
    destinationSegments: [
      "skills",
      "@taro-test",
      "rtl-generate",
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
      "@taro-test",
      "rtl-generate-i",
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
      "@taro-test",
      "rtl-conventions",
      "SKILL.md",
    ],
    entrypoint: "$@taro-test/rtl-conventions",
  },
  {
    id: "mocks",
    kind: "skill",
    sourceSegments: ["agents", "taro-mocks.md"],
    destinationSegments: ["skills", "@taro-test", "rtl-mocks", "SKILL.md"],
    entrypoint: "$@taro-test/rtl-mocks",
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
