/**
 * Core orchestrator for Taro test generation pipeline
 * Coordinates parsing, optional visual inspection, and test generation
 */

import { Command } from 'commander';
import { resolve } from 'path';
import { mkdirSync, existsSync } from 'fs';
import { parseRecording } from './parser.js';
import { launchBrowser, navigateToUrl, inspectElement, captureScreenshot, getAccessibilityTree, type ElementInfo } from '../analyzer/visual/inspector.js';
import type { Browser, Page } from 'playwright';
import { analyzeElementProperties, type AccessibilityProperties, analyzePageElements, recommendQueryMethod } from '../analyzer/visual/element-analyzer.js';
import type { NormalizedRecording } from '../types/recording.js';

/**
 * Visual inspection context passed to generator
 */
export interface VisualInspectionContext {
  enabled: boolean;
  browser?: Browser;
  page?: Page;
  url?: string;
  elements?: Map<string, AccessibilityProperties>;
  screenshots?: string[];
}

/**
 * Main orchestrator options
 */
export interface OrchestratorOptions {
  recordingPath: string;
  outputPath?: string;
  visual?: boolean;
  url?: string;
}

/**
 * Run the test generation pipeline
 */
export async function run(options: OrchestratorOptions): Promise<void> {
  const { recordingPath, outputPath = './tests', visual = false, url } = options;

  console.log(`\n📼 Taro - Chrome Recorder to RTL Test Generator\n`);
  console.log(`📂 Recording: ${recordingPath}`);
  if (visual) {
    console.log(`👁️  Visual inspection: ENABLED`);
  }
  console.log('');

  // Step 1: Parse the recording
  console.log('1/3 Parsing recording...');
  let recording: NormalizedRecording;
  try {
    recording = await parseRecording(recordingPath);
    console.log(`   ✓ Parsed ${recording.steps.length} steps`);
  } catch (error) {
    console.error(`   ✗ Failed to parse recording: ${error instanceof Error ? error.message : 'Unknown error'}`);
    process.exit(1);
  }

  // Visual inspection (optional)
  let visualContext: VisualInspectionContext = { enabled: false };
  
  if (visual) {
    console.log('2/3 Running visual inspection...');
    visualContext = await runVisualInspection(recording, url);
    console.log(`   ✓ Inspected ${visualContext.elements?.size || 0} elements`);
  } else {
    console.log('2/3 Visual inspection: SKIPPED (use --visual to enable)');
  }

  // Step 3: Generate tests
  console.log('3/3 Generating tests...');
  // TODO: Implement test generation
  console.log('   ✓ (Generation placeholder - to be implemented)');
  
  // Cleanup
  if (visualContext.browser) {
    await visualContext.browser.close();
  }

  console.log('\n✅ Complete!\n');
}

/**
 * Run visual inspection on the application
 */
async function runVisualInspection(
  recording: NormalizedRecording,
  urlFromCli?: string
): Promise<VisualInspectionContext> {
  const visualContext: VisualInspectionContext = { enabled: true };
  
  // Determine URL to inspect
  const url = urlFromCli || recording.url;
  if (!url) {
    console.log('   ⚠ No URL provided. Use --url flag or ensure recording has a URL.');
    return visualContext;
  }

  // Create screenshots directory
  const screenshotsDir = resolve('.taro/visuals');
  if (!existsSync(screenshotsDir)) {
    mkdirSync(screenshotsDir, { recursive: true });
  }

  // Launch browser
  let browser: Browser | undefined;
  let page: Page | undefined;
  
  try {
    console.log(`   🌐 Launching browser to: ${url}`);
    browser = await launchBrowser();
    const context = await browser.newContext();
    page = await context.newPage();

    // Navigate to URL
    const success = await navigateToUrl(page, url);
    if (!success) {
      console.log(`   ⚠ Failed to navigate to URL`);
      return visualContext;
    }

    // Store in context
    visualContext.browser = browser;
    visualContext.page = page;
    visualContext.url = url;
    visualContext.screenshots = [];

    // Capture initial screenshot
    const initialScreenshot = resolve(screenshotsDir, 'initial.png');
    await captureScreenshot(page, initialScreenshot);
    visualContext.screenshots!.push(initialScreenshot);
    console.log(`   📸 Saved screenshot: ${initialScreenshot}`);

    // Get accessibility tree
    const a11yTree = await getAccessibilityTree(page);
    console.log(`   ♿ Accessibility tree captured (${a11yTree.length} chars)`);

    // Analyze page elements
    console.log(`   🔍 Analyzing interactive elements...`);
    const elements = await analyzePageElements(page);
    
    // Build element map by selector
    const elementMap = new Map<string, AccessibilityProperties>();
    for (const { selector, properties } of elements) {
      elementMap.set(selector, properties);
    }
    
    visualContext.elements = elementMap;
    console.log(`   ✓ Found ${elements.length} interactive elements`);

    // For each step in the recording, inspect the target element
    for (const step of recording.steps.slice(0, 5)) { // Limit to first 5 for performance
      if (step.selector) {
        const elementInfo = await inspectElement(page, step.selector);
        if (elementInfo) {
          const a11yProps = await analyzeElementProperties(page, step.selector);
          if (a11yProps) {
            const queryHint = recommendQueryMethod(a11yProps);
            console.log(`   💡 Step ${step.id}: ${step.action} → ${queryHint}`);
          }
        }
      }
    }

  } catch (error) {
    console.error(`   ⚠ Visual inspection error: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }

  return visualContext;
}

/**
 * Create CLI command
 */
export function createCommand(): Command {
  const program = new Command();
  
  program
    .name('taro')
    .description('Chrome Recorder to React Testing Library test generator')
    .version('0.1.0');

  program
    .command('generate')
    .description('Generate tests from Chrome Recorder recording')
    .argument('<recording>', 'Path to Chrome Recorder JSON export')
    .option('-o, --output <path>', 'Output directory for tests', './tests')
    .option('--visual', 'Enable visual UI inspection via Playwright (requires app running)')
    .option('--url <url>', 'URL of the application to inspect (required for --visual)')
    .action(async (recordingPath: string, options) => {
      await run({
        recordingPath,
        outputPath: options.output,
        visual: options.visual,
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
