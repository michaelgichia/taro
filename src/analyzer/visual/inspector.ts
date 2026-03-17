import { type Page } from 'playwright';

/**
 * Element information extracted from the DOM
 */
interface ElementInfo {
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
      
      // Handle className (can be string or SVGAnimatedString)
      let classes: string[] = [];
      const className = el.className;
      if (typeof className === 'string') {
        classes = className.split(' ').filter(c => c.trim().length > 0);
      } else if (className && typeof className === 'object' && 'baseVal' in className) {
        classes = (className as SVGAnimatedString).baseVal.split(' ').filter(c => c.trim().length > 0);
      }
      
      // Check if element is disabled
      let isDisabled = false;
      const htmlEl = el as unknown as { disabled?: boolean; tagName: string };
      if (htmlEl.disabled !== undefined && (htmlEl.tagName === 'INPUT' || htmlEl.tagName === 'BUTTON' || htmlEl.tagName === 'SELECT' || htmlEl.tagName === 'TEXTAREA')) {
        isDisabled = Boolean(htmlEl.disabled);
      }
      
      return {
        tagName: el.tagName.toLowerCase(),
        textContent: el.textContent?.trim() || '',
        ariaRole: el.getAttribute('role') || undefined,
        ariaLabel: el.getAttribute('aria-label') || undefined,
        nameAttr: el.getAttribute('name') || undefined,
        id: el.id || '',
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
