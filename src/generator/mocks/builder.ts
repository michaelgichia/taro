/**
 * Mock Code Builder - Generates valid mock code for tests
 *
 * Takes mock targets and generates appropriate mock code based on the
 * selected mock library (MSW, jest.fn, sinon, etc.)
 */

import type { MockTarget } from "../../analyzer/mocks/target-analyzer.js";

/**
 * Decision about how to generate the mock
 */
export interface MockDecision {
  /** The mock target this decision applies to */
  target: MockTarget;
  /** The generated mock code */
  code: string;
  /** Whether this should be an inline or file mock */
  isInline: boolean;
  /** Import statements needed */
  imports: string[];
  /** Any setup required before using the mock */
  setupCode?: string;
  /** Cleanup code required */
  teardownCode?: string;
}

/**
 * Sample response data for common API patterns
 */
const SAMPLE_RESPONSES: Record<string, unknown> = {
  // Generic success
  success: { ok: true, message: "Success" },
  // JSON API
  json: { data: {}, meta: { page: 1, total: 0 } },
  // User data
  user: { id: "1", email: "user@example.com", name: "Test User" },
  // List data
  list: { items: [], total: 0, page: 1, pageSize: 10 },
  // Error
  error: { error: { code: "UNKNOWN", message: "An error occurred" } },
};

/**
 * Generate mock code for MSW (Mock Service Worker)
 */
function buildMswMock(target: MockTarget): MockDecision {
  const imports: string[] = ["http", "HttpResponse"];
  const method = target.method.toLowerCase();

  // Determine response type based on URL
  const responseType = inferResponseType(target.url);
  const sampleResponse =
    SAMPLE_RESPONSES[responseType] || SAMPLE_RESPONSES.json;

  let handlerCode = "";

  switch (method) {
    case "get":
      handlerCode = `http.get('${target.url}', () => {
  return HttpResponse.json(${JSON.stringify(sampleResponse, null, 2)});
})`;
      break;
    case "post":
      handlerCode = `http.post('${target.url}', () => {
  return HttpResponse.json(${JSON.stringify(sampleResponse, null, 2)}, { status: 201 });
})`;
      break;
    case "put":
    case "patch":
      handlerCode = `http.${method}('${target.url}', () => {
  return HttpResponse.json(${JSON.stringify(sampleResponse, null, 2)});
})`;
      break;
    case "delete":
      handlerCode = `http.delete('${target.url}', () => {
  return HttpResponse.json({ ok: true });
})`;
      break;
    default:
      handlerCode = `http.all('${target.url}', () => {
  return HttpResponse.json(${JSON.stringify(sampleResponse, null, 2)});
})`;
  }

  return {
    target,
    code: handlerCode,
    isInline: target.extractionRecommendation === "inline",
    imports,
    setupCode: `// Add handlers to server in your test setup
// const server = setupServer(...handlers);`,
    teardownCode: `// server.close(); // In afterAll hook`,
  };
}

/**
 * Generate mock code for jest.fn()
 */
function buildJestFnMock(target: MockTarget): MockDecision {
  const responseType = inferResponseType(target.url);
  const sampleResponse =
    SAMPLE_RESPONSES[responseType] || SAMPLE_RESPONSES.json;

  let mockCode = "";
  let setupCode = "";

  if (target.method === "GET") {
    mockCode = `jest.fn().mockResolvedValue(${JSON.stringify(sampleResponse, null, 2)})`;
    setupCode = `global.fetch = ${mockCode};`;
  } else if (
    target.method === "POST" ||
    target.method === "PUT" ||
    target.method === "PATCH"
  ) {
    mockCode = `jest.fn().mockResolvedValue(${JSON.stringify(sampleResponse, null, 2)})`;
    setupCode = `global.fetch = ${mockCode};`;
  } else if (target.method === "DELETE") {
    mockCode = `jest.fn().mockResolvedValue({ ok: true })`;
    setupCode = `global.fetch = ${mockCode};`;
  } else {
    mockCode = `jest.fn().mockResolvedValue(${JSON.stringify(sampleResponse, null, 2)})`;
    setupCode = `global.fetch = ${mockCode};`;
  }

  return {
    target,
    code: mockCode,
    isInline: true,
    imports: [],
    setupCode,
    teardownCode: `global.fetch = jest.fn(); // Restore in afterEach`,
  };
}

/**
 * Generate mock code for sinon
 */
function buildSinonMock(target: MockTarget): MockDecision {
  const responseType = inferResponseType(target.url);
  const sampleResponse =
    SAMPLE_RESPONSES[responseType] || SAMPLE_RESPONSES.json;

  const mockCode = `sinon.stub().resolves(${JSON.stringify(sampleResponse, null, 2)})`;

  return {
    target,
    code: mockCode,
    isInline: true,
    imports: ["sinon"],
    setupCode: `// In beforeEach:
const fetchStub = ${mockCode};
sinon.stub(global, 'fetch').returns(fetchStub);`,
    teardownCode: `// In afterEach:
sinon.restore();`,
  };
}

/**
 * Generate mock code for fetch-mock
 */
function buildFetchMockMock(target: MockTarget): MockDecision {
  const responseType = inferResponseType(target.url);
  const sampleResponse =
    SAMPLE_RESPONSES[responseType] || SAMPLE_RESPONSES.json;

  const mockCode = `fetchMock.${target.method.toLowerCase()}('${target.url}', ${JSON.stringify(sampleResponse, null, 2)})`;

  return {
    target,
    code: mockCode,
    isInline: false,
    imports: ["fetch-mock"],
    setupCode: `fetchMock.restore(); // Reset before each test
${mockCode};`,
    teardownCode: `fetchMock.restore(); // After each test`,
  };
}

