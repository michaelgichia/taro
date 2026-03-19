/**
 * API Call Detector - Identifies API calls in recordings and codebase
 *
 * Detects fetch, XMLHttpRequest, and common API patterns to determine
 * which network calls need mocking in tests.
 */

import type { NormalizedRecording } from "#types/recording.ts";

/**
 * Information about a detected API call
 */
export interface ApiCallInfo {
  /** Unique identifier for this API call */
  id: string;
  /** Type of API call detected */
  method: "fetch" | "XMLHttpRequest" | "axios" | "fetch-jsonp" | "unknown";
  /** The URL or endpoint being called */
  url?: string;
  /** HTTP method if detectable */
  httpMethod?: string;
  /** Whether this is an external API (not same origin) */
  isExternal: boolean;
  /** Source where this was detected */
  source: "recording" | "codebase" | "both";
  /** The step in recording where this appears (if applicable) */
  recordingStepId?: string;
  /** File and line where this appears in codebase (if applicable) */
  codebaseLocation?: { file: string; line: number };
}

/**
 * Patterns that indicate an API call in code
 */
const API_PATTERNS = {
  fetch: [
    /\bfetch\s*\(\s*['"`]/i,
    /await\s+fetch\s*\(/i,
    /window\.fetch\s*\(/i,
  ],
  xmlHttpRequest: [/new\s+XMLHttpRequest\s*\(\s*\)/i, /xhr\s*\.\s*open\s*\(/i],
  axios: [
    /axios\.(get|post|put|patch|delete|request)\s*\(/i,
    /await\s+axios\s*\(/i,
  ],
  fetchJsonp: [/jsonp\s*\(/i, /\.jsonp\s*\(/i],
};

/**
 * Common API endpoint patterns
 */
const API_ENDPOINT_PATTERNS = [
  /\/api\//i,
  /\/v\d+\//i,
  /\/graphql/i,
  /\/rest\//i,
  /\/rpc\//i,
  /\.(json|xml)\s*$/i,
  /\?.*=/i, // Query string
];

/**
 * External API domains (common third-party services)
 */
const EXTERNAL_API_DOMAINS = [
  "api.",
  "://",
  ".com/",
  ".io/",
  ".net/",
  "localhost:", // Treat localhost as external for testing
];

/**
 * Detect API calls from a normalized recording
 * Looks for network-related actions or URLs in step data
 */
export function detectApiCallsFromRecording(
  recording: NormalizedRecording
): ApiCallInfo[] {
  const apiCalls: ApiCallInfo[] = [];

  for (const step of recording.steps) {
    // Look for URL in step metadata or value
    const potentialUrl =
      (step.metadata?.url as string | undefined) || step.value || step.selector;

    if (potentialUrl && isApiUrl(potentialUrl)) {
      const method = detectMethodFromUrl(potentialUrl);

      apiCalls.push({
        id: `recording-${step.id}`,
        method: method || "unknown",
        url: potentialUrl,
        isExternal: isExternalUrl(potentialUrl),
        source: "recording",
        recordingStepId: step.id,
      });
    }

    // Check for network-related actions in metadata
    if (step.metadata?.networkCall) {
      apiCalls.push({
        id: `recording-network-${step.id}`,
        method:
          (step.metadata.networkMethod as ApiCallInfo["method"]) || "unknown",
        url: step.metadata.networkUrl as string,
        isExternal: isExternalUrl(step.metadata.networkUrl as string),
        source: "recording",
        recordingStepId: step.id,
      });
    }
  }

  return apiCalls;
}

/**
 * Scan source code files for API calls
 */
export function detectApiCallsFromCodebase(
  files: { path: string; content: string }[]
): ApiCallInfo[] {
  const apiCalls: ApiCallInfo[] = [];

  for (const file of files) {
    const lines = file.content.split("\n");

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNumber = i + 1;

      // Check for fetch
      for (const pattern of API_PATTERNS.fetch) {
        if (pattern.test(line)) {
          const url = extractUrlFromLine(line, "fetch");
          apiCalls.push({
            id: `codebase-${file.path}-${lineNumber}`,
            method: "fetch",
            url,
            httpMethod: extractHttpMethod(line),
            isExternal: url ? isExternalUrl(url) : true,
            source: "codebase",
            codebaseLocation: { file: file.path, line: lineNumber },
          });
        }
      }

      // Check for XMLHttpRequest
      for (const pattern of API_PATTERNS.xmlHttpRequest) {
        if (pattern.test(line)) {
          apiCalls.push({
            id: `codebase-${file.path}-${lineNumber}`,
            method: "XMLHttpRequest",
            isExternal: true,
            source: "codebase",
            codebaseLocation: { file: file.path, line: lineNumber },
          });
        }
      }

      // Check for axios
      for (const pattern of API_PATTERNS.axios) {
        if (pattern.test(line)) {
          const url = extractUrlFromLine(line, "axios");
          apiCalls.push({
            id: `codebase-${file.path}-${lineNumber}`,
            method: "axios",
            httpMethod: extractAxiosMethod(line),
            url,
            isExternal: url ? isExternalUrl(url) : true,
            source: "codebase",
            codebaseLocation: { file: file.path, line: lineNumber },
          });
        }
      }
    }
  }

  return apiCalls;
}

/**
 * Main detection function - combines recording and codebase analysis
 */
export function detectApiCalls(
  recording?: NormalizedRecording,
  codebaseFiles?: { path: string; content: string }[]
): ApiCallInfo[] {
  const results: ApiCallInfo[] = [];

  // Detect from recording
  if (recording) {
    const recordingCalls = detectApiCallsFromRecording(recording);
    results.push(...recordingCalls);
  }

  // Detect from codebase
  if (codebaseFiles) {
    const codebaseCalls = detectApiCallsFromCodebase(codebaseFiles);
    results.push(...codebaseCalls);
  }

  // Deduplicate by URL
  const uniqueByUrl = new Map<string, ApiCallInfo>();
  for (const call of results) {
    if (call.url) {
      const key = `${call.method}:${call.url}`;
      if (!uniqueByUrl.has(key)) {
        uniqueByUrl.set(key, { ...call, source: "both" });
      }
    } else {
      uniqueByUrl.set(call.id, call);
    }
  }

  return Array.from(uniqueByUrl.values());
}

/**
 * Check if a string looks like an API URL
 */
function isApiUrl(str: string): boolean {
  if (!str || typeof str !== "string") return false;

  // Must be a URL-like string
  return API_ENDPOINT_PATTERNS.some((pattern) => pattern.test(str));
}

/**
 * Detect HTTP method from URL patterns
 */
function detectMethodFromUrl(url: string): ApiCallInfo["method"] {
  if (url.includes(".json")) return "fetch";
  if (url.includes("graphql")) return "fetch";
  if (url.includes("jsonp")) return "fetch-jsonp";
  return "fetch"; // Default to fetch for modern apps
}

/**
 * Check if URL is external (different origin)
 */
function isExternalUrl(url: string): boolean {
  if (!url) return true;

  return EXTERNAL_API_DOMAINS.some((domain) => url.includes(domain));
}

/**
 * Extract URL from a fetch/axios line
 */
function extractUrlFromLine(
  line: string,
  type: "fetch" | "axios"
): string | undefined {
  // Match quoted strings (single or double quotes, or backticks)
  const urlMatch = line.match(/['"`(](https?:\/\/[^'")`]+)['"`)]/);
  if (urlMatch) {
    return urlMatch[1];
  }

  // For dynamic URLs, try to find variable names
  const dynamicMatch = line.match(new RegExp(`${type}\\s*\\(\\s*(\\w+)`));
  if (dynamicMatch) {
    return `[dynamic - \${${dynamicMatch[1]}}]`;
  }

  return undefined;
}

/**
 * Extract HTTP method from fetch options
 */
function extractHttpMethod(line: string): string | undefined {
  const methodMatch = line.match(/method:\s*['"](\w+)['"]/i);
  return methodMatch ? methodMatch[1].toUpperCase() : undefined;
}

/**
 * Extract axios method (get, post, etc.)
 */
function extractAxiosMethod(line: string): string | undefined {
  const methodMatch = line.match(
    /axios\.(get|post|put|patch|delete|request)\s*\(/i
  );
  return methodMatch ? methodMatch[1].toUpperCase() : undefined;
}

/**
 * Filter API calls that need mocking (external only)
 */
export function filterMockableCalls(apiCalls: ApiCallInfo[]): ApiCallInfo[] {
  return apiCalls.filter((call) => call.isExternal);
}

/**
 * Group API calls by domain for organized mocking
 */
export function groupApiCallsByDomain(
  apiCalls: ApiCallInfo[]
): Map<string, ApiCallInfo[]> {
  const groups = new Map<string, ApiCallInfo[]>();

  for (const call of apiCalls) {
    if (!call.url) {
      const unknown = "unknown";
      const existing = groups.get(unknown) || [];
      groups.set(unknown, [...existing, call]);
      continue;
    }

    try {
      const url = new URL(call.url);
      const domain = url.hostname;
      const existing = groups.get(domain) || [];
      groups.set(domain, [...existing, call]);
    } catch {
      const existing = groups.get("unknown") || [];
      groups.set("unknown", [...existing, call]);
    }
  }

  return groups;
}
