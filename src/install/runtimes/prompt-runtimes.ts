import { TARO_REFERENCE_FILES } from "../reference-files.js";
import { buildRuntimeOperationsFromAssets } from "../runtime-launcher.js";
import type {
  InstallFileOperation,
  ResolvedInstallTarget,
  RuntimeAssetDefinition,
  RuntimeTarget,
} from "../types.js";

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
      sourceSegments: ["commands", "claude", "@taro-test", "rtl", "help.md"],
      destinationSegments: ["commands", "@taro-test", "rtl", "help.md"],
      entrypoint: "/@taro-test/rtl:help",
    },
    {
      id: "init",
      kind: "command",
      sourceSegments: ["commands", "claude", "@taro-test", "rtl", "init.md"],
      destinationSegments: ["commands", "@taro-test", "rtl", "init.md"],
      entrypoint: "/@taro-test/rtl:init",
    },
    {
      id: "generate",
      kind: "command",
      sourceSegments: [
        "commands",
        "claude",
        "@taro-test",
        "rtl",
        "generate.md",
      ],
      destinationSegments: ["commands", "@taro-test", "rtl", "generate.md"],
      entrypoint: "/@taro-test/rtl:generate",
    },
    {
      id: "generate-i",
      kind: "command",
      sourceSegments: [
        "commands",
        "claude",
        "@taro-test",
        "rtl",
        "generate-i.md",
      ],
      destinationSegments: ["commands", "@taro-test", "rtl", "generate-i.md"],
      entrypoint: "/@taro-test/rtl:generate-i",
    },
    {
      id: "refresh",
      kind: "command",
      sourceSegments: ["commands", "claude", "@taro-test", "rtl", "refresh.md"],
      destinationSegments: ["commands", "@taro-test", "rtl", "refresh.md"],
      entrypoint: "/@taro-test/rtl:refresh",
    },
    ...TARO_REFERENCE_FILES.map((fileName) => ({
      id: `generate-reference-${fileName.replace(/\.md$/, "")}`,
      kind: "command" as const,
      sourceSegments: ["taro", "references", fileName],
      destinationSegments: [
        "commands",
        "@taro-test",
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
      sourceSegments: ["commands", "gemini", "@taro-test", "rtl", "help.toml"],
      destinationSegments: ["commands", "@taro-test", "rtl", "help.toml"],
      entrypoint: "/@taro-test/rtl:help",
    },
    {
      id: "init",
      kind: "command",
      sourceSegments: ["commands", "gemini", "@taro-test", "rtl", "init.toml"],
      destinationSegments: ["commands", "@taro-test", "rtl", "init.toml"],
      entrypoint: "/@taro-test/rtl:init",
    },
    {
      id: "generate",
      kind: "command",
      sourceSegments: [
        "commands",
        "gemini",
        "@taro-test",
        "rtl",
        "generate.toml",
      ],
      destinationSegments: ["commands", "@taro-test", "rtl", "generate.toml"],
      entrypoint: "/@taro-test/rtl:generate",
    },
    {
      id: "generate-i",
      kind: "command",
      sourceSegments: [
        "commands",
        "gemini",
        "@taro-test",
        "rtl",
        "generate-i.toml",
      ],
      destinationSegments: ["commands", "@taro-test", "rtl", "generate-i.toml"],
      entrypoint: "/@taro-test/rtl:generate-i",
    },
    {
      id: "refresh",
      kind: "command",
      sourceSegments: [
        "commands",
        "gemini",
        "@taro-test",
        "rtl",
        "refresh.toml",
      ],
      destinationSegments: ["commands", "@taro-test", "rtl", "refresh.toml"],
      entrypoint: "/@taro-test/rtl:refresh",
    },
  ],
  opencode: [
    {
      id: "help",
      kind: "command",
      sourceSegments: ["commands", "opencode", "@taro-test", "rtl-help.md"],
      destinationSegments: ["commands", "@taro-test", "rtl-help.md"],
      entrypoint: "/@taro-test/rtl-help",
    },
    {
      id: "init",
      kind: "command",
      sourceSegments: ["commands", "opencode", "@taro-test", "rtl-init.md"],
      destinationSegments: ["commands", "@taro-test", "rtl-init.md"],
      entrypoint: "/@taro-test/rtl-init",
    },
    {
      id: "generate",
      kind: "command",
      sourceSegments: ["commands", "opencode", "@taro-test", "rtl-generate.md"],
      destinationSegments: ["commands", "@taro-test", "rtl-generate.md"],
      entrypoint: "/@taro-test/rtl-generate",
    },
    {
      id: "generate-i",
      kind: "command",
      sourceSegments: [
        "commands",
        "opencode",
        "@taro-test",
        "rtl-generate-i.md",
      ],
      destinationSegments: ["commands", "@taro-test", "rtl-generate-i.md"],
      entrypoint: "/@taro-test/rtl-generate-i",
    },
    {
      id: "refresh",
      kind: "command",
      sourceSegments: ["commands", "opencode", "@taro-test", "rtl-refresh.md"],
      destinationSegments: ["commands", "@taro-test", "rtl-refresh.md"],
      entrypoint: "/@taro-test/rtl-refresh",
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
