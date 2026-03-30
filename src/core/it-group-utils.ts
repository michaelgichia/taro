import type {
  AnalyzedRecording,
  ItGroup,
  NormalizedStep,
} from "#types/recording.ts";

export function toItGroups(
  analyzedRecording: AnalyzedRecording,
  fallbackTitle: string
): ItGroup[] {
  if (analyzedRecording.intentGroups.length > 0) {
    return analyzedRecording.intentGroups;
  }

  return [
    { name: fallbackTitle || "recorded flow", steps: analyzedRecording.steps },
  ];
}

export function rehydrateItGroups(
  itGroups: ItGroup[],
  steps: NormalizedStep[]
): ItGroup[] {
  const stepMap = new Map(steps.map((step) => [step.id, step]));

  return itGroups.map((group) => ({
    ...group,
    steps: group.steps.map((step) =>
      step.id ? (stepMap.get(step.id) ?? step) : step
    ),
  }));
}
