export function escapeSingleQuote(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

export function normalizeProofText(value?: string): string | undefined {
  const normalized = value?.replace(/\s+/g, " ").trim();
  return normalized ? normalized : undefined;
}

export function normalizeNullableText(value?: string | null): string | null {
  return normalizeProofText(value ?? undefined) ?? null;
}

export function isIconOnlyText(value?: string): boolean {
  const normalized = normalizeProofText(value);
  if (!normalized) {
    return false;
  }

  return normalized.length <= 2 && !/[a-z0-9]/i.test(normalized);
}
