import type { Finding } from "#core/findings-reporter.ts";
import type { MockAnalysis } from "#core/mock-intelligence.ts";
import { detectRepoContractIssues } from "#core/repo-contracts.ts";

const MODULE_MOCK_REGEX = /(?:vi|jest)\.mock\s*\(/u;
const MUTATION_ERROR_COVERAGE_REGEX =
  /mockRejectedValue(?:Once)?\(|(?:getByRole|findByRole|queryByRole)\(\s*['"]alert['"]/u;
const SHARED_FACTORY_STRATEGY = "shared-module-factory";

function hasModuleMockForTarget(code: string, target: string): boolean {
  return (
    code.includes(`vi.mock('${target}'`) ||
    code.includes(`vi.mock("${target}"`) ||
    code.includes(`jest.mock('${target}'`) ||
    code.includes(`jest.mock("${target}"`)
  );
}

function getPreferredSharedMockHint(
  code: string,
  mockAnalysis: MockAnalysis | null
): { importPath: string; target: string } | null {
  if (!mockAnalysis) {
    return null;
  }

  for (const [target, importPath] of Object.entries(
    mockAnalysis.preferredSharedMocks
  )) {
    if (hasModuleMockForTarget(code, target)) {
      return { importPath, target };
    }
  }

  for (const profile of mockAnalysis.boundaryProfiles) {
    if (
      profile.strategy === SHARED_FACTORY_STRATEGY &&
      profile.supportImportPath &&
      hasModuleMockForTarget(code, profile.target)
    ) {
      return { importPath: profile.supportImportPath, target: profile.target };
    }
  }

  return null;
}

function shouldTriggerMutationLifecycleReview(
  code: string,
  mockAnalysis: MockAnalysis | null,
  suiteWarnings: string[]
): boolean {
  if (
    suiteWarnings.some((warning) =>
      warning.includes("Repo mutation lifecycle evidence was detected")
    )
  ) {
    return true;
  }

  if (!mockAnalysis) {
    return false;
  }

  const hasMutationSignals =
    mockAnalysis.mutationLifecycles.length > 0 ||
    mockAnalysis.interactionContracts.some(
      (contract) => contract.kind === "mutation-form"
    );

  return hasMutationSignals && !MUTATION_ERROR_COVERAGE_REGEX.test(code);
}

export function buildMockReviewFindings(params: {
  boundaryPolicyWarnings?: string[];
  candidateSelected: boolean;
  mockAnalysis: MockAnalysis | null;
  outputPath: string;
  selectedCode: string;
  suiteWarnings?: string[];
}): Finding[] {
  const {
    boundaryPolicyWarnings = [],
    candidateSelected,
    mockAnalysis,
    outputPath,
    selectedCode,
    suiteWarnings = [],
  } = params;

  if (!candidateSelected) {
    return [];
  }

  const findings: Finding[] = [];
  const repoIssues = detectRepoContractIssues(selectedCode);
  const hasAnyMockSurface = MODULE_MOCK_REGEX.test(selectedCode);

  if (boundaryPolicyWarnings.length > 0) {
    findings.push({
      severity: "HIGH",
      category: "mock-boundary",
      message:
        `Generated test still carries mock boundary warnings that should trigger rtl-mocks review: ` +
        `${boundaryPolicyWarnings[0]} (${outputPath}).`,
    });
  }

  const instabilityIssues = repoIssues
    .filter((issue) =>
      [
        "shared-mutable-mock-state",
        "mixed-reset-boundary",
        "component-mock-reimplementation",
        "dynamic-prop-shape-dispatcher",
        "overloaded-hoisted-state",
      ].includes(issue.code)
    )
    .map((issue) => issue.message);
  const topRepoInstabilityIssue = instabilityIssues[0] ?? null;
  const topAnalysisInstabilityWarning =
    mockAnalysis?.instabilityWarnings[0] ?? null;
  if (topRepoInstabilityIssue || topAnalysisInstabilityWarning) {
    findings.push({
      severity: "HIGH",
      category: "mock-instability",
      message: topRepoInstabilityIssue
        ? `${topRepoInstabilityIssue} (${outputPath}).`
        : `Repo mock analysis flagged instability that should trigger rtl-mocks review: ` +
          `${topAnalysisInstabilityWarning?.reason ?? "unknown instability"} (${outputPath}).`,
    });
  }

  if (
    shouldTriggerMutationLifecycleReview(
      selectedCode,
      mockAnalysis,
      suiteWarnings
    )
  ) {
    findings.push({
      severity: "ADVISORY",
      category: "mock-lifecycle",
      message: `Repo mutation lifecycle evidence suggests ${outputPath} may need loading or failure companion coverage before final acceptance.`,
    });
  }

  const sharedMockHint =
    hasAnyMockSurface && getPreferredSharedMockHint(selectedCode, mockAnalysis);
  if (sharedMockHint) {
    findings.push({
      severity: "ADVISORY",
      category: "mock-support",
      message:
        `Generated test mocks ${sharedMockHint.target} inline even though repo state prefers shared support at ` +
        `${sharedMockHint.importPath}; trigger rtl-mocks review before finalizing ${outputPath}.`,
    });
  }

  return findings;
}
