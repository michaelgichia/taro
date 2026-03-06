import { Browser, Page, chromium } from 'playwright';

/**
 * Element information extracted from the DOM
 */
export interface ElementInfo {
  tagName: string;
  textContent: string;
  ariaRole?: string;
  ariaLabel?: string;
  nameAttr?: string;
  id: string;
  classes: string[];
  isVisible: boolean;
  isDisabled: boolean;
}

/**
 * Launches a headless Chromium browser
 * @returns Promise<Browser> - The launched browser instance
 * @throws Error if Playwright is not installed
 */
export async function launchBrowser(): Promise<Browser> {
  try {
    const browser = await chromium.launch({
      headless: true,
    });
    return browser;
  } catch (error) {
    throw new Error(
      'Playwright browser not available. Install with: npx playwright install chromium'
    );
  }
}

/**
 * Captures a screenshot of the current page
 * @param page - The Playwright page object
 * @param path - The file path to save the screenshot
 */
export async function captureScreenshot(page: Page, path: string): Promise<void> {
  await page.screenshot({
    path,
    fullPage: true,
  });
}

/**
 * Inspects an element by selector and extracts accessibility properties
 * @param page - The Playwright page object
 * @param selector - CSS selector for the element
 * @returns Promise<ElementInfo | null> - Element info or null if not found
 */
export async function inspectElement(
  page: Page,
  selector: string
): Promise<ElementInfo | null> {
  try {
    const element = await page.$(selector);
    
    if (!element) {
      return null;
    }

    // Extract element properties
    const elementInfo = await element.evaluate((el: Element) => {
      const computedStyle = window.getComputedStyle(el);
      const isVisible = computedStyle.display !== 'none' && 
                        computedStyle.visibility !== 'hidden' && 
                        computedStyle.opacity !== '0';
      
      return {
        tagName: el.tagName.toLowerCase(),
        textContent: el.textContent?.trim() || '',
        ariaRole: el.getAttribute('role') || undefined,
        ariaLabel: el.getAttribute('aria-label') || undefined,
        nameAttr: el.getAttribute('name') || undefined,
        id: el.id || '',
        classes: el.className ? Array.from(el.classList) : [],
        isVisible,
        isDisabled: (el as HTMLOrSVGElement & { disabled?: boolean }).disabled || false,
      };
    });

    return elementInfo;
  } catch (error) {
    // Element not found - return null as per spec
    return null;
  }
}

/**
 * Navigates to a URL with timeout handling
 * @param page - The Playwright page object
 * @param url - The URL to navigate to
 * @param timeout - Timeout in milliseconds (default 30000)
 * @returns Promise<boolean> - True if navigation succeeded
 */
export async function navigateToUrl(
  page: Page,
  url: string,
  timeout: number = 30000
): Promise<boolean> {
  try {
    await page.goto(url, { timeout, waitUntil: 'domcontentloaded' });
    return true;
  } catch (error) {
    throw new Error(
      `Failed to load URL "${url}" after ${timeout}ms. ` +
      'Ensure the app is running and the URL is correct.'
    );
  }
}

/**
 * Gets accessibility tree for the page
 * @param page - The Playwright page object
 * @returns Promise<string> - Accessibility tree snapshot
 */
export async function getAccessibilityTree(page: Page): Promise<string> {
  const snapshot = await page.accessibility.snapshot();
  return JSON.stringify(snapshot, null, 2);
}
