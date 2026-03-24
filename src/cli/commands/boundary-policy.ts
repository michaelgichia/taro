import {
  discoverBoundaryImportsFromSource,
  inferBoundaryPattern,
} from "#core/boundary-learning.ts";
import type { ResolvedTaroPackageProfile } from "#types/state.ts";

export async function auditBoundaryPolicy(
  code: string,
  packageProfile: ResolvedTaroPackageProfile | null,
  renderTargetFile: string | null
): Promise<string[]> {
  if (!packageProfile) {
    if (!renderTargetFile) {
      return [];
    }
  }

  const warnings: string[] = [];
  const discoveredImports = renderTargetFile
    ? await discoverBoundaryImportsFromSource(renderTargetFile)
    : [];
  const forbiddenTargets = new Set<string>([
    ...(packageProfile?.forbidMocks ?? []),
    ...(packageProfile?.forbidBoundaryTargets ?? []),
    ...(packageProfile?.boundaryProfiles ?? [])
      .filter((profile) => profile.strategy === "forbid")
      .map((profile) => profile.target),
    ...discoveredImports
      .filter((importedBoundary) => importedBoundary.guardrailReason)
      .map((importedBoundary) => importedBoundary.target),
  ]);

  for (const target of forbiddenTargets) {
    if (
      code.includes(`vi.mock('${target}'`) ||
      code.includes(`vi.mock("${target}"`) ||
      code.includes(`jest.mock('${target}'`) ||
      code.includes(`jest.mock("${target}"`)
    ) {
      warnings.push(
        `Generated test mocks forbidden boundary target "${target}".`
      );
    }
  }

  for (const discoveredImport of discoveredImports) {
    if (
      discoveredImport.guardrailReason !== "repo-owned-ui-wrapper" ||
      (!code.includes(`vi.mock('${discoveredImport.target}'`) &&
        !code.includes(`vi.mock("${discoveredImport.target}"`) &&
        !code.includes(`jest.mock('${discoveredImport.target}'`) &&
        !code.includes(`jest.mock("${discoveredImport.target}"`))
    ) {
      continue;
    }

    warnings.push(
      `Generated test violates a keep-real boundary pattern for "${discoveredImport.target}". Solve render-layer issues at the boundary itself instead of mocking through the wrapper.`
    );
  }

  for (const profile of packageProfile?.boundaryProfiles ?? []) {
    const pattern =
      profile.pattern ??
      inferBoundaryPattern({
        strategy: profile.strategy,
        guardrailReason: profile.guardrailReason,
        supportImportPath: profile.supportImportPath,
        supportExports: profile.supportExports,
      });
    const mocksBoundary =
      code.includes(`vi.mock('${profile.target}'`) ||
      code.includes(`vi.mock("${profile.target}"`) ||
      code.includes(`jest.mock('${profile.target}'`) ||
      code.includes(`jest.mock("${profile.target}"`);

    if (
      pattern === "partial-support-import" &&
      profile.supportImportPath &&
      mocksBoundary &&
      profile.guardrailReason === "ui-package"
    ) {
      warnings.push(
        `Generated test inline-mocks shared UI package "${profile.target}" even though repo policy prefers a partial support import. Reuse "${profile.supportImportPath}" and keep the shared boundary mostly real.`
      );
      continue;
    }

    if (
      pattern === "partial-support-import" &&
      profile.supportImportPath &&
      mocksBoundary &&
      !code.includes(profile.supportImportPath)
    ) {
      warnings.push(
        `Generated test ignored a learned partial-support pattern for "${profile.target}". Reuse the repo support import and keep the shared boundary mostly real.`
      );
      continue;
    }

    if (
      pattern === "factory-support" &&
      profile.supportImportPath &&
      mocksBoundary &&
      !code.includes(profile.supportImportPath)
    ) {
      warnings.push(
        `Generated test bypasses a learned factory-support pattern for "${profile.target}". Reuse the strongest local support handles instead of rebuilding the boundary inline.`
      );
    }
  }

  if (
    packageProfile?.boundaryProfiles.some(
      (profile) => profile.strategy === "provider-wrapper"
    ) &&
    !packageProfile?.effectiveRenderHelper &&
    code.includes("render(")
  ) {
    warnings.push(
      "Generated test may bypass a learned provider-wrapper boundary because no shared render helper was applied."
    );
  }

  return warnings;
}
