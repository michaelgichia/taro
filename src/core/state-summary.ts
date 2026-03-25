import { summarizeBoundaryProfiles } from "#core/boundary-learning.ts";
import { orderBy, uniq } from "#core/lodash.ts";
import {
  buildGeneratedTestQualityIndex,
  buildSummaryFromPackages,
  buildSummaryPackages,
  summarizePackageScoreLearning,
} from "#core/state-weighting.ts";
import type { ReadOverridesDiagnostics, ScanStateResult } from "#core/state-runtime-types.ts";
import type { TaroBoundaryKind, TaroPackageProfile, TaroState } from "#types/state.ts";

export function summarizeRenderBoundaryPreference(
  profile: TaroPackageProfile
): "module" | "component" | "mixed" | "unknown" {
  const counts = new Map<"component" | "module", number>();

  for (const exemplar of profile.boundaryExemplars) {
    if (
      exemplar.renderBoundary === "module" ||
      exemplar.renderBoundary === "component"
    ) {
      counts.set(
        exemplar.renderBoundary,
        (counts.get(exemplar.renderBoundary) ?? 0) + 1
      );
    }
  }

  if (counts.size === 0) {
    return "unknown";
  }

  const moduleCount = counts.get("module") ?? 0;
  const componentCount = counts.get("component") ?? 0;

  if (moduleCount > 0 && componentCount > 0) {
    return "mixed";
  }

  return moduleCount > componentCount ? "module" : "component";
}

export function summarizeCollaboratorKinds(profile: TaroPackageProfile): string {
  if (profile.boundaryProfiles.length === 0) {
    return "none";
  }

  const counts = new Map<TaroBoundaryKind, number>();
  for (const boundaryProfile of profile.boundaryProfiles) {
    counts.set(
      boundaryProfile.kind,
      (counts.get(boundaryProfile.kind) ?? 0) + 1
    );
  }

  return orderBy(
    [...counts.entries()],
    [(entry) => entry[0]],
    ["asc"]
  )
    .map(([kind, count]) => `${kind}=${count}`)
    .join(", ");
}

export function summarizeCanonicalBoundarySupport(
  profile: TaroPackageProfile
): string {
  const supportImports = orderBy(
    uniq(
      profile.boundaryProfiles
        .map((boundaryProfile) => boundaryProfile.supportImportPath)
        .filter((entry): entry is string => Boolean(entry))
    ),
    [(entry) => entry],
    ["asc"]
  );

  if (supportImports.length === 0) {
    return "none";
  }

  return supportImports.map((entry) => `\`${entry}\``).join(", ");
}

export function summarizeBoundaryTeaching(profile: TaroPackageProfile): string {
  const patterns = profile.teaching?.dominantPatterns ?? [];
  if (patterns.length === 0) {
    return "none";
  }
  return patterns.map((pattern) => `\`${pattern}\``).join(", ");
}

export function buildStateSummaryMarkdown(
  projectRoot: string,
  state: TaroState
): string {
  const qualityIndex = buildGeneratedTestQualityIndex(
    projectRoot,
    state.generatedTests
  );
  const lines = [
    "# Taro Boundary Summary",
    "",
    `Updated: ${state.meta.updatedAt}`,
    "",
  ];
  const profiles = orderBy(
    Object.values(state.packages),
    [(profile) => profile.packagePath],
    ["asc"]
  );

  if (profiles.length === 0) {
    lines.push("No package-scoped test knowledge has been learned yet.");
    return lines.join("\n");
  }

  for (const profile of profiles) {
    const learningSummary = summarizePackageScoreLearning(profile, qualityIndex);
    lines.push(`## ${profile.packagePath}`);
    lines.push("");
    lines.push(`- Runner: \`${profile.runner.value}\``);
    lines.push(
      `- Score-aware learning: ${learningSummary.scoredTestFileCount > 0 ? "active" : "inactive"} (${learningSummary.scoredTestFileCount} scored, ${learningSummary.unscoredTestFileCount} unscored, source=generatedTests, mode=weighted-bias)`
    );
    lines.push(
      `- Preferred render boundary: \`${summarizeRenderBoundaryPreference(profile)}\``
    );
    lines.push(`- Render boundary candidates: ${profile.renderTargets.length}`);
    lines.push(
      `- Collaborator categories: ${summarizeCollaboratorKinds(profile)}`
    );
    lines.push(
      `- Canonical boundary support: ${summarizeCanonicalBoundarySupport(profile)}`
    );
    lines.push(
      `- Dominant boundary patterns: ${summarizeBoundaryTeaching(profile)}`
    );
    lines.push(
      `- Learned boundary profiles: ${profile.boundaryProfiles.length}`
    );
    lines.push(
      `- Learned interaction contracts: ${profile.interactionContracts.length}`
    );
    lines.push(
      `- Low-confidence scaffolds awaiting corroboration: ${profile.boundaryProfiles.filter((entry) => entry.lowConfidenceScaffold).length}`
    );
    lines.push(
      "- Query hook policy: `avoid` by default (overrides can refine this at generation time)"
    );
    lines.push("");
    lines.push("### Boundaries");
    lines.push(
      ...summarizeBoundaryProfiles(profile.boundaryProfiles, {
        renderHelpers: profile.renderHelpers,
        playwrightAuth: profile.playwrightAuth,
      })
    );
    lines.push("");
    lines.push("### Boundary Teaching");
    if ((profile.teaching?.examples.length ?? 0) === 0) {
      lines.push("- No abstract boundary teaching examples recorded yet.");
    } else {
      for (const example of profile.teaching?.examples ?? []) {
        lines.push(
          `- \`${example.target}\`: pattern=${example.pattern}, confidence=${example.confidence}, summary=${example.summary}`
        );
      }
    }
    lines.push("");
    lines.push("### Exemplars");
    if (profile.boundaryExemplars.length === 0) {
      lines.push("- No boundary exemplars recorded yet.");
    } else {
      for (const exemplar of profile.boundaryExemplars) {
        lines.push(
          `- \`${exemplar.file}\`: render=${exemplar.renderBoundary}, overrides=${exemplar.overrideStyle}, boundaries=${exemplar.boundaryTargets.join(", ") || "none"}`
        );
      }
    }
    if (profile.warnings.length > 0) {
      lines.push("");
      lines.push("### Warnings");
      for (const warning of profile.warnings) {
        lines.push(`- ${warning}`);
      }
    }
    lines.push("");
  }

  return lines.join("\n");
}

export function buildExistingStateResult(
  projectRoot: string,
  existingState: TaroState,
  existingStateWarnings: string[],
  overridesDiagnostics: ReadOverridesDiagnostics
): ScanStateResult {
  const summaryPackages = buildSummaryPackages(
    projectRoot,
    existingState.packages,
    existingState.generatedTests
  );

  return {
    state: existingState,
    summary: buildSummaryFromPackages(summaryPackages, {
      migratedLegacyState: false,
      overridePackageCount: Object.keys(
        overridesDiagnostics.overrides.packages ?? {}
      ).length,
      warnings: [...existingStateWarnings, ...overridesDiagnostics.warnings],
    }),
  };
}
