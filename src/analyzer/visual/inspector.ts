import { chromium, type Browser, type Page } from "playwright";

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
 * Launches a local Playwright browser for runtime visual inspection.
 */
export async function launchBrowser(): Promise<Browser> {
  return chromium.launch({ headless: true });
}

/**
 * Captures a screenshot of the current page
 * @param page - The Playwright page object
 * @param path - The file path to save the screenshot
 */
export async function captureScreenshot(
  page: Page,
  path: string
): Promise<void> {
  await page.screenshot({ path, fullPage: true });
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
      const isVisible =
        computedStyle.display !== "none" &&
        computedStyle.visibility !== "hidden" &&
        computedStyle.opacity !== "0";

      // Handle className (can be string or SVGAnimatedString)
      let classes: string[] = [];
      const className = el.className;
      if (typeof className === "string") {
        classes = className.split(" ").filter((c) => c.trim().length > 0);
      } else if (
        className &&
        typeof className === "object" &&
        "baseVal" in className
      ) {
        classes = (className as SVGAnimatedString).baseVal
          .split(" ")
          .filter((c) => c.trim().length > 0);
      }

      // Check if element is disabled
      let isDisabled = false;
      const htmlEl = el as unknown as { disabled?: boolean; tagName: string };
      if (
        htmlEl.disabled !== undefined &&
        (htmlEl.tagName === "INPUT" ||
          htmlEl.tagName === "BUTTON" ||
          htmlEl.tagName === "SELECT" ||
          htmlEl.tagName === "TEXTAREA")
      ) {
        isDisabled = Boolean(htmlEl.disabled);
      }

      return {
        tagName: el.tagName.toLowerCase(),
        textContent: el.textContent?.trim() || "",
        ariaRole: el.getAttribute("role") || undefined,
        ariaLabel: el.getAttribute("aria-label") || undefined,
        nameAttr: el.getAttribute("name") || undefined,
        id: el.id || "",
        classes,
        isVisible,
        isDisabled,
      };
    });

    return elementInfo;
  } catch {
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
    await page.goto(url, { timeout, waitUntil: "domcontentloaded" });
    return true;
  } catch {
    throw new Error(
      `Failed to load URL "${url}" after ${timeout}ms. ` +
        "Ensure the app is running and the URL is correct."
    );
  }
}

/**
 * Gets accessibility tree for the page
 * @param page - The Playwright page object
 * @returns Promise<string> - Accessibility tree snapshot
 */
export async function getAccessibilityTree(page: Page): Promise<string> {
  // Use Playwright's accessibility API
  // @ts-expect-error - Playwright accessibility is available on CDPPage
  const snapshot = await page.accessibility.snapshot();
  return JSON.stringify(snapshot, null, 2);
}
