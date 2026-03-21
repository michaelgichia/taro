import { writeFile } from "node:fs/promises";
import { cwd } from "node:process";

import { Command } from "commander";
import pc from "picocolors";

import { loadOrBootstrapTaroState } from "#core/state.ts";
import {
  ensureProjectStateDir,
  findReadableProjectStatePath,
  getProjectStatePath,
} from "#project-state.ts";
import type {
  TaroBoundaryProfile,
  TaroBoundaryStrategy,
  TaroOverrides,
  TaroPackageOverrides,
  TaroPackageProfile,
  TaroState,
} from "#types/state.ts";

interface OverridesCommandOptions {
  force?: boolean;
  stdout?: boolean;
}

function shouldPinBoundaryProfile(boundary: TaroBoundaryProfile): boolean {
  return boundary.guardrailReason !== null || boundary.confidence === "high";
}

function buildPackageOverrides(
  profile: TaroPackageProfile
): TaroPackageOverrides {
  const overrides: TaroPackageOverrides = {};

  if (profile.runner.value !== "unknown") {
    overrides.runner = profile.runner.value;
  }

  const boundaryPolicies: Record<string, TaroBoundaryStrategy> = {};
  const preferredBoundaryImplementations: Record<string, string> = {};
  const forbidBoundaryTargets = new Set<string>();

  for (const boundary of [...profile.boundaryProfiles].sort((left, right) => {
    return left.target.localeCompare(right.target);
  })) {
    if (!shouldPinBoundaryProfile(boundary)) {
      continue;
    }

    if (boundary.strategy === "forbid") {
      forbidBoundaryTargets.add(boundary.target);
      continue;
    }

    if (
      boundary.strategy !== "inline-safe" &&
      boundary.strategy !== "provider-wrapper" &&
      boundary.strategy !== "shared-module-factory"
    ) {
      continue;
    }

    boundaryPolicies[boundary.target] = boundary.strategy;

    if (boundary.supportImportPath) {
      preferredBoundaryImplementations[boundary.target] =
        boundary.supportImportPath;
    }
  }

  if (Object.keys(boundaryPolicies).length > 0) {
    overrides.boundaryPolicies = boundaryPolicies;
  }
  if (Object.keys(preferredBoundaryImplementations).length > 0) {
    overrides.preferredBoundaryImplementations =
      preferredBoundaryImplementations;
  }
  if (forbidBoundaryTargets.size > 0) {
    overrides.forbidBoundaryTargets = [...forbidBoundaryTargets].sort(
      (left, right) => {
        return left.localeCompare(right);
      }
    );
  }

  return overrides;
}

function buildSuggestedOverrides(state: TaroState): TaroOverrides {
  const packageEntries = Object.values(state.packages)
    .sort((left, right) => left.packagePath.localeCompare(right.packagePath))
    .map(
      (profile) =>
        [profile.packagePath, buildPackageOverrides(profile)] as const
    );

  return { packages: Object.fromEntries(packageEntries) };
}

function formatOverridesSummary(overrides: TaroOverrides): string[] {
  const packageEntries = Object.entries(overrides.packages ?? {}).sort(
    ([left], [right]) => {
      return left.localeCompare(right);
    }
  );

  const lines = [
    `${pc.dim("[taro]")} Scaffolded .taro/overrides.json for ${packageEntries.length} package(s)`,
  ];

  for (const [packagePath, packageOverrides] of packageEntries) {
    lines.push(
      `${pc.dim("[taro]")} ${packagePath}: runner=${packageOverrides.runner ?? "none"}, renderHelper=${packageOverrides.renderHelper?.name ?? "none"}, boundaryPolicies=${Object.keys(packageOverrides.boundaryPolicies ?? {}).length}, preferredBoundaryImplementations=${Object.keys(packageOverrides.preferredBoundaryImplementations ?? {}).length}, forbidBoundaryTargets=${packageOverrides.forbidBoundaryTargets?.length ?? 0}, queryHookPolicy=${packageOverrides.queryHookPolicy ?? "none"}`
    );
  }

  return lines;
}

export const overridesCommandInternals = {
  buildPackageOverrides,
  buildSuggestedOverrides,
  formatOverridesSummary,
};

export function createOverridesCommand(): Command {
  const overrides = new Command("__overrides");

  overrides
    .description(
      "Internal runtime-only overrides scaffold generator for Taro package policies"
    )
    .option("--force", "Overwrite an existing .taro/overrides.json file")
    .option(
      "--stdout",
      "Print the generated .taro/overrides.json payload instead of writing it"
    )
    .action(async (options: OverridesCommandOptions) => {
      const projectRoot = cwd();
      const result = await loadOrBootstrapTaroState(projectRoot);
      const scaffold = buildSuggestedOverrides(result.state);
      const packageCount = Object.keys(scaffold.packages ?? {}).length;

      if (packageCount === 0) {
        console.log(
          pc.yellow(
            "[taro] No package profiles were detected, so there is no overrides scaffold to write yet."
          )
        );
        return;
      }

      const content = `${JSON.stringify(scaffold, null, 2)}\n`;

      if (options.stdout) {
        console.log(content.trimEnd());
        return;
      }

      const existingOverridesPath = await findReadableProjectStatePath(
        projectRoot,
        "overrides.json"
      );
      if (existingOverridesPath && !options.force) {
        console.log(
          pc.yellow(
            "[taro] .taro/overrides.json already exists. Re-run with --force to replace it or use --stdout to inspect the scaffold."
          )
        );
        return;
      }

      await ensureProjectStateDir(projectRoot);
      const overridesPath = getProjectStatePath(projectRoot, "overrides.json");
      await writeFile(overridesPath, content, "utf-8");

      console.log(
        `${pc.dim("[taro]")} ${existingOverridesPath ? "Replaced" : "Wrote"} ${overridesPath}`
      );
      for (const line of formatOverridesSummary(scaffold)) {
        console.log(line);
      }
      console.log(
        `${pc.dim("[taro]")} Review the scaffold before committing; manual policy should stay narrower than learned state.`
      );
    });

  return overrides;
}
