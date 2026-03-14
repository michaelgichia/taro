import type { QueryQuality } from "../types/recording.js";

const SUPPORTED_RTL_QUERY_METHOD_REGEX =
  /^(?<variant>get|query|find)(?<multiple>All)?By(?<family>Role|LabelText|PlaceholderText|Text|AltText|Title|DisplayValue|TestId)$/;

const QUERY_FAMILY_QUALITY_MAP = {
  ByRole: "excellent",
  ByLabelText: "excellent",
  ByPlaceholderText: "acceptable",
  ByText: "good",
  ByAltText: "excellent",
  ByTitle: "acceptable",
  ByDisplayValue: "acceptable",
  ByTestId: "fragile",
} as const satisfies Record<string, QueryQuality>;

const VOLATILE_SELECTOR_RULES = [
  { label: "dynamic Radix id", pattern: /#radix-[\w-]+/i },
  { label: "generated CSS class", pattern: /\.css-[\w-]+/i },
  { label: "positional selector", pattern: /nth-(?:of-type|child)\(/i },
] as const;

const SUPPORTED_QUERY_FAMILY_HINT =
  "Prefer RTL queries from the supported families: ByRole, ByLabelText, ByPlaceholderText, ByText, ByAltText, ByTitle, ByDisplayValue, or ByTestId.";

export type SupportedQueryFamily = keyof typeof QUERY_FAMILY_QUALITY_MAP;

interface SupportedQueryMethodMatch {
  variant: "get" | "query" | "find";
  multiple: boolean;
  family: SupportedQueryFamily;
}

function parseSupportedQueryMethod(
  method?: string
): SupportedQueryMethodMatch | undefined {
  if (!method) {
    return undefined;
  }

  const match = method.match(SUPPORTED_RTL_QUERY_METHOD_REGEX);
  const { variant, multiple, family } = match?.groups ?? {};
  const normalizedFamily = family
    ? (`By${family}` as SupportedQueryFamily)
    : undefined;
  if (
    !variant ||
    !normalizedFamily ||
    !["get", "query", "find"].includes(variant) ||
    !(normalizedFamily in QUERY_FAMILY_QUALITY_MAP)
  ) {
    return undefined;
  }

  return {
    variant: variant as SupportedQueryMethodMatch["variant"],
    multiple: multiple === "All",
    family: normalizedFamily,
  };
}

export function isSupportedTestingLibraryQueryMethod(method?: string): boolean {
  return Boolean(parseSupportedQueryMethod(method));
}

export function classifySupportedQueryMethod(method: string): QueryQuality {
  const family = parseSupportedQueryMethod(method)?.family;
  return family ? QUERY_FAMILY_QUALITY_MAP[family] : "fragile";
}

export function getSupportedTestingLibraryQueryFamily(
  method?: string
): SupportedQueryFamily | undefined {
  return parseSupportedQueryMethod(method)?.family;
}

export function isRoleQueryMethod(method?: string): boolean {
  return getSupportedTestingLibraryQueryFamily(method) === "ByRole";
}

export function isLabelTextQueryMethod(method?: string): boolean {
  return getSupportedTestingLibraryQueryFamily(method) === "ByLabelText";
}

export function isPlaceholderTextQueryMethod(method?: string): boolean {
  return getSupportedTestingLibraryQueryFamily(method) === "ByPlaceholderText";
}

export function isTextQueryMethod(method?: string): boolean {
  return getSupportedTestingLibraryQueryFamily(method) === "ByText";
}

export function isDisplayValueQueryMethod(method?: string): boolean {
  return getSupportedTestingLibraryQueryFamily(method) === "ByDisplayValue";
}

export function isTestIdQueryMethod(method?: string): boolean {
  return getSupportedTestingLibraryQueryFamily(method) === "ByTestId";
}

export function toSingularAsyncQueryMethod(
  method?: string
): string | undefined {
  const parsed = parseSupportedQueryMethod(method);
  if (!parsed || parsed.multiple) {
    return undefined;
  }

  return `find${parsed.family}`;
}

export function getUnsupportedSelectorReason(
  selector?: string
): string | undefined {
  if (!selector) {
    return undefined;
  }

  const matchedRules = VOLATILE_SELECTOR_RULES.filter((rule) =>
    rule.pattern.test(selector)
  );
  if (matchedRules.length === 0) {
    return undefined;
  }

  const matchedLabels = matchedRules.map((rule) => rule.label).join(", ");
  return `Selector ${selector} is a volatile DOM implementation detail (${matchedLabels}). ${SUPPORTED_QUERY_FAMILY_HINT}`;
}
