import type {
  NormalizedStep,
  SemanticMarkerCandidate,
  SemanticMarkerLink,
  UnresolvedSemanticMarker,
} from "#types/recording.ts";

export function getSemanticMarkerCandidate(
  step: NormalizedStep
): SemanticMarkerCandidate | undefined {
  const metadataCandidate = step.metadata?.semanticMarkerCandidate;

  if (
    metadataCandidate &&
    typeof metadataCandidate === "object" &&
    "stepId" in metadataCandidate &&
    typeof metadataCandidate.stepId === "string"
  ) {
    return metadataCandidate as SemanticMarkerCandidate;
  }

  return step.semanticMarkerCandidate;
}

export function getSemanticMarkerLink(
  step: NormalizedStep
): SemanticMarkerLink | undefined {
  const metadataLink = step.metadata?.semanticMarkerLink;

  if (
    metadataLink &&
    typeof metadataLink === "object" &&
    "markerStepId" in metadataLink &&
    typeof metadataLink.markerStepId === "string"
  ) {
    return metadataLink as SemanticMarkerLink;
  }

  return step.semanticMarkerLink;
}

export function getUnresolvedSemanticMarker(
  step: NormalizedStep
): UnresolvedSemanticMarker | undefined {
  const metadataMarker = step.metadata?.unresolvedSemanticMarker;

  if (
    metadataMarker &&
    typeof metadataMarker === "object" &&
    "stepId" in metadataMarker &&
    typeof metadataMarker.stepId === "string"
  ) {
    return metadataMarker as UnresolvedSemanticMarker;
  }

  return step.unresolvedSemanticMarker;
}

export function hasLinkedSemanticMarker(step: NormalizedStep): boolean {
  return Boolean(step.semanticMarkerLink || step.unresolvedSemanticMarker);
}
