import { detectRepoContractIssues } from "#core/repo-contracts.ts";
import type {
  ExistingTestGradeDimensions,
  ExistingTestGradeReason,
  ExistingTestGradeResult,
  ExistingTestGradeSignals,
} from "#types/existing-test-grade.ts";

const STRONG_ASSERTION_REGEX =
  /\b(?:toHaveValue|toBeChecked|toHaveTextContent|toHaveAttribute|toHaveAccessibleName|toHaveDisplayValue)\s*\(/g;
const PRESENCE_ASSERTION_REGEX = /\btoBeInTheDocument\s*\(/g;
const VISIBILITY_ASSERTION_REGEX = /\btoBeVisible\s*\(/g;
const PAYLOAD_ASSERTION_REGEX = /\btoHaveBeen(?:Nth|Last)?CalledWith\s*\(/g;
const MOCK_CALL_ASSERTION_REGEX = /\btoHaveBeenCalled(?:Times|Once)?\s*\(/g;
const ROLE_QUERY_REGEX = /\b(?:get|query|find)(?:All)?ByRole\s*\(/g;
const LABEL_QUERY_REGEX = /\b(?:get|query|find)(?:All)?ByLabelText\s*\(/g;
const PLACEHOLDER_QUERY_REGEX =
  /\b(?:get|query|find)(?:All)?ByPlaceholderText\s*\(/g;
const TEXT_QUERY_REGEX = /\b(?:get|query|find)(?:All)?ByText\s*\(/g;
const TEST_ID_QUERY_REGEX = /\b(?:get|query|find)(?:All)?ByTestId\s*\(/g;
const QUERY_SELECTOR_REGEX =
  /\b(?:container\.)?querySelector(?:All)?\s*\(|\.closest\s*\(/g;
const POSITIONAL_ROLE_QUERY_REGEX =
  /\b(?:getAllByRole|queryAllByRole|findAllByRole)\s*\([^\n]*\)\s*\[\s*\d+\s*\]/g;
const SHARED_MOCK_IMPORT_REGEX =
  /from\s+["'][^"']*(?:tests\/mocks|__mocks__)[^"']*["']/g;
const PASSTHROUGH_MODULE_MOCK_REGEX =
  /\b(?:vi|jest)\.mock\s*\([\s\S]*?\bimportOriginal\b[\s\S]*?\bconst\s+actual\s*=\s*await\s+importOriginal(?:<[^>]+>)?\s*\([\s\S]*?\)\s*;[\s\S]*?\breturn\s*\{[\s\S]*?\.\.\.\s*actual\b[\s\S]*?\}/g;
const RENDER_HELPER_IMPORT_REGEX =
  /(?:renderWith[A-Z]\w*|from\s+["'][^"']*tests\/render[^"']*["'])/g;
const SETUP_HELPER_REGEX =
  /\b(?:const|function)\s+(setup|build[A-Z]\w*|render[A-Z]\w*|open[A-Z]\w*|make[A-Z]\w*|create[A-Z]\w*Props|with[A-Z]\w*)\b/g;
const BEFORE_EACH_REGEX = /\bbeforeEach\s*\(/g;
const MOCK_RESET_REGEX =
  /\.(?:mockClear|mockReset|mockRestore)\s*\(|\breset[A-Z]\w*\s*\(/g;
const BASE_PROPS_REGEX = /\b(?:BASE|DEFAULT)_[A-Z0-9_]*PROPS\b|\bbaseProps\b/g;

const ISSUE_REASON_CONFIG: Record<
  string,
  {
    dimension: keyof ExistingTestGradeDimensions;
    weight: number;
    severity?: "advisory" | "blocker";
  }
> = {
  "helper-assertion": {
    dimension: "maintainability",
    weight: 5,
    severity: "advisory",
  },
  "query-to-be-defined": {
    dimension: "assertionStrength",
    weight: 4,
    severity: "advisory",
  },
  "loose-payload": {
    dimension: "assertionStrength",
    weight: 5,
    severity: "advisory",
  },
  "shared-mutable-mock-state": {
    dimension: "mockFidelity",
    weight: 6,
    severity: "advisory",
  },
  "split-async-mock-assertions": {
    dimension: "assertionStrength",
    weight: 4,
    severity: "advisory",
  },
  "manual-dom-repair": {
    dimension: "maintainability",
    weight: 7,
    severity: "blocker",
  },
  "regex-text-matcher": {
    dimension: "robustness",
    weight: 2,
    severity: "advisory",
  },
  "mixed-reset-boundary": {
    dimension: "maintainability",
    weight: 4,
    severity: "advisory",
  },
  "generic-component-contract": {
    dimension: "readability",
    weight: 3,
    severity: "advisory",
  },
  "incomplete-asset-mock": {
    dimension: "mockFidelity",
    weight: 4,
    severity: "advisory",
  },
  "component-mock-reimplementation": {
    dimension: "mockFidelity",
    weight: 14,
    severity: "blocker",
  },
  "dynamic-prop-shape-dispatcher": {
    dimension: "mockFidelity",
    weight: 10,
    severity: "blocker",
  },
  "duplicate-const-source": {
    dimension: "maintainability",
    weight: 6,
    severity: "blocker",
  },
  "overloaded-hoisted-state": {
    dimension: "maintainability",
    weight: 5,
    severity: "advisory",
  },
};

function countMatches(input: string, pattern: RegExp): number {
  return input.match(pattern)?.length ?? 0;
}

function clamp(value: number, max: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.min(max, Math.round(value)));
}

function toGrade(total: number): ExistingTestGradeResult["grade"] {
  if (total >= 90) {
    return "A";
  }
  if (total >= 80) {
    return "B";
  }
  if (total >= 70) {
    return "C";
  }
  if (total >= 60) {
    return "D";
  }
  return "F";
}

function collectSignals(code: string): ExistingTestGradeSignals {
  return {
    roleQueryCount: countMatches(code, ROLE_QUERY_REGEX),
    labelQueryCount: countMatches(code, LABEL_QUERY_REGEX),
    placeholderQueryCount: countMatches(code, PLACEHOLDER_QUERY_REGEX),
    textQueryCount: countMatches(code, TEXT_QUERY_REGEX),
    testIdQueryCount: countMatches(code, TEST_ID_QUERY_REGEX),
    querySelectorCount: countMatches(code, QUERY_SELECTOR_REGEX),
    positionalRoleQueryCount: countMatches(code, POSITIONAL_ROLE_QUERY_REGEX),
    payloadAssertionCount: countMatches(code, PAYLOAD_ASSERTION_REGEX),
    strongAssertionCount: countMatches(code, STRONG_ASSERTION_REGEX),
    presenceAssertionCount: countMatches(code, PRESENCE_ASSERTION_REGEX),
    visibilityAssertionCount: countMatches(code, VISIBILITY_ASSERTION_REGEX),
    mockCallAssertionCount: countMatches(code, MOCK_CALL_ASSERTION_REGEX),
    sharedMockImportCount: countMatches(code, SHARED_MOCK_IMPORT_REGEX),
    passthroughModuleMockCount: countMatches(
      code,
      PASSTHROUGH_MODULE_MOCK_REGEX
    ),
    setupHelperCount:
      countMatches(code, SETUP_HELPER_REGEX) +
      countMatches(code, BASE_PROPS_REGEX),
    renderHelperImportCount: countMatches(code, RENDER_HELPER_IMPORT_REGEX),
    beforeEachCount: countMatches(code, BEFORE_EACH_REGEX),
    mockResetCount: countMatches(code, MOCK_RESET_REGEX),
    lineCount: code.split(/\r?\n/u).filter((line) => line.trim().length > 0)
      .length,
  };
}

function pushReason(
  reasons: ExistingTestGradeReason[],
  reason: ExistingTestGradeReason
) {
  reasons.push(reason);
}

function scoreRobustness(
  code: string,
  signals: ExistingTestGradeSignals,
  reasons: ExistingTestGradeReason[]
): number {
  let score = 10;

  if (signals.roleQueryCount > 0) {
    score += 8;
    pushReason(reasons, {
      code: "role-queries",
      dimension: "robustness",
      impact: "positive",
      weight: 6,
      message:
        "Primary interactions use role queries, which are the most stable RTL selector family.",
    });
  }

  if (signals.labelQueryCount > 0) {
    score += 4;
  }

  if (signals.textQueryCount > 0) {
    score += 1;
  }

  if (signals.testIdQueryCount > 0) {
    score -= Math.min(3, signals.testIdQueryCount);
    pushReason(reasons, {
      code: "test-id-queries",
      dimension: "robustness",
      impact: "negative",
      weight: 1,
      message:
        "The suite relies on test-id queries, which are less robust than accessible queries when labels or roles exist.",
      severity: "advisory",
    });
  }

  if (
    signals.placeholderQueryCount > 0 &&
    signals.roleQueryCount === 0 &&
    signals.labelQueryCount === 0
  ) {
    score -= 4;
    pushReason(reasons, {
      code: "placeholder-queries",
      dimension: "robustness",
      impact: "negative",
      weight: 4,
      message:
        "The main form interactions rely on placeholder queries instead of accessible labels or roles.",
      severity: "advisory",
    });
  }

  if (signals.querySelectorCount > 0) {
    score -= 10;
    pushReason(reasons, {
      code: "layout-coupled-selectors",
      dimension: "robustness",
      impact: "negative",
      weight: 10,
      message:
        "The suite uses DOM traversal selectors such as querySelector() or closest(), which couple the test to layout details.",
      severity: "blocker",
    });
  }

  if (signals.positionalRoleQueryCount > 0) {
    score -= 8;
    pushReason(reasons, {
      code: "positional-role-query",
      dimension: "robustness",
      impact: "negative",
      weight: 8,
      message:
        "The suite indexes into getAllByRole-style queries instead of targeting a stable accessible name.",
      severity: "blocker",
    });
  }

  if (/render\s*\(\s*<App\s*\/?/u.test(code)) {
    score -= 5;
    pushReason(reasons, {
      code: "placeholder-render-target",
      dimension: "robustness",
      impact: "negative",
      weight: 5,
      message:
        "The test renders a placeholder app shell rather than the concrete repo component under test.",
      severity: "advisory",
    });
  }

  return clamp(score, 25);
}

function scoreReadability(
  signals: ExistingTestGradeSignals,
  issues: ReturnType<typeof detectRepoContractIssues>,
  reasons: ExistingTestGradeReason[]
): number {
  let score = 8;

  if (signals.setupHelperCount > 0) {
    score += Math.min(4, signals.setupHelperCount);
    pushReason(reasons, {
      code: "shared-fixtures",
      dimension: "readability",
      impact: "positive",
      weight: 4,
      message:
        "The suite centralizes setup or fixture construction instead of repeating inline props in every test.",
    });
  }

  if (signals.renderHelperImportCount > 0) {
    score += 2;
  }

  if (signals.lineCount > 260) {
    score -= 1;
    pushReason(reasons, {
      code: "large-suite",
      dimension: "readability",
      impact: "negative",
      weight: 3,
      message:
        "The test file is large enough that the intent becomes harder to scan quickly.",
      severity: "advisory",
    });
  }

  if (issues.some((issue) => issue.code === "generic-component-contract")) {
    score -= 3;
  }

  return clamp(score, 15);
}

function scoreAssertionStrength(
  signals: ExistingTestGradeSignals,
  issues: ReturnType<typeof detectRepoContractIssues>,
  reasons: ExistingTestGradeReason[]
): number {
  let score = 6;
  const hasVisibleOutcome =
    signals.presenceAssertionCount +
      signals.visibilityAssertionCount +
      signals.strongAssertionCount >
    0;

  if (signals.payloadAssertionCount > 0) {
    score += 8;
    pushReason(reasons, {
      code: "exact-payload-assertions",
      dimension: "assertionStrength",
      impact: "positive",
      weight: 7,
      message:
        "The suite asserts exact mutation payloads instead of stopping at generic mock-call checks.",
    });
  }

  if (signals.strongAssertionCount > 0) {
    score += Math.min(4, signals.strongAssertionCount * 2);
  }

  if (hasVisibleOutcome) {
    score += 3;
  }

  if (
    signals.mockCallAssertionCount > 0 &&
    signals.payloadAssertionCount === 0
  ) {
    score -= 5;
    pushReason(reasons, {
      code: "generic-mock-call-assertions",
      dimension: "assertionStrength",
      impact: "negative",
      weight: 5,
      message:
        "The suite asserts that mocks were called but does not pin the exact payload for the user-driven values under test.",
      severity: "advisory",
    });
  }

  if (!hasVisibleOutcome) {
    score -= 5;
    pushReason(reasons, {
      code: "missing-visible-outcome",
      dimension: "assertionStrength",
      impact: "negative",
      weight: 5,
      message:
        "The suite does not assert a visible user outcome after the interaction sequence completes.",
      severity: "advisory",
    });
  }

  if (
    signals.presenceAssertionCount > 0 &&
    signals.strongAssertionCount === 0 &&
    signals.payloadAssertionCount === 0
  ) {
    score -= 3;
    pushReason(reasons, {
      code: "presence-only-assertions",
      dimension: "assertionStrength",
      impact: "negative",
      weight: 3,
      message:
        "The suite leans on presence checks without adding exact content, value, or payload assertions.",
      severity: "advisory",
    });
  }

  if (issues.some((issue) => issue.code === "loose-payload")) {
    score -= 3;
  }

  return clamp(score, 20);
}

function scoreMockFidelity(
  signals: ExistingTestGradeSignals,
  issues: ReturnType<typeof detectRepoContractIssues>,
  reasons: ExistingTestGradeReason[]
): number {
  let score = 12;

  if (signals.sharedMockImportCount > 0) {
    score += Math.min(4, signals.sharedMockImportCount * 2);
    pushReason(reasons, {
      code: "shared-mock-support",
      dimension: "mockFidelity",
      impact: "positive",
      weight: 4,
      message:
        "The suite reuses repo-local shared mock support instead of rebuilding those boundaries inline.",
    });
  }

  if (signals.passthroughModuleMockCount > 0) {
    score += 2;
    pushReason(reasons, {
      code: "passthrough-module-mock",
      dimension: "mockFidelity",
      impact: "positive",
      weight: 2,
      message:
        "Module mocks preserve upstream contract shape by spreading importOriginal() output before local overrides.",
    });
  }

  for (const issue of issues) {
    const config = ISSUE_REASON_CONFIG[issue.code];
    if (!config || config.dimension !== "mockFidelity") {
      continue;
    }

    score -= config.weight;
    pushReason(reasons, {
      code: issue.code,
      dimension: "mockFidelity",
      impact: "negative",
      weight: config.weight,
      message: issue.message,
      severity: config.severity,
    });
  }

  return clamp(score, 20);
}

function scoreMaintainability(
  signals: ExistingTestGradeSignals,
  issues: ReturnType<typeof detectRepoContractIssues>,
  reasons: ExistingTestGradeReason[]
): number {
  let score = 9;

  if (signals.setupHelperCount > 0) {
    score += Math.min(4, signals.setupHelperCount);
  }

  if (signals.beforeEachCount > 0 && signals.mockResetCount > 0) {
    score += 3;
    pushReason(reasons, {
      code: "clean-mock-reset",
      dimension: "maintainability",
      impact: "positive",
      weight: 3,
      message:
        "The suite resets shared mock state in beforeEach, which keeps per-test behavior isolated.",
    });
  }

  if (signals.renderHelperImportCount > 0) {
    score += 2;
  }

  if (signals.lineCount > 260) {
    score -= 3;
  }

  for (const issue of issues) {
    const config = ISSUE_REASON_CONFIG[issue.code];
    if (!config || config.dimension !== "maintainability") {
      continue;
    }

    score -= config.weight;
    pushReason(reasons, {
      code: issue.code,
      dimension: "maintainability",
      impact: "negative",
      weight: config.weight,
      message: issue.message,
      severity: config.severity,
    });
  }

  return clamp(score, 20);
}

function dedupeReasons(
  reasons: ExistingTestGradeReason[]
): ExistingTestGradeReason[] {
  const seen = new Set<string>();
  const deduped: ExistingTestGradeReason[] = [];

  for (const reason of reasons) {
    const key = `${reason.code}:${reason.dimension}:${reason.impact}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    deduped.push(reason);
  }

  return deduped;
}

function deriveBlockers(reasons: ExistingTestGradeReason[]): string[] {
  const blockers = reasons
    .filter(
      (reason) =>
        reason.impact === "negative" &&
        (reason.severity === "blocker" || reason.weight >= 8)
    )
    .map((reason) => reason.message);

  return [...new Set(blockers)].slice(0, 3);
}

export function gradeExistingTest(code: string): ExistingTestGradeResult {
  const signals = collectSignals(code);
  const repoIssues = detectRepoContractIssues(code);
  const reasons: ExistingTestGradeReason[] = [];
  const dimensions: ExistingTestGradeDimensions = {
    robustness: scoreRobustness(code, signals, reasons),
    readability: scoreReadability(signals, repoIssues, reasons),
    assertionStrength: scoreAssertionStrength(signals, repoIssues, reasons),
    mockFidelity: scoreMockFidelity(signals, repoIssues, reasons),
    maintainability: scoreMaintainability(signals, repoIssues, reasons),
  };
  const dedupedReasons = dedupeReasons(reasons);
  const total = clamp(
    dimensions.robustness +
      dimensions.readability +
      dimensions.assertionStrength +
      dimensions.mockFidelity +
      dimensions.maintainability,
    100
  );
  const blockers = deriveBlockers(dedupedReasons);
  const grade = toGrade(total);

  return {
    total,
    grade,
    dimensions,
    signals,
    reasons: dedupedReasons,
    blockers,
    requiresReview:
      total < 80 ||
      dedupedReasons.some(
        (reason) =>
          reason.impact === "negative" && reason.severity === "blocker"
      ),
  };
}
