/**
 * Core orchestrator for Taro test generation pipeline
 * Coordinates parsing, optional visual inspection, and test generation
 */

import { Command } from "commander";
import { resolve } from "path";
import { mkdirSync, existsSync, readFileSync, writeFileSync } from "fs";
import { parseRecording } from "./parser.js";
import type { AccessibilityProperties } from "../analyzer/visual/element-analyzer.js";
import type { NormalizedRecording } from "../types/recording.js";
import {
  detectApiCalls,
  groupApiCallsByDomain,
  type ApiCallInfo,
} from "../analyzer/mocks/detector.js";
import {
  analyzeMockTargets,
  type MockTarget,
} from "../analyzer/mocks/target-analyzer.js";
import {
  buildMocks,
  type MockDecision,
} from "../generator/mocks/builder.js";
import {
  preWriteAudit,
  postWriteVerification,
  scoreTest,
} from "../scorer/index.js";
import { learnConventions, getConventions } from "../learner/index.js";

/**
 * Visual inspection context passed to generator
 */
export interface VisualInspectionContext {
  enabled: boolean;
  url?: string;
  elements?: Map<string, AccessibilityProperties>;
  screenshots?: string[];
}

/**
 * Mock inspection context passed to generator
 */
export interface MockInspectionContext {
  enabled: boolean;
  apiCalls?: ApiCallInfo[];
  mockTargets?: MockTarget[];
  mockDecisions?: MockDecision[];
}

/**
 * Main orchestrator options
 */
export interface OrchestratorOptions {
  recordingPath: string;
  outputPath?: string;
  visual?: boolean;
  mocks?: boolean;
  url?: string;
}

/**
 * Run the test generation pipeline
 */
