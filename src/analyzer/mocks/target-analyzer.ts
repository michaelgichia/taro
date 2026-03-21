/**
 * Mock Target Analyzer - Identifies appropriate mock targets from codebase
 *
 * Analyzes the codebase to determine which mock libraries are available
 * (msw, jest.fn, sinon) and suggests appropriate mock targets based
 * on the detected API calls.
 */

import type { ApiCallInfo } from "#analyzer/mocks/detector.ts";

/**
 * Information about a mock target
 */
export interface MockTarget {
  /** Unique identifier */
  id: string;
  /** The API call this mock targets */
  apiCallId: string;
  /** URL or endpoint to mock */
  url: string;
  /** HTTP method */
  method: string;
  /** Recommended mock library */
  mockLibrary: "msw" | "jest.fn" | "sinon" | "fetch-mock" | "undici" | "nock";
  /** Whether to inline the mock or extract to separate file */
  extractionRecommendation: "inline" | "extracted" | "shared";
  /** Rationale for recommendations */
  rationale: string;
  /** Suggested mock file path (if extracted) */
  suggestedFilePath?: string;
}

/**
 * Mock library detected in the codebase
 */
interface MockLibrary {
  /** Library name */
  name: "msw" | "jest.fn" | "sinon" | "fetch-mock" | "undici" | "nock";
  /** Version if detectable */
  version?: string;
  /** File where it was detected */
  sourceFile?: string;
  /** Whether it's configured/initialized */
  isConfigured: boolean;
}

/**
 * Configuration for mock target analysis
 */
interface MockTargetAnalysisConfig {
  /** Preferred mock library (if multiple available) */
  preferredLibrary?: MockLibrary["name"];
  /** Maximum inline mock complexity */
  maxInlineComplexity?: number;
  /** Shared mocks directory */
  sharedMocksDir?: string;
}

/**
 * Detect available mock libraries from package.json dependencies
 */
export function detectMockLibraries(
  packageJson: Record<string, unknown>
): MockLibrary[] {
  const libraries: MockLibrary[] = [];
  const deps = {
    ...((packageJson.dependencies as Record<string, string>) || {}),
    ...((packageJson.devDependencies as Record<string, string>) || {}),
  };

  // Detect MSW (Mock Service Worker)
  if (deps["msw"] || deps["@mswjs/msw"]) {
    libraries.push({
      name: "msw",
      version: deps["msw"] || deps["@mswjs/msw"],
      isConfigured: false, // Would need to check for handlers setup
    });
  }

  // Jest is always available in Jest projects
  if (deps["jest"]) {
    libraries.push({
      name: "jest.fn",
      version: deps["jest"],
      isConfigured: true,
    });
  }

  // Sinon
  if (deps["sinon"]) {
    libraries.push({
      name: "sinon",
      version: deps["sinon"],
      isConfigured: false,
    });
  }

  // fetch-mock
  if (deps["fetch-mock"]) {
    libraries.push({
      name: "fetch-mock",
      version: deps["fetch-mock"],
      isConfigured: false,
    });
  }

  // undici (Node.js fetch polyfill with mocking support)
  if (deps["undici"]) {
    libraries.push({
      name: "undici",
      version: deps["undici"],
      isConfigured: false,
    });
  }

  // nock
  if (deps["nock"]) {
    libraries.push({
      name: "nock",
      version: deps["nock"],
      isConfigured: false,
    });
  }

  return libraries;
}

/**
 * Analyze code files to see which mock libraries are actually used
 */
