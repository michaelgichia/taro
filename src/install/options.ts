import { stdin, stdout } from "node:process";

import type {
  InstallCommandOptions,
  InstallLocation,
  InstallSelection,
  InstallSelectionSource,
  NormalizedInstallOptions,
  RuntimeLocationSelections,
  RuntimeTarget,
} from "#install/types.ts";
import { SUPPORTED_RUNTIMES } from "#install/types.ts";

export class InstallValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InstallValidationError";
  }
}

interface PromptCapability {
  input?: Pick<typeof stdin, "isTTY">;
  output?: Pick<typeof stdout, "isTTY">;
}

function hasPromptCapability(io: PromptCapability): boolean {
  return Boolean(io.input?.isTTY && io.output?.isTTY);
}

function resolveRuntimeSelection(
  options: InstallCommandOptions
): RuntimeTarget[] {
  if (options.all) {
    return [...SUPPORTED_RUNTIMES];
  }

  return SUPPORTED_RUNTIMES.filter((runtime) => Boolean(options[runtime]));
}

function resolveLocationOption(
  options: InstallCommandOptions
): InstallLocation | undefined {
  if (options.global && options.local) {
    throw new InstallValidationError(
      "Choose either `--global` or `--local`, not both."
    );
  }

  if (options.global) {
    return "global";
  }

  if (options.local) {
    return "local";
  }

  return undefined;
}

function resolveSelectionSource(params: {
  runtimesSelected: boolean;
  locationSelected: boolean;
}): InstallSelectionSource {
  const { runtimesSelected, locationSelected } = params;

  if (runtimesSelected && locationSelected) {
    return "flags";
  }

  if (runtimesSelected || locationSelected) {
    return "mixed";
  }

  return "prompt";
}

function fillRuntimeLocations(
  runtimes: RuntimeTarget[],
  location: InstallLocation | undefined
): Partial<RuntimeLocationSelections> {
  if (!location) {
    return {};
  }

  return Object.fromEntries(
    runtimes.map((runtime) => [runtime, location])
  ) as Partial<RuntimeLocationSelections>;
}

export function normalizeInstallOptions(
  options: InstallCommandOptions,
  io: PromptCapability = { input: stdin, output: stdout }
): NormalizedInstallOptions {
  const runtimes = resolveRuntimeSelection(options);
  const location = resolveLocationOption(options);
  const needsRuntimePrompt = runtimes.length === 0;
  const runtimesNeedingLocation = location ? [] : [...runtimes];
  const mode =
    needsRuntimePrompt || runtimesNeedingLocation.length > 0
      ? "interactive"
      : "non-interactive";

  if (mode === "interactive" && !hasPromptCapability(io)) {
    throw new InstallValidationError(
      "Non-interactive install requires runtime flags (`--claude`, `--opencode`, `--gemini`, `--codex`, or `--all`) and exactly one location flag (`--global` or `--local`)."
    );
  }

  return {
    mode,
    runtimes,
    locations: fillRuntimeLocations(runtimes, location),
    needsRuntimePrompt,
    runtimesNeedingLocation,
    source: resolveSelectionSource({
      runtimesSelected: runtimes.length > 0,
      locationSelected: Boolean(location),
    }),
  };
}

export function toInstallSelection(
  normalized: NormalizedInstallOptions
): InstallSelection {
  if (normalized.mode !== "non-interactive") {
    throw new InstallValidationError(
      "Cannot materialize install selection before interactive prompts complete."
    );
  }

  const locations = Object.fromEntries(
    normalized.runtimes.map((runtime) => {
      const location = normalized.locations[runtime];

      if (!location) {
        throw new InstallValidationError(
          `Missing install location for ${runtime}.`
        );
      }

      return [runtime, location];
    })
  ) as RuntimeLocationSelections;

  return {
    mode: normalized.mode,
    runtimes: normalized.runtimes,
    locations,
    source: normalized.source,
  };
}
