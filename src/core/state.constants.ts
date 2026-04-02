import type { MutationLifecycleStage } from "#types/conventions.ts";

export const STATE_VERSION = 2;
export const GENERATED_TEST_HISTORY_LIMIT_PER_TEST = 5;
export const MAX_EVIDENCE = 50;
export const MAX_EXEMPLARS = 5;
export const MAX_FIXTURE_ROOTS = 25;
export const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  ".taro",
  "coverage",
  ".next",
  ".nuxt",
]);
export const FIXTURE_DIR_NAMES = [
  "mock-store",
  "mocks",
  "fixtures",
  "factories",
] as const;
export const MOCK_TARGET_REGEX = /(?:vi|jest)\.mock\(\s*['"`]([^'"`]+)['"`]/g;
export const MUTATION_TRIGGER_REGEX =
  /\b(mutate|mutation|submit|save|create|update|delete)\b|mock(?:Resolved|Rejected)Value(?:Once)?\(/i;
export const TEST_BLOCK_REGEX = /\b(?:it|test)\s*\(/g;
export const TEST_SCOPED_MOCK_REGEX = /(?:vi|jest)\.mock\(/i;
export const MOCK_RESET_REGEX =
  /(?:vi|jest)\.(?:clearAllMocks|resetAllMocks|restoreAllMocks)\(/g;
export const MOCK_CONFIGURATION_REGEX =
  /\.mock(?:ResolvedValue|RejectedValue|Implementation|ReturnValue)(?:Once)?\(/g;
export const PLAYWRIGHT_CONFIG_FILES = [
  "playwright.config.ts",
  "playwright.config.mts",
  "playwright.config.cts",
  "playwright.config.js",
  "playwright.config.mjs",
  "playwright.config.cjs",
] as const;
export const PLAYWRIGHT_STORAGE_STATE_REGEX =
  /storageState\s*:\s*['"`]([^'"`]+)['"`]/g;
export const PLAYWRIGHT_AUTH_DIRS = [
  "playwright/.auth",
  ".auth",
  "e2e/.auth",
  "tests/e2e/.auth",
] as const;
export const TEST_CONFIG_FILE_REGEX =
  /^(?:vitest|vite|jest)\.config\.[cm]?[jt]sx?$/u;
export const JEST_DOM_IMPORT_REGEX =
  /(?:import\s+['"]@testing-library\/jest-dom(?:\/vitest)?['"]|require\(\s*['"]@testing-library\/jest-dom(?:\/vitest)?['"]\s*\))/u;
export const SETUP_FILE_CONFIG_REGEX =
  /\bsetupFiles(?:AfterEnv)?\s*:\s*(\[[\s\S]*?\]|['"`][^'"`]+['"`])/g;
export const STAGE_PATTERNS: Record<MutationLifecycleStage, RegExp[]> = {
  loading: [
    /\bisLoading\b/i,
    /\bloading\b/i,
    /\bpending\b/i,
    /\bsubmitting\b/i,
    /toBeDisabled\(/,
  ],
  success: [
    /mockResolvedValue(?:Once)?\(/,
    /\b(success|saved|created|updated|submitted)\b/i,
    /toHaveBeenCalled(?:Times|With)?\(/,
  ],
  error: [
    /mockRejectedValue(?:Once)?\(/,
    /throw new Error\(/,
    /\b(error|failed|failure)\b/i,
    /role:\s*['"`]alert['"`]/,
  ],
};
export const SCORE_WEIGHT_MIN = 0.6;
export const SCORE_WEIGHT_MAX = 1.3;
export const SCORE_WEIGHT_BASE = 0.3;
export const SCORE_REVIEW_CAP = 0.85;
export const TARGET_OUTPUT_SCORE_GATE = 0.99;
export const MIXED_CONVENTION_THRESHOLD = 0.8;

export const SCAN_STATE_MACHINE_ID = "scanState";
export const LOAD_OR_BOOTSTRAP_STATE_MACHINE_ID = "loadOrBootstrapState";

export const SCAN_STATE_FAILURE_MESSAGE = "Failed to scan project state.";
export const LOAD_OR_BOOTSTRAP_STATE_FAILURE_MESSAGE =
  "Failed to load or bootstrap Taro state.";