export function analyzeMockLibraryUsage(
  files: { path: string; content: string }[]
): MockLibrary[] {
  const detected: MockLibrary[] = [];
  const seen = new Set<string>();

  for (const file of files) {
    const content = file.content;

    // Check for MSW usage
    if (
      content.includes("setupWorker") ||
      content.includes("setupMSW") ||
      (content.includes("http.get") && content.includes("msw/"))
    ) {
      if (!seen.has("msw")) {
        detected.push({
          name: "msw",
          isConfigured: true,
          sourceFile: file.path,
        });
        seen.add("msw");
      }
    }

    // Check for jest.fn() usage
    if (
      content.includes("jest.fn()") ||
      content.includes("jest.mock(") ||
      content.includes("vi.fn()")
    ) {
      if (!seen.has("jest.fn")) {
        detected.push({
          name: "jest.fn",
          isConfigured: true,
          sourceFile: file.path,
        });
        seen.add("jest.fn");
      }
    }

    // Check for sinon usage
    if (
      content.includes("sinon.stub") ||
      content.includes("sinon.spy") ||
      content.includes("sinon.mock")
    ) {
      if (!seen.has("sinon")) {
        detected.push({
          name: "sinon",
          isConfigured: true,
          sourceFile: file.path,
        });
        seen.add("sinon");
      }
    }

    // Check for fetch-mock
    if (content.includes("fetchMock") || content.includes("fetch-mock")) {
      if (!seen.has("fetch-mock")) {
        detected.push({
          name: "fetch-mock",
          isConfigured: true,
          sourceFile: file.path,
        });
        seen.add("fetch-mock");
      }
    }

    // Check for undici
    if (content.includes("MockAgent") && content.includes("undici")) {
      if (!seen.has("undici")) {
        detected.push({
          name: "undici",
          isConfigured: true,
          sourceFile: file.path,
        });
        seen.add("undici");
      }
    }

    // Check for nock
    if (content.includes("nock(") || content.includes("nock.recorder")) {
      if (!seen.has("nock")) {
        detected.push({
          name: "nock",
          isConfigured: true,
          sourceFile: file.path,
        });
        seen.add("nock");
      }
    }
  }

  return detected;
}

/**
 * Determine the best mock library for a given API call
 */
export function selectMockLibrary(
  apiCall: ApiCallInfo,
  availableLibraries: MockLibrary[],
  config?: MockTargetAnalysisConfig
): MockLibrary["name"] {
  // If preferred library is available, use it
  if (config?.preferredLibrary) {
    const preferred = availableLibraries.find(
      (l) => l.name === config.preferredLibrary
    );
    if (preferred) {
      return preferred.name;
    }
  }

  // For external APIs, prefer MSW or fetch-mock for HTTP mocking
  if (apiCall.method === "fetch" || apiCall.method === "axios") {
    // Prefer MSW for REST APIs
    if (availableLibraries.find((l) => l.name === "msw")) {
      return "msw";
    }
    // Fall back to fetch-mock
    if (availableLibraries.find((l) => l.name === "fetch-mock")) {
      return "fetch-mock";
    }
    // Fall back to nock
    if (availableLibraries.find((l) => l.name === "nock")) {
      return "nock";
    }
  }

  // For XMLHttpRequest, prefer sinon or jest.fn
  if (apiCall.method === "XMLHttpRequest") {
    if (availableLibraries.find((l) => l.name === "sinon")) {
      return "sinon";
    }
    return "jest.fn";
  }

  // Default to jest.fn if nothing else available
  if (availableLibraries.find((l) => l.name === "jest.fn")) {
    return "jest.fn";
  }

  // Fallback
  return "jest.fn";
}

/**
 * Decide whether to inline or extract a mock
 */
export function decideMockExtraction(
  apiCall: ApiCallInfo,
  existingMocks: string[]
): "inline" | "extracted" | "shared" {
  // Check if there's already a mock for this URL
  const hasExistingMock = existingMocks.some((mock) =>
    mock.includes(apiCall.url || "")
  );
  if (hasExistingMock) {
    return "shared";
  }

  // External APIs should typically be extracted
  if (apiCall.isExternal) {
    return "extracted";
  }

  // Default to inline for simple cases
  return "inline";
}

/**
 * Estimate the complexity of a mock (lines of code)
 */
function estimateMockComplexity(apiCall: ApiCallInfo): number {
  let complexity = 1;

  // URL parameters increase complexity
  if (apiCall.url?.includes("?")) {
    complexity += 2;
  }

  // POST/PUT/PATCH methods typically have request bodies
  if (
    apiCall.httpMethod === "POST" ||
    apiCall.httpMethod === "PUT" ||
    apiCall.httpMethod === "PATCH"
  ) {
    complexity += 3;
  }

  // External APIs might need more sophisticated mocking
  if (apiCall.isExternal) {
    complexity += 2;
  }

  return complexity;
}

export const __targetAnalyzerTestUtils = { estimateMockComplexity };

