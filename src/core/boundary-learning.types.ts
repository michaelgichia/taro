import type {
  TaroBoundaryExemplarProfile,
  TaroBoundaryGuardrailReason,
  TaroBoundaryKind,
  TaroBoundaryPayloadSource,
  TaroBoundaryProfile,
  TaroBoundaryStrategy,
} from "#types/state.ts";

export interface BoundaryLearningTestFile {
  path: string;
  content: string;
}

export interface BoundaryLearningResult {
  profiles: TaroBoundaryProfile[];
  exemplars: TaroBoundaryExemplarProfile[];
}

export interface BoundaryImportReference {
  target: string;
  importedNames: string[];
  kind: TaroBoundaryKind;
  guardrailReason: TaroBoundaryGuardrailReason | null;
}

export interface ImportedBinding {
  importPath: string;
  imported: string;
  local: string;
}

export interface SupportImportReference {
  importPath: string;
  resolvedPath: string | null;
  sideEffectOnly: boolean;
}

export interface SupportModuleMockDescriptor {
  target: string;
  kind: TaroBoundaryKind;
  guardrailReason: TaroBoundaryGuardrailReason | null;
  usesOriginalRuntime: boolean;
  componentLikeSurface: boolean;
}

export interface BoundaryObservation {
  target: string;
  kind: TaroBoundaryKind;
  strategy: TaroBoundaryStrategy;
  guardrailReason: TaroBoundaryGuardrailReason | null;
  supportImportPath: string | null;
  usesOriginalRuntime: boolean;
  supportExports: TaroBoundaryProfile["supportExports"];
  payloadSource: TaroBoundaryPayloadSource;
  files: Set<string>;
  evidence: Set<string>;
  weight: number;
  componentLikeSurface: boolean;
}

export interface FileBoundaryUsage {
  file: string;
  targets: Set<string>;
  kinds: Set<TaroBoundaryKind>;
  usesCentralBoundarySupport: boolean;
  usesProviderWrapper: boolean;
  overrideStyle: TaroBoundaryExemplarProfile["overrideStyle"];
  qualityWeight: number;
}
