import type { Locator, Page } from "playwright";

import {
  PLAYWRIGHT_OPEN_RETRY_DELAY_MS,
  PLAYWRIGHT_OPEN_RETRY_LIMIT,
} from "#core/resolver.constants.ts";

/**
 * Escapes single quotes in strings for use in generated query code.
 */
export function escapeSingleQuote(str: string): string {
  return str.replace(/'/g, "\\'");
}

export function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown error";
}

export function looksLikeCssSelector(target: string): boolean {
  const normalized = target.trim();
  if (!normalized) {
    return false;
  }

  const descendantTagSelector = normalized.split(/\s+/);
  if (
    descendantTagSelector.length > 1 &&
    descendantTagSelector.every((segment) => /^[a-z][a-z0-9-]*$/.test(segment))
  ) {
    return true;
  }

  return (
    /^[#.[]/.test(normalized) ||
    /^[a-z][a-z0-9-]*(?:[.#[:>+~])/.test(normalized) ||
    /^(button|input|select|textarea|a|img|h[1-6])$/.test(normalized) ||
    /^(css|xpath|text|id|data-testid|data-test-id|role)=/i.test(normalized)
  );
}

export function resolveElementProbeLocator(
  page: Page,
  selector: string
): Locator {
  if (looksLikeCssSelector(selector)) {
    return page.locator(selector).first();
  }

  return page.getByText(selector, { exact: true }).first();
}

export function isRetryablePlaywrightOpenError(error: unknown): boolean {
  const message = getErrorMessage(error);

  return (
    /Target page, context or browser has been closed/i.test(message) ||
    /Timeout \d+ms exceeded/i.test(message) ||
    /net::ERR_CONNECTION_REFUSED/i.test(message) ||
    /ERR_ABORTED/i.test(message)
  );
}

export async function waitForRetryDelay(delayMs: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, delayMs));
}

export function sanitizeCaptureSegment(value: string): string {
  return (
    value.replace(/[^a-zA-Z0-9-_]+/g, "-").replace(/^-+|-+$/g, "") || "capture"
  );
}

export function formatQueryDescriptorForDebug(query: {
  method: string;
  target?: string;
  role?: string;
  name?: string;
}): string {
  if (query.method === "getByRole" && query.role) {
    const parts = [`'${query.role}'`];
    if (query.name) {
      parts.push(`{ name: '${escapeSingleQuote(query.name)}' }`);
    }
    return `${query.method}(${parts.join(", ")})`;
  }

  if (query.target) {
    return `${query.method}('${escapeSingleQuote(query.target)}')`;
  }

  return `${query.method}()`;
}

export function normalizeComparableText(value?: string | null): string {
  return value?.replace(/\s+/g, " ").trim().toLowerCase() ?? "";
}

export function isPlaywrightOpenRetryConfigured(attempt: number): boolean {
  return attempt < PLAYWRIGHT_OPEN_RETRY_LIMIT;
}

export function getPlaywrightOpenRetryDelayMs(): number {
  return PLAYWRIGHT_OPEN_RETRY_DELAY_MS;
}
