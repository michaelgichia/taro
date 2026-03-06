import { chromium, Browser, Page } from 'playwright'
import pc from 'picocolors'
import type { ElementInfo, QueryResult, QueryQuality } from '../types/recording.js'

/**
 * Maps HTML tag names to implied ARIA roles.
 * Used by buildQuery to determine accessible query method.
 */
const ROLE_MAP: Record<string, string> = {
  button: 'button',
  a: 'link',
  input: 'textbox',
  select: 'combobox',
  textarea: 'textbox',
  h1: 'heading',
  h2: 'heading',
  h3: 'heading',
  h4: 'heading',
  h5: 'heading',
  h6: 'heading',
  img: 'img',
}

/**
 * Escapes single quotes in strings for use in generated query code.
 */
function escapeSingleQuote(str: string): string {
  return str.replace(/'/g, "\\'")
}

/**
 * Sanitizes a CSS selector to be used as a testId.
 * Replaces non-alphanumeric characters with hyphens and trims leading/trailing hyphens.
 */
function sanitizeSelectorForTestId(selector: string): string {
  return selector.replace(/[^a-zA-Z0-9-]/g, '-').replace(/^-+|-+$/g, '')
}

/**
 * Builds the highest-priority RTL query for an element based on its accessibility properties.
 * Priority: getByRole > getByLabelText > getByText > getByPlaceholderText > getByTestId
 *
 * @param info - Element information from DOM inspection
 * @param selector - Original CSS selector
 * @returns QueryResult with query string, quality rating, and method name
 */
export function buildQuery(info: ElementInfo, selector: string): QueryResult {
  const impliedRole = info.role ?? ROLE_MAP[info.tagName]
  const accessibleName = info.ariaLabel ?? info.innerText

  // Priority 1: getByRole when both role and accessible name exist
  if (impliedRole && accessibleName) {
    return {
      method: 'getByRole',
      quality: 'excellent' as QueryQuality,
      query: `screen.getByRole('${impliedRole}', { name: '${escapeSingleQuote(accessibleName)}' })`,
    }
  }

  // Priority 2: getByLabelText when ariaLabel exists (no role match)
  if (info.ariaLabel) {
    return {
      method: 'getByLabelText',
      quality: 'excellent' as QueryQuality,
      query: `screen.getByLabelText('${escapeSingleQuote(info.ariaLabel)}')`,
    }
  }

  // Priority 3: getByText when innerText exists
  if (info.innerText) {
    return {
      method: 'getByText',
      quality: 'good' as QueryQuality,
      query: `screen.getByText('${escapeSingleQuote(info.innerText)}')`,
    }
  }

  // Priority 4: getByPlaceholderText when placeholder exists
  if (info.placeholder) {
    return {
      method: 'getByPlaceholderText',
      quality: 'acceptable' as QueryQuality,
      query: `screen.getByPlaceholderText('${escapeSingleQuote(info.placeholder)}')`,
    }
  }

  // Priority 5: Fallback to getByTestId (fragile)
  const sanitized = sanitizeSelectorForTestId(selector)
  return {
    method: 'getByTestId',
    quality: 'fragile' as QueryQuality,
    query: `screen.getByTestId('${sanitized}')`,
  }
}

/**
 * Selects the most appropriate RTL matcher based on element type and action.
 *
 * @param info - Element information from DOM inspection
 * @param action - The action being performed (fill, assert, etc.)
 * @returns Matcher string (e.g., '.toHaveValue()', '.toBeChecked()')
 */
export function selectMatcher(info: ElementInfo, action: string): string {
  // checkbox → toBeChecked
  if (info.type === 'checkbox') {
    return '.toBeChecked()'
  }

  // fill with value → toHaveValue
  if (info.value !== undefined && action === 'fill') {
    return `.toHaveValue('${escapeSingleQuote(info.value)}')`
  }

  // assert with innerText → toHaveTextContent
  if (action === 'assert' && info.innerText) {
    return `.toHaveTextContent('${escapeSingleQuote(info.innerText)}')`
  }

  // dialog → toBeVisible
  if (action === 'assert' && info.role === 'dialog') {
    return '.toBeVisible()'
  }

  // Default → toBeInTheDocument
  return '.toBeInTheDocument()'
}

/**
 * Inspects a single element on a page using Playwright.
 * Launches headless Chromium, navigates to URL, evaluates element.
 *
 * @param url - URL to navigate to
 * @param cssSelector - CSS selector to locate element
 * @param timeoutMs - Timeout for navigation (default 5000ms)
 * @returns ElementInfo or null if element not found/error occurs
 */
export async function inspectElement(
  url: string,
  cssSelector: string,
  timeoutMs = 5000
): Promise<ElementInfo | null> {
  let browser: Browser | null = null

  try {
    browser = await chromium.launch({ headless: true })
    const page = await browser.newPage()

    await page.goto(url, {
      timeout: timeoutMs,
      waitUntil: 'domcontentloaded',
    })

    const locator = page.locator(cssSelector).first()
    const elementInfo = await locator.evaluate((el: Element) => {
      const htmlEl = el as HTMLElement
      return {
        tagName: el.tagName.toLowerCase(),
        role: el.getAttribute('role') ?? null,
        ariaLabel: el.getAttribute('aria-label') ?? null,
        ariaLabelledBy: el.getAttribute('aria-labelledby') ?? null,
        innerText: htmlEl.innerText ?? '',
        value: (htmlEl as HTMLInputElement).value ?? undefined,
        type: (htmlEl as HTMLInputElement).type ?? undefined,
        placeholder: (htmlEl as HTMLInputElement).placeholder ?? null,
        isPresent: true,
      }
    })

    return elementInfo as ElementInfo
  } catch (error) {
    console.warn(
      pc.yellow('[taro]') +
        pc.dim(' QRY-02:') +
        ` Failed to inspect element ${cssSelector} on ${url}: ${error instanceof Error ? error.message : 'Unknown error'}`
    )
    return null
  } finally {
    if (browser) {
      await browser.close()
    }
  }
}

/**
 * Inspects multiple elements on a page using a single Playwright browser instance.
 * More efficient than calling inspectElement multiple times.
 *
 * @param url - URL to navigate to
 * @param selectors - Array of CSS selectors to locate elements
 * @param timeoutMs - Timeout for navigation (default 5000ms)
 * @returns Map of selector to ElementInfo (or null if not found)
 */
export async function inspectElements(
  url: string,
  selectors: string[],
  timeoutMs = 5000
): Promise<Map<string, ElementInfo | null>> {
  const result = new Map<string, ElementInfo | null>()
  let browser: Browser | null = null

  try {
    browser = await chromium.launch({ headless: true })
    const page = await browser.newPage()

    await page.goto(url, {
      timeout: timeoutMs,
      waitUntil: 'domcontentloaded',
    })

    for (const selector of selectors) {
      try {
        const locator = page.locator(selector).first()
        const elementInfo = await locator.evaluate((el: Element) => {
          const htmlEl = el as HTMLElement
          return {
            tagName: el.tagName.toLowerCase(),
            role: el.getAttribute('role') ?? null,
            ariaLabel: el.getAttribute('aria-label') ?? null,
            ariaLabelledBy: el.getAttribute('aria-labelledby') ?? null,
            innerText: htmlEl.innerText ?? '',
            value: (htmlEl as HTMLInputElement).value ?? undefined,
            type: (htmlEl as HTMLInputElement).type ?? undefined,
            placeholder: (htmlEl as HTMLInputElement).placeholder ?? null,
            isPresent: true,
          }
        })

        result.set(selector, elementInfo as ElementInfo)
      } catch {
        // On individual selector failure, set to null and continue
        result.set(selector, null)
      }
    }
  } catch (error) {
    // On browser/page error, set all selectors to null
    console.warn(
      pc.yellow('[taro]') +
        pc.dim(' QRY-02:') +
        ` Failed to inspect elements on ${url}: ${error instanceof Error ? error.message : 'Unknown error'}`
    )
    for (const selector of selectors) {
      result.set(selector, null)
    }
  } finally {
    if (browser) {
      await browser.close()
    }
  }

  return result
}

/**
 * Emits a warning for fragile queries (getByTestId fallback).
 * Should be called when buildQuery returns method: 'getByTestId'.
 *
 * @param selector - The CSS selector that required fallback to testId
 */
export function emitQry03Warning(selector: string): void {
  console.warn(
    pc.yellow('[taro]') +
      pc.dim(' QRY-03:') +
      ` No accessible query for ${pc.bold(selector)} — consider adding aria-label or data-testid to this element`
  )
}