export async function run(options: OrchestratorOptions): Promise<void> {
  const {
    recordingPath,
    outputPath = "./tests",
    visual = false,
    mocks = true,
    url,
  } = options;

  console.log(`\n📼 Taro - Chrome Recorder to RTL Test Generator\n`);
  console.log(`📂 Recording: ${recordingPath}`);
  if (visual) {
    console.log(`👁️  Visual inspection: ENABLED`);
  }
  if (mocks) {
    console.log(`🎭 Mock detection: ENABLED`);
  }
  console.log("");

  // Step 1: Parse the recording
  console.log("1/4 Parsing recording...");
  let recording: NormalizedRecording;
  try {
    recording = await parseRecording(recordingPath);
    console.log(`   ✓ Parsed ${recording.steps.length} steps`);
  } catch (error) {
    console.error(
      `   ✗ Failed to parse recording: ${error instanceof Error ? error.message : "Unknown error"}`
    );
    process.exit(1);
  }

  // Step 2: Detect API calls for mocking (optional)
  let mockContext: MockInspectionContext = { enabled: false };

  if (mocks) {
    console.log("2/4 Detecting API calls for mocking...");
    mockContext = await runMockDetection(recording, outputPath);
    console.log(`   ✓ Detected ${mockContext.apiCalls?.length || 0} API calls`);
  } else {
    console.log("2/4 Mock detection: DISABLED (use --mocks to enable)");
  }

  // Visual inspection (optional)
  let visualContext: VisualInspectionContext = { enabled: false };

  if (visual) {
    console.log("3/4 Running visual inspection...");
    visualContext = await runVisualInspection(recording, url);
    console.log(`   ✓ Inspected ${visualContext.elements?.size || 0} elements`);
  } else {
    console.log("3/4 Visual inspection: SKIPPED (use --visual to enable)");
  }

  // Step 4: Generate tests with scoring and verification
  console.log("4/4 Generating tests with quality gates...");

  // 4a: Get existing conventions (if any)
  const conventions = getConventions(process.cwd());
  if (conventions) {
    console.log("   ✓ Loaded existing conventions from storage");
  } else {
    console.log(
      "   ℹ No existing conventions found (will learn from generated tests)"
    );
  }

  // 4b: Generate test code (placeholder for now)
  const testCode = generatePlaceholderTest(recording);

  // 4c: Score the test to give user visibility
  console.log("   📊 Scoring test quality...");
  const scoring = scoreTest(testCode);
  console.log(`   Quality Score: ${scoring.score.overall}/100`);
  console.log(`      Structure: ${scoring.score.criteria.structure}/100`);
  console.log(`      Queries: ${scoring.score.criteria.queries}/100`);
  console.log(`      Matchers: ${scoring.score.criteria.matchers}/100`);
  console.log(`      Robustness: ${scoring.score.criteria.noFragility}/100`);

  if (scoring.score.issues.length > 0) {
    console.log(`   Issues found: ${scoring.score.issues.length}`);
    for (const issue of scoring.score.issues.slice(0, 3)) {
      console.log(`      [${issue.severity}] ${issue.message}`);
    }
  }

  // 4d: Pre-write audit - validate before writing
  console.log("   🔍 Running pre-write audit...");
  const audit = preWriteAudit(testCode);

  if (!audit.valid) {
    console.log("   ✗ Pre-write audit failed:");
    for (const issue of audit.blocking) {
      console.log(`      - ${issue}`);
    }
    console.log("   ⚠ File not written due to blocking issues");
  } else {
    console.log("   ✓ Pre-write audit passed");

    // 4d: Write the test file
    const outputFile = resolve(outputPath, "generated.test.ts");
    // Ensure output directory exists
    if (!existsSync(outputPath)) {
      mkdirSync(outputPath, { recursive: true });
    }
    // Write the test file to disk
    writeFileSync(outputFile, testCode);
    console.log(`   ✓ Written: ${outputFile}`);

    // 4e: Post-write verification
    console.log("   🔍 Running post-write verification...");
    const verification = postWriteVerification(outputFile);
    if (verification.valid) {
      console.log("   ✓ Post-write verification passed");
    } else {
      console.log("   ⚠ Post-write verification found issues:");
      for (const error of verification.errors) {
        console.log(`      - ${error}`);
      }
    }

    // 4f: Learn from generated test for future runs
    console.log("   📚 Learning conventions from generated test...");
    try {
      learnConventions(process.cwd());
      console.log(`   ✓ Convention learning complete`);
    } catch (error) {
      console.log(
        `   ⚠ Convention learning skipped: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  }

  console.log("\n✅ Complete!\n");
}

/**
 * Run visual inspection on the application
 */
async function runVisualInspection(
  recording: NormalizedRecording,
  urlFromCli?: string
): Promise<VisualInspectionContext> {
  const visualContext: VisualInspectionContext = {
    enabled: true,
    elements: new Map(),
    screenshots: [],
  };

  // Determine URL to inspect
  const url = urlFromCli || recording.url;
  if (!url) {
    console.log(
      "   ⚠ No URL provided. Use --url flag or ensure recording has a URL."
    );
    return visualContext;
  }

  console.log(`   🌐 Visual inspection requested for: ${url}`);
  console.log(
    "   ℹ Visual inspection will launch a local Playwright browser when screenshot capture is enabled."
  );
  visualContext.url = url;

  return visualContext;
}

/**
 * Run mock detection on the recording and codebase
 */
async function runMockDetection(
  recording: NormalizedRecording,
  outputPath: string
): Promise<MockInspectionContext> {
  const mockContext: MockInspectionContext = { enabled: true };

  try {
    // Step 1: Detect API calls from recording
    const apiCalls = detectApiCalls(recording);
    mockContext.apiCalls = apiCalls;

    if (apiCalls.length === 0) {
      console.log("   ℹ No API calls detected in recording");
      return mockContext;
    }

    // Log detected API calls grouped by domain
    const grouped = groupApiCallsByDomain(apiCalls);
    console.log(`   📡 Found API calls to ${grouped.size} domain(s):`);
    for (const [domain, calls] of grouped) {
      console.log(`      - ${domain}: ${calls.length} call(s)`);
    }

    // Step 2: Try to load package.json for mock library detection
    let packageJson: Record<string, unknown> = {};
    try {
      const packagePath = resolve(process.cwd(), "package.json");
      if (existsSync(packagePath)) {
        packageJson = JSON.parse(readFileSync(packagePath, "utf-8"));
      }
    } catch {
      // Ignore - package.json not required
    }

    // Step 3: Analyze mock targets
    const mockTargets = analyzeMockTargets(apiCalls, {
      packageJson,
      config: { sharedMocksDir: resolve(outputPath, "__mocks__") },
    });
    mockContext.mockTargets = mockTargets;

    console.log(`   🎯 Mock targets identified: ${mockTargets.length}`);
    for (const target of mockTargets) {
      console.log(`      - ${target.method} ${target.url}`);
      console.log(
        `        → ${target.mockLibrary} (${target.extractionRecommendation})`
      );
    }

    // Step 4: Generate mock code
    const mockDecisions = buildMocks(mockTargets);
    mockContext.mockDecisions = mockDecisions;

    // Log summary
    const inline = mockDecisions.filter((d) => d.isInline).length;
    const extracted = mockDecisions.filter((d) => !d.isInline).length;
    console.log(
      `   ✓ Generated ${inline} inline, ${extracted} extracted mocks`
    );
  } catch (error) {
    console.error(
      `   ⚠ Mock detection error: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }

  return mockContext;
}

/**
 * Generate a placeholder test (for integration testing)
 */
function generatePlaceholderTest(recording: NormalizedRecording): string {
  // Placeholder test generation - actual generation would use mockContext and visualContext
  const testName = recording.title || "Generated Test";

  return `import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

describe('${testName}', () => {
  it('should render component', () => {
    // TODO: Generate actual test from recording
    expect(true).toBe(true);
  });
});
`;
}

/**
 * Create CLI command
 */
export function createCommand(): Command {
  const program = new Command();

  program
    .name("taro")
    .description("Chrome Recorder to React Testing Library test generator")
    .version("0.1.0");

  program
    .command("generate")
    .description("Generate tests from Chrome Recorder recording")
    .argument("<recording>", "Path to Chrome Recorder JSON export")
    .option("-o, --output <path>", "Output directory for tests", "./tests")
    .option(
      "--visual",
      "Enable visual UI inspection via Playwright (requires app running)"
    )
    .option("--no-mocks", "Disable API call detection and mock generation")
    .option(
      "--url <url>",
      "URL of the application to inspect (required for --visual)"
    )
    .action(async (recordingPath: string, options) => {
      await run({
        recordingPath,
        outputPath: options.output,
        visual: options.visual,
        mocks: options.mocks,
        url: options.url,
      });
    });

  return program;
}

// Main entry point
if (import.meta.url === `file://${process.argv[1]}`) {
  const program = createCommand();
  program.parse();
}
