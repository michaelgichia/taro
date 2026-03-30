export function clampScore(score: number): number {
  return Math.min(100, Math.max(0, Math.round(score)));
}
