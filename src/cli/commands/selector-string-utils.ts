export function looksLikeSelectorLikeString(value: string): boolean {
  return (
    /^[#.[]/.test(value) ||
    /^[a-z][a-z0-9-]*(?:[.#[:>])/i.test(value) ||
    /^(button|input|select|textarea|a|img|h[1-6])$/i.test(value)
  );
}