/**
 * Generate mock code for nock
 */
function buildNockMock(target: MockTarget): MockDecision {
  const responseType = inferResponseType(target.url);
  const sampleResponse =
    SAMPLE_RESPONSES[responseType] || SAMPLE_RESPONSES.json;

  const mockCode = `nock('${getBaseUrl(target.url)}')
  .${target.method.toLowerCase()}('${getPath(target.url)}')
  .reply(200, ${JSON.stringify(sampleResponse, null, 2)})`;

  return {
    target,
    code: mockCode,
    isInline: false,
    imports: ["nock"],
    setupCode: `// Before tests:
const scope = ${mockCode};`,
    teardownCode: `// After tests:
nock.cleanAll();`,
  };
}

/**
 * Generate mock code for undici MockAgent
 */
function buildUndiciMock(target: MockTarget): MockDecision {
  const responseType = inferResponseType(target.url);
  const sampleResponse =
    SAMPLE_RESPONSES[responseType] || SAMPLE_RESPONSES.json;

  const mockCode = `const mockAgent = new MockAgent();
mockAgent.disableNetConnect();
const pool = mockAgent.get('${getBaseUrl(target.url)}');
pool.intercept({
  method: '${target.method}',
  path: '${getPath(target.url)}',
}).reply(200, ${JSON.stringify(sampleResponse, null, 2)});`;

  return {
    target,
    code: mockCode,
    isInline: false,
    imports: ["undici"],
    setupCode: mockCode,
    teardownCode: `await mockAgent.close();`,
  };
}

/**
 * Infer the response type from URL patterns
 */
function inferResponseType(url: string): string {
  const lowerUrl = url.toLowerCase();

  if (lowerUrl.includes("/user") || lowerUrl.includes("/profile")) {
    return "user";
  }
  if (
    lowerUrl.includes("/list") ||
    lowerUrl.includes("/all") ||
    lowerUrl.includes("/search")
  ) {
    return "list";
  }
  if (lowerUrl.includes("/error") || lowerUrl.includes("/fail")) {
    return "error";
  }
  if (lowerUrl.includes("/api")) {
    return "json";
  }

  return "success";
}

/**
 * Extract base URL from full URL
 */
function getBaseUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.origin;
  } catch {
    return "http://localhost:3000";
  }
}

/**
 * Extract path from URL
 */
function getPath(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.pathname;
  } catch {
    return url;
  }
}

/**
 * Main function to build mock code from a mock target
 */
export function buildMock(target: MockTarget): MockDecision {
  switch (target.mockLibrary) {
    case "msw":
      return buildMswMock(target);
    case "jest.fn":
      return buildJestFnMock(target);
    case "sinon":
      return buildSinonMock(target);
    case "fetch-mock":
      return buildFetchMockMock(target);
    case "nock":
      return buildNockMock(target);
    case "undici":
      return buildUndiciMock(target);
    default:
      // Default to jest.fn
      return buildJestFnMock(target);
  }
}

/**
 * Build mocks for multiple targets
 */
export function buildMocks(
  targets: MockTarget[]
): MockDecision[] {
  return targets.map((target) => buildMock(target));
}

/**
 * Generate complete mock file content
 */
export function generateMockFile(
  decisions: MockDecision[]
): string {
  const allImports = new Set<string>();
  const allSetupCode: string[] = [];
  const allTeardownCode: string[] = [];
  const mockExports: string[] = [];

  // Collect imports and code from all decisions
  for (const decision of decisions) {
    decision.imports.forEach((i) => allImports.add(i));
    if (decision.setupCode) {
      allSetupCode.push(`// ${decision.target.url}\n${decision.setupCode}`);
    }
    if (decision.teardownCode) {
      allTeardownCode.push(
        `// ${decision.target.url}\n${decision.teardownCode}`
      );
    }
    if (!decision.isInline) {
      mockExports.push(decision.code);
    }
  }

  // Build the file content
  let content = "";

  // Imports
  if (allImports.size > 0) {
    content += `import { ${Array.from(allImports).join(", ")} } from 'msw';\n`;
  }

  if (mockExports.length > 0) {
    content += "\n// API handlers\n";
    content += mockExports.join("\n\n");
  }

  // Setup function
  content += "\n\n";
  content += `export function setupMocks() {\n`;
  content += allSetupCode.join("\n\n");
  content += "\n}";

  // Teardown function
  content += "\n\n";
  content += `export function teardownMocks() {\n`;
  content += allTeardownCode.join("\n\n");
  content += "\n}";

  // For vitest, add auto-setup via beforeAll/afterAll
  if (framework === "vitest") {
    content += "\n\n";
    content += `// Vitest hooks (optional - use if not calling setupMocks manually)\n`;
    content += `beforeAll(() => setupMocks());\n`;
    content += `afterAll(() => teardownMocks());`;
  }

  return content;
}

/**
 * Generate inline mock code for a single test
 */
export function generateInlineMock(
  decision: MockDecision
): string {
  let code = "";

  // Add imports if inline
  if (decision.imports.length > 0) {
    code += `import { ${decision.imports.join(", ")} } from '${decision.target.mockLibrary === "msw" ? "msw" : decision.target.mockLibrary}';\n\n`;
  }

  // Setup code
  if (decision.setupCode) {
    code += `// Setup mock for ${decision.target.url}\n`;
    code += decision.setupCode;
    code += "\n\n";
  }

  // Teardown hint
  if (decision.teardownCode) {
    code += `// Cleanup after test\n`;
    code += decision.teardownCode;
  }

  return code.trim();
}
