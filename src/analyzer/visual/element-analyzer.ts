import { Page } from "playwright";

import { inspectElement } from "#analyzer/visual/inspector.ts";

/**
 * Query strategy for Testing Library
 */
export interface QueryStrategy {
  method: string;
  args: (string | RegExp | { name?: string; exact?: boolean })[];
  priority: number; // 1 = best
}

/**
 * Accessibility properties extracted from an element
 */
export interface AccessibilityProperties {
  preferredQuery: QueryStrategy;
  alternatives: QueryStrategy[];
  hasAccessibleName: boolean;
  isInteractive: boolean;
}

/**
 * Analyzes an element's accessibility properties and suggests optimal Testing Library queries
 * @param page - The Playwright page object
 * @param selector - CSS selector for the element
 * @returns Promise<AccessibilityProperties> - Analysis results with ranked query strategies
 */
export async function analyzeElementProperties(
  page: Page,
  selector: string
): Promise<AccessibilityProperties | null> {
  const elementInfo = await inspectElement(page, selector);

  if (!elementInfo) {
    return null;
  }

  const strategies: QueryStrategy[] = [];
  const tagName = elementInfo.tagName.toLowerCase();

  // Determine if element is interactive
  const interactiveRoles = [
    "button",
    "link",
    "menuitem",
    "checkbox",
    "radio",
    "switch",
    "textbox",
    "searchbox",
    "combobox",
    "slider",
    "spinbutton",
  ];
  const isInteractive =
    interactiveRoles.includes(elementInfo.ariaRole || "") ||
    ["button", "a", "input", "select", "textarea"].includes(tagName);

  // 1. getByRole + name (most robust)
  if (elementInfo.ariaRole && elementInfo.textContent) {
    strategies.push({
      method: "getByRole",
      args: [elementInfo.ariaRole, { name: elementInfo.textContent }] as [
        string,
        { name: string },
      ],
      priority: 1,
    });
  }

  // 2. getByLabelText (form fields)
  const labelFor = await page
    .$eval(selector, (el) => {
      const htmlEl = el as HTMLElement;
      if (htmlEl.id) {
        const label = document.querySelector(`label[for="${htmlEl.id}"]`);
        return label?.textContent?.trim() || null;
      }
      // Check parent label
      const parentLabel = htmlEl.closest("label");
      return parentLabel?.textContent?.trim() || null;
    })
    .catch(() => null);

  if (labelFor) {
    strategies.push({
      method: "getByLabelText",
      args: [labelFor],
      priority: 2,
    });
  }

  // Also check for aria-label
  if (elementInfo.ariaLabel) {
    strategies.push({
      method: "getByLabelText",
      args: [elementInfo.ariaLabel],
      priority: 2,
    });
  }

  // 3. getByPlaceholderText
  const placeholder = await page
    .$eval(selector, (el) => {
      return (el as HTMLInputElement).placeholder || "";
    })
    .catch(() => "");

  if (placeholder) {
    strategies.push({
      method: "getByPlaceholderText",
      args: [placeholder, { exact: true }],
      priority: 3,
    });
  }

  // 4. getByAltText (images)
  if (tagName === "img") {
    const altText = await page
      .$eval(selector, (el) => {
        return (el as HTMLImageElement).alt || "";
      })
      .catch(() => "");

    if (altText) {
      strategies.push({ method: "getByAltText", args: [altText], priority: 4 });
    }
  }

  // 5. getByTestId (if data-testid present)
  const testId = await page
    .$eval(selector, (el) => {
      return (
        el.getAttribute("data-testid") || el.getAttribute("data-test-id") || ""
      );
    })
    .catch(() => "");

  if (testId) {
    strategies.push({ method: "getByTestId", args: [testId], priority: 5 });
  }

  // 6. getByText (last resort)
  if (elementInfo.textContent) {
    strategies.push({
      method: "getByText",
      args: [elementInfo.textContent, { exact: true }] as [
        string,
        { exact: boolean },
      ],
      priority: 6,
    });
  }

  // Sort by priority
  strategies.sort((a, b) => a.priority - b.priority);

  // Check if element has accessible name
  const hasAccessibleName = !!(
    elementInfo.ariaLabel ||
    elementInfo.textContent ||
    labelFor ||
    placeholder ||
    testId
  );

  return {
    preferredQuery: strategies[0] || {
      method: "getByRole",
      args: ["generic"],
      priority: 99,
    },
    alternatives: strategies.slice(1),
    hasAccessibleName,
    isInteractive,
  };
}

/**
 * Recommends the best query method for a given element
 * @param properties - The accessibility properties
 * @returns string - Recommended query method
 */
export function recommendQueryMethod(
  properties: AccessibilityProperties
): string {
  const { preferredQuery } = properties;

  if (preferredQuery.priority === 99) {
    return `// Warning: No good query strategy found. Consider adding data-testid or aria-label.`;
  }

  let queryString = preferredQuery.method;

  if (preferredQuery.args.length > 0) {
    const args = preferredQuery.args
      .map((arg) => {
        if (arg instanceof RegExp) return `/${arg.source}/${arg.flags}`;
        return typeof arg === "string" ? `"${arg}"` : JSON.stringify(arg);
      })
      .join(", ");
    queryString += `(${args})`;
  }

  return queryString;
}
