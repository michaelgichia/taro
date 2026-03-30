/**
 * Shared constants for the resolver module.
 */

/**
 * Maps HTML tag names to implied ARIA roles.
 */
export const ROLE_MAP: Record<string, string> = {
  button: "button",
  a: "link",
  input: "textbox",
  select: "combobox",
  textarea: "textbox",
  h1: "heading",
  h2: "heading",
  h3: "heading",
  h4: "heading",
  h5: "heading",
  h6: "heading",
  img: "img",
};

export const GENERIC_FIELD_CONTEXT_PATTERN =
  /\b(details?|information|summary|review|section|panel|wrapper|container|layout|row|table|list|grid)\b/i;

export const FIELD_LABEL_HINT_PATTERN =
  /\b(name|email|phone|pin|quantity|amount|reference|description|notes?|comment|code|search|address|date|time|password|customer|type|number)\b/i;

export const AUTH_COPY_PATTERN =
  /\b(sign in|log in|continue with|single sign-on|sso|password|verification code|one-time code|two-factor|2fa|multi-factor|mfa|confirm it'?s you)\b/i;

export const PLAYWRIGHT_CAPTURE_FAILURE_PREFIX =
  "Playwright visual capture failed.";
export const PLAYWRIGHT_SELECTOR_INSPECTION_ERROR_PREFIX =
  "Playwright selector inspection failed.";
export const PLAYWRIGHT_AUTH_RECOVERY_POLL_MS = 1000;
export const PLAYWRIGHT_AUTH_RECOVERY_RETRY_LIMIT = 5;
export const PLAYWRIGHT_PAGE_CONFIRMATION_POLL_MS = 250;
export const PLAYWRIGHT_OPEN_RETRY_LIMIT = 3;
export const PLAYWRIGHT_OPEN_RETRY_DELAY_MS = 2000;
export const PLAYWRIGHT_STEP_REPLAY_TIMEOUT_MS = 5000;