/**
 * Generate suggested file path for extracted mock
 */
export function suggestMockFilePath(
  apiCall: ApiCallInfo,
  baseDir: string = "__mocks__"
): string {
  if (!apiCall.url) {
    return `${baseDir}/api-mock.ts`;
  }

  try {
    const url = new URL(apiCall.url);
    const pathParts = url.pathname.split("/").filter(Boolean);

    // Clean up path parts for file names
    const fileName = pathParts.join("-") || "index";
    const cleanFileName = fileName.replace(/[^a-zA-Z0-9-]/g, "-").toLowerCase();

    return `${baseDir}/${url.hostname}/${cleanFileName}.ts`;
  } catch {
    return `${baseDir}/api-mock.ts`;
  }
}

/**
 * Main function to analyze mock targets
 */
export function analyzeMockTargets(
  apiCalls: ApiCallInfo[],
  options?: {
    packageJson?: Record<string, unknown>;
    codebaseFiles?: { path: string; content: string }[];
    config?: MockTargetAnalysisConfig;
  }
): MockTarget[] {
  const targets: MockTarget[] = [];

  // Detect available mock libraries
  let availableLibraries: MockLibrary[] = [];

  if (options?.packageJson) {
    availableLibraries = detectMockLibraries(options.packageJson);
  }

  if (options?.codebaseFiles) {
    const usedLibraries = analyzeMockLibraryUsage(options.codebaseFiles);
    // Merge with package.json detections, preferring configured ones
    for (const lib of usedLibraries) {
      const existing = availableLibraries.find((l) => l.name === lib.name);
      if (!existing) {
        availableLibraries.push(lib);
      } else {
        existing.isConfigured = lib.isConfigured || existing.isConfigured;
      }
    }
  }

  // If no libraries detected, default to jest.fn
  if (availableLibraries.length === 0) {
    availableLibraries.push({ name: "jest.fn", isConfigured: true });
  }

  // Get existing mock files (simple heuristic)
  const existingMocks =
    options?.codebaseFiles
      ?.filter((f) => f.path.includes("__mocks__") || f.path.includes(".mock."))
      .map((f) => f.path) || [];

  // Analyze each API call
  for (const apiCall of apiCalls) {
    const mockLibrary = selectMockLibrary(
      apiCall,
      availableLibraries,
      options?.config
    );
    const extraction = decideMockExtraction(apiCall, existingMocks);
    const suggestedPath =
      extraction !== "inline" ? suggestMockFilePath(apiCall) : undefined;

    targets.push({
      id: `mock-target-${apiCall.id}`,
      apiCallId: apiCall.id,
      url: apiCall.url || "unknown",
      method: apiCall.httpMethod || "GET",
      mockLibrary,
      extractionRecommendation: extraction,
      rationale: buildRationale(
        apiCall,
        mockLibrary,
        extraction,
        availableLibraries
      ),
      suggestedFilePath: suggestedPath,
    });
  }

  return targets;
}

/**
 * Build a rationale string for the mock decision
 */
function buildRationale(
  apiCall: ApiCallInfo,
  library: MockLibrary["name"],
  extraction: "inline" | "extracted" | "shared",
  availableLibraries: MockLibrary[]
): string {
  const parts: string[] = [];

  // Library choice rationale
  const libInfo = availableLibraries.find((l) => l.name === library);
  if (libInfo?.isConfigured) {
    parts.push(`Using ${library} (already configured in project)`);
  } else {
    parts.push(`Using ${library} (detected in dependencies)`);
  }

  // Extraction rationale
  if (extraction === "inline") {
    parts.push("inline for simplicity (simple mock)");
  } else if (extraction === "extracted") {
    parts.push("extracted to separate file (complex/external API)");
  } else {
    parts.push("reusing existing mock (shared)");
  }

  return parts.join(". ");
}

/**
 * Group mock targets by recommended approach
 */
export function groupMockTargetsByApproach(
  targets: MockTarget[]
): Map<string, MockTarget[]> {
  const groups = new Map<string, MockTarget[]>();

  for (const target of targets) {
    const key = `${target.mockLibrary}:${target.extractionRecommendation}`;
    const existing = groups.get(key) || [];
    groups.set(key, [...existing, target]);
  }

  return groups;
}
