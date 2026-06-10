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
      sourceSegments: ["commands", "claude", "@tr-rtl", "cli", "help.md"],
      destinationSegments: ["commands", "@tr-rtl", "cli", "help.md"],
      entrypoint: "/@tr-rtl/cli:help",
    },
    {
      id: "init",
      kind: "command",
      sourceSegments: ["commands", "claude", "@tr-rtl", "cli", "init.md"],
      destinationSegments: ["commands", "@tr-rtl", "cli", "init.md"],
      entrypoint: "/@tr-rtl/cli:init",
    },
    {
      id: "generate",
      kind: "command",
      sourceSegments: [
        "commands",
        "claude",
        "@tr-rtl",
        "rtl",
        "gen.md",
      ],
      destinationSegments: ["commands", "@tr-rtl", "cli", "gen.md"],
      entrypoint: "/@tr-rtl/cli:gen",
    },
    {
      id: "generate-i",
      kind: "command",
      sourceSegments: [
        "commands",
        "claude",
        "@tr-rtl",
        "rtl",
        "geni.md",
      ],
      destinationSegments: ["commands", "@tr-rtl", "cli", "geni.md"],
      entrypoint: "/@tr-rtl/cli:geni",
    },
    {
      id: "grade",
      kind: "command",
      sourceSegments: ["commands", "claude", "@tr-rtl", "cli", "grade.md"],
      destinationSegments: ["commands", "@tr-rtl", "cli", "grade.md"],
      entrypoint: "/@tr-rtl/cli:grade",
    },
    {
      id: "regrade",
      kind: "command",
      sourceSegments: ["commands", "claude", "@tr-rtl", "cli", "regrade.md"],
      destinationSegments: ["commands", "@tr-rtl", "cli", "regrade.md"],
      entrypoint: "/@tr-rtl/cli:regrade",
    },
    {
      id: "target",
      kind: "command",
      sourceSegments: ["commands", "claude", "@tr-rtl", "cli", "target.md"],
      destinationSegments: ["commands", "@tr-rtl", "cli", "target.md"],
      entrypoint: "/@tr-rtl/cli:target",
    },
    {
      id: "mocks",
      kind: "command",
      sourceSegments: ["commands", "claude", "@tr-rtl", "cli", "mocks.md"],
      destinationSegments: ["commands", "@tr-rtl", "cli", "mocks.md"],
      entrypoint: "/@tr-rtl/cli:mocks",
    },
    {
      id: "refresh",
      kind: "command",
      sourceSegments: ["commands", "claude", "@tr-rtl", "cli", "refresh.md"],
      destinationSegments: ["commands", "@tr-rtl", "cli", "refresh.md"],
      entrypoint: "/@tr-rtl/cli:refresh",
    },
    {
      id: "overrides",
      kind: "command",
      sourceSegments: [
        "commands",
        "claude",
        "@tr-rtl",
        "rtl",
        "overrides.md",
      ],
      destinationSegments: ["commands", "@tr-rtl", "cli", "overrides.md"],
      entrypoint: "/@tr-rtl/cli:overrides",
    },
    ...TARO_REFERENCE_FILES.map((fileName) => ({
      id: `generate-reference-${fileName.replace(/\.md$/, "")}`,
      kind: "command" as const,
      sourceSegments: ["taro", "references", fileName],
      destinationSegments: [
        "commands",
        "@tr-rtl",
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
      sourceSegments: ["commands", "gemini", "@tr-rtl", "cli", "help.toml"],
      destinationSegments: ["commands", "@tr-rtl", "cli", "help.toml"],
      entrypoint: "/@tr-rtl/cli:help",
    },
    {
      id: "init",
      kind: "command",
      sourceSegments: ["commands", "gemini", "@tr-rtl", "cli", "init.toml"],
      destinationSegments: ["commands", "@tr-rtl", "cli", "init.toml"],
      entrypoint: "/@tr-rtl/cli:init",
    },
    {
      id: "generate",
      kind: "command",
      sourceSegments: [
        "commands",
        "gemini",
        "@tr-rtl",
        "rtl",
        "gen.toml",
      ],
      destinationSegments: ["commands", "@tr-rtl", "cli", "gen.toml"],
      entrypoint: "/@tr-rtl/cli:gen",
    },
    {
      id: "generate-i",
      kind: "command",
      sourceSegments: [
        "commands",
        "gemini",
        "@tr-rtl",
        "rtl",
        "geni.toml",
      ],
      destinationSegments: ["commands", "@tr-rtl", "cli", "geni.toml"],
      entrypoint: "/@tr-rtl/cli:geni",
    },
    {
      id: "grade",
      kind: "command",
      sourceSegments: ["commands", "gemini", "@tr-rtl", "cli", "grade.toml"],
      destinationSegments: ["commands", "@tr-rtl", "cli", "grade.toml"],
      entrypoint: "/@tr-rtl/cli:grade",
    },
    {
      id: "regrade",
      kind: "command",
      sourceSegments: [
        "commands",
        "gemini",
        "@tr-rtl",
        "rtl",
        "regrade.toml",
      ],
      destinationSegments: ["commands", "@tr-rtl", "cli", "regrade.toml"],
      entrypoint: "/@tr-rtl/cli:regrade",
    },
    {
      id: "target",
      kind: "command",
      sourceSegments: [
        "commands",
        "gemini",
        "@tr-rtl",
        "rtl",
        "target.toml",
      ],
      destinationSegments: ["commands", "@tr-rtl", "cli", "target.toml"],
      entrypoint: "/@tr-rtl/cli:target",
    },
    {
      id: "mocks",
      kind: "command",
      sourceSegments: ["commands", "gemini", "@tr-rtl", "cli", "mocks.toml"],
      destinationSegments: ["commands", "@tr-rtl", "cli", "mocks.toml"],
      entrypoint: "/@tr-rtl/cli:mocks",
    },
    {
      id: "refresh",
      kind: "command",
      sourceSegments: [
        "commands",
        "gemini",
        "@tr-rtl",
        "rtl",
        "refresh.toml",
      ],
      destinationSegments: ["commands", "@tr-rtl", "cli", "refresh.toml"],
      entrypoint: "/@tr-rtl/cli:refresh",
    },
    {
      id: "overrides",
      kind: "command",
      sourceSegments: [
        "commands",
        "gemini",
        "@tr-rtl",
        "rtl",
        "overrides.toml",
      ],
      destinationSegments: ["commands", "@tr-rtl", "cli", "overrides.toml"],
      entrypoint: "/@tr-rtl/cli:overrides",
    },
  ],
  opencode: [
    {
      id: "help",
      kind: "command",
      sourceSegments: ["commands", "opencode", "@tr-rtl", "cli-help.md"],
      destinationSegments: ["commands", "@tr-rtl", "cli-help.md"],
      entrypoint: "/@tr-rtl/cli-help",
    },
    {
      id: "init",
      kind: "command",
      sourceSegments: ["commands", "opencode", "@tr-rtl", "cli-init.md"],
      destinationSegments: ["commands", "@tr-rtl", "cli-init.md"],
      entrypoint: "/@tr-rtl/cli-init",
    },
    {
      id: "generate",
      kind: "command",
      sourceSegments: ["commands", "opencode", "@tr-rtl", "cli-gen.md"],
      destinationSegments: ["commands", "@tr-rtl", "cli-gen.md"],
      entrypoint: "/@tr-rtl/cli-gen",
    },
    {
      id: "generate-i",
      kind: "command",
      sourceSegments: [
        "commands",
        "opencode",
        "@tr-rtl",
        "cli-geni.md",
      ],
      destinationSegments: ["commands", "@tr-rtl", "cli-geni.md"],
      entrypoint: "/@tr-rtl/cli-geni",
    },
    {
      id: "grade",
      kind: "command",
      sourceSegments: ["commands", "opencode", "@tr-rtl", "cli-grade.md"],
      destinationSegments: ["commands", "@tr-rtl", "cli-grade.md"],
      entrypoint: "/@tr-rtl/cli-grade",
    },
    {
      id: "regrade",
      kind: "command",
      sourceSegments: ["commands", "opencode", "@tr-rtl", "cli-regrade.md"],
      destinationSegments: ["commands", "@tr-rtl", "cli-regrade.md"],
      entrypoint: "/@tr-rtl/cli-regrade",
    },
    {
      id: "target",
      kind: "command",
      sourceSegments: ["commands", "opencode", "@tr-rtl", "cli-target.md"],
      destinationSegments: ["commands", "@tr-rtl", "cli-target.md"],
      entrypoint: "/@tr-rtl/cli-target",
    },
    {
      id: "mocks",
      kind: "command",
      sourceSegments: ["commands", "opencode", "@tr-rtl", "cli-mocks.md"],
      destinationSegments: ["commands", "@tr-rtl", "cli-mocks.md"],
      entrypoint: "/@tr-rtl/cli-mocks",
    },
    {
      id: "refresh",
      kind: "command",
      sourceSegments: ["commands", "opencode", "@tr-rtl", "cli-refresh.md"],
      destinationSegments: ["commands", "@tr-rtl", "cli-refresh.md"],
      entrypoint: "/@tr-rtl/cli-refresh",
    },
    {
      id: "overrides",
      kind: "command",
      sourceSegments: [
        "commands",
        "opencode",
        "@tr-rtl",
        "cli-overrides.md",
      ],
      destinationSegments: ["commands", "@tr-rtl", "cli-overrides.md"],
      entrypoint: "/@tr-rtl/cli-overrides",
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
