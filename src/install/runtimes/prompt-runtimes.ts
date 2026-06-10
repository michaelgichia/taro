import { TARO_REFERENCE_FILES } from "#install/reference-files.ts";
import { buildRuntimeOperationsFromAssets } from "#install/runtime-launcher.ts";
import type {
  InstallFileOperation,
  ResolvedInstallTarget,
  RuntimeAssetDefinition,
  RuntimeTarget,
} from "#install/types.ts";

type PromptRuntimeTarget = Extract<
  RuntimeTarget,
  "claude" | "gemini" | "opencode"
>;

const PROMPT_RUNTIME_ASSETS: Record<
  PromptRuntimeTarget,
  RuntimeAssetDefinition[]
> = {
  claude: [
    {
      id: "help",
      kind: "command",
      sourceSegments: ["commands", "claude", "@tr", "rtl", "help.md"],
      destinationSegments: ["commands", "@tr", "rtl", "help.md"],
      entrypoint: "/@tr/rtl:help",
    },
    {
      id: "init",
      kind: "command",
      sourceSegments: ["commands", "claude", "@tr", "rtl", "init.md"],
      destinationSegments: ["commands", "@tr", "rtl", "init.md"],
      entrypoint: "/@tr/rtl:init",
    },
    {
      id: "generate",
      kind: "command",
      sourceSegments: [
        "commands",
        "claude",
        "@tr",
        "rtl",
        "gen.md",
      ],
      destinationSegments: ["commands", "@tr", "rtl", "gen.md"],
      entrypoint: "/@tr/rtl:gen",
    },
    {
      id: "generate-i",
      kind: "command",
      sourceSegments: [
        "commands",
        "claude",
        "@tr",
        "rtl",
        "geni.md",
      ],
      destinationSegments: ["commands", "@tr", "rtl", "geni.md"],
      entrypoint: "/@tr/rtl:geni",
    },
    {
      id: "grade",
      kind: "command",
      sourceSegments: ["commands", "claude", "@tr", "rtl", "grade.md"],
      destinationSegments: ["commands", "@tr", "rtl", "grade.md"],
      entrypoint: "/@tr/rtl:grade",
    },
    {
      id: "regrade",
      kind: "command",
      sourceSegments: ["commands", "claude", "@tr", "rtl", "regrade.md"],
      destinationSegments: ["commands", "@tr", "rtl", "regrade.md"],
      entrypoint: "/@tr/rtl:regrade",
    },
    {
      id: "target",
      kind: "command",
      sourceSegments: ["commands", "claude", "@tr", "rtl", "target.md"],
      destinationSegments: ["commands", "@tr", "rtl", "target.md"],
      entrypoint: "/@tr/rtl:target",
    },
    {
      id: "mocks",
      kind: "command",
      sourceSegments: ["commands", "claude", "@tr", "rtl", "mocks.md"],
      destinationSegments: ["commands", "@tr", "rtl", "mocks.md"],
      entrypoint: "/@tr/rtl:mocks",
    },
    {
      id: "refresh",
      kind: "command",
      sourceSegments: ["commands", "claude", "@tr", "rtl", "refresh.md"],
      destinationSegments: ["commands", "@tr", "rtl", "refresh.md"],
      entrypoint: "/@tr/rtl:refresh",
    },
    {
      id: "overrides",
      kind: "command",
      sourceSegments: [
        "commands",
        "claude",
        "@tr",
        "rtl",
        "overrides.md",
      ],
      destinationSegments: ["commands", "@tr", "rtl", "overrides.md"],
      entrypoint: "/@tr/rtl:overrides",
    },
    ...TARO_REFERENCE_FILES.map((fileName) => ({
      id: `generate-reference-${fileName.replace(/\.md$/, "")}`,
      kind: "command" as const,
      sourceSegments: ["taro", "references", fileName],
      destinationSegments: [
        "commands",
        "@tr",
        "rtl",
        "references",
        fileName,
      ],
    })),
  ],
  gemini: [
    {
      id: "help",
      kind: "command",
      sourceSegments: ["commands", "gemini", "@tr", "rtl", "help.toml"],
      destinationSegments: ["commands", "@tr", "rtl", "help.toml"],
      entrypoint: "/@tr/rtl:help",
    },
    {
      id: "init",
      kind: "command",
      sourceSegments: ["commands", "gemini", "@tr", "rtl", "init.toml"],
      destinationSegments: ["commands", "@tr", "rtl", "init.toml"],
      entrypoint: "/@tr/rtl:init",
    },
    {
      id: "generate",
      kind: "command",
      sourceSegments: [
        "commands",
        "gemini",
        "@tr",
        "rtl",
        "gen.toml",
      ],
      destinationSegments: ["commands", "@tr", "rtl", "gen.toml"],
      entrypoint: "/@tr/rtl:gen",
    },
    {
      id: "generate-i",
      kind: "command",
      sourceSegments: [
        "commands",
        "gemini",
        "@tr",
        "rtl",
        "geni.toml",
      ],
      destinationSegments: ["commands", "@tr", "rtl", "geni.toml"],
      entrypoint: "/@tr/rtl:geni",
    },
    {
      id: "grade",
      kind: "command",
      sourceSegments: ["commands", "gemini", "@tr", "rtl", "grade.toml"],
      destinationSegments: ["commands", "@tr", "rtl", "grade.toml"],
      entrypoint: "/@tr/rtl:grade",
    },
    {
      id: "regrade",
      kind: "command",
      sourceSegments: [
        "commands",
        "gemini",
        "@tr",
        "rtl",
        "regrade.toml",
      ],
      destinationSegments: ["commands", "@tr", "rtl", "regrade.toml"],
      entrypoint: "/@tr/rtl:regrade",
    },
    {
      id: "target",
      kind: "command",
      sourceSegments: [
        "commands",
        "gemini",
        "@tr",
        "rtl",
        "target.toml",
      ],
      destinationSegments: ["commands", "@tr", "rtl", "target.toml"],
      entrypoint: "/@tr/rtl:target",
    },
    {
      id: "mocks",
      kind: "command",
      sourceSegments: ["commands", "gemini", "@tr", "rtl", "mocks.toml"],
      destinationSegments: ["commands", "@tr", "rtl", "mocks.toml"],
      entrypoint: "/@tr/rtl:mocks",
    },
    {
      id: "refresh",
      kind: "command",
      sourceSegments: [
        "commands",
        "gemini",
        "@tr",
        "rtl",
        "refresh.toml",
      ],
      destinationSegments: ["commands", "@tr", "rtl", "refresh.toml"],
      entrypoint: "/@tr/rtl:refresh",
    },
    {
      id: "overrides",
      kind: "command",
      sourceSegments: [
        "commands",
        "gemini",
        "@tr",
        "rtl",
        "overrides.toml",
      ],
      destinationSegments: ["commands", "@tr", "rtl", "overrides.toml"],
      entrypoint: "/@tr/rtl:overrides",
    },
  ],
  opencode: [
    {
      id: "help",
      kind: "command",
      sourceSegments: ["commands", "opencode", "@tr", "rtl-help.md"],
      destinationSegments: ["commands", "@tr", "rtl-help.md"],
      entrypoint: "/@tr/rtl-help",
    },
    {
      id: "init",
      kind: "command",
      sourceSegments: ["commands", "opencode", "@tr", "rtl-init.md"],
      destinationSegments: ["commands", "@tr", "rtl-init.md"],
      entrypoint: "/@tr/rtl-init",
    },
    {
      id: "generate",
      kind: "command",
      sourceSegments: ["commands", "opencode", "@tr", "rtl-gen.md"],
      destinationSegments: ["commands", "@tr", "rtl-gen.md"],
      entrypoint: "/@tr/rtl-gen",
    },
    {
      id: "generate-i",
      kind: "command",
      sourceSegments: [
        "commands",
        "opencode",
        "@tr",
        "rtl-geni.md",
      ],
      destinationSegments: ["commands", "@tr", "rtl-geni.md"],
      entrypoint: "/@tr/rtl-geni",
    },
    {
      id: "grade",
      kind: "command",
      sourceSegments: ["commands", "opencode", "@tr", "rtl-grade.md"],
      destinationSegments: ["commands", "@tr", "rtl-grade.md"],
      entrypoint: "/@tr/rtl-grade",
    },
    {
      id: "regrade",
      kind: "command",
      sourceSegments: ["commands", "opencode", "@tr", "rtl-regrade.md"],
      destinationSegments: ["commands", "@tr", "rtl-regrade.md"],
      entrypoint: "/@tr/rtl-regrade",
    },
    {
      id: "target",
      kind: "command",
      sourceSegments: ["commands", "opencode", "@tr", "rtl-target.md"],
      destinationSegments: ["commands", "@tr", "rtl-target.md"],
      entrypoint: "/@tr/rtl-target",
    },
    {
      id: "mocks",
      kind: "command",
      sourceSegments: ["commands", "opencode", "@tr", "rtl-mocks.md"],
      destinationSegments: ["commands", "@tr", "rtl-mocks.md"],
      entrypoint: "/@tr/rtl-mocks",
    },
    {
      id: "refresh",
      kind: "command",
      sourceSegments: ["commands", "opencode", "@tr", "rtl-refresh.md"],
      destinationSegments: ["commands", "@tr", "rtl-refresh.md"],
      entrypoint: "/@tr/rtl-refresh",
    },
    {
      id: "overrides",
      kind: "command",
      sourceSegments: [
        "commands",
        "opencode",
        "@tr",
        "rtl-overrides.md",
      ],
      destinationSegments: ["commands", "@tr", "rtl-overrides.md"],
      entrypoint: "/@tr/rtl-overrides",
    },
  ],
};

function isPromptRuntime(
  runtime: RuntimeTarget
): runtime is PromptRuntimeTarget {
  return runtime === "claude" || runtime === "gemini" || runtime === "opencode";
}

export function buildPromptRuntimeOperations(
  target: ResolvedInstallTarget,
  fromModuleUrl: string = import.meta.url
): InstallFileOperation[] {
  if (!isPromptRuntime(target.id)) {
    throw new Error(`Prompt runtime operations do not support ${target.id}.`);
  }

  return buildRuntimeOperationsFromAssets(
    target,
    PROMPT_RUNTIME_ASSETS[target.id],
    fromModuleUrl
  );
}
