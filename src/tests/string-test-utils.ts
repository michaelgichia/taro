export function countOccurrences(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}
