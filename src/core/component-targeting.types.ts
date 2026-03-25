import type * as t from "@babel/types";

import type { Finding } from "#core/findings-reporter.ts";
import type {
  AnalyzedRecording,
  ItGroup,
  JsScenarioPlan,
  NormalizedRecording,
  NormalizedStep,
  QueryDescriptor,
  QueryResult,
} from "#types/recording.ts";
import type { RepoRenderTargetCandidate } from "#types/state.ts";

export type AccessibleControlKind =
  | "button"
  | "checkbox"
  | "combobox"
  | "radio"
  | "textbox";

export type ComponentImportKind = NonNullable<
  RepoRenderTargetCandidate["importKind"]
>;

export interface BuiltQuery {
  descriptor: QueryDescriptor;
  query: string;
}

export interface CollectedText {
  kind: "heading" | "text";
  name: string;
  level?: number;
}

export interface CollectedControl {
  kind: AccessibleControlKind | "link";
  name: string;
  preferredMethod: QueryDescriptor["method"];
}

export interface CollectedField {
  kind: "checkbox" | "combobox" | "radio" | "textbox";
  label?: string;
  placeholder?: string;
}

export interface ImportedBinding {
  importPath: string;
  imported: string;
  kind: "default" | "named";
  local: string;
}

export interface InferredPropValue {
  expression: string;
  literalValue?: boolean | number | string;
}

export interface CollectedAssertion {
  name?: string;
  label: string;
  matcher?: string;
  query: BuiltQuery;
}

export interface CollectedVariantScenario {
  assertions: CollectedAssertion[];
  name: string;
  renderOverrides: string;
}

export interface ComponentSurface {
  headings: CollectedText[];
  texts: CollectedText[];
  controls: CollectedControl[];
  fields: CollectedField[];
  importBindingsUsed: string[];
  supplementalAssertions: CollectedAssertion[];
  variantScenarios: CollectedVariantScenario[];
  hasOpaqueJsx: boolean;
  boundaryImports: string[];
}

export interface ComponentDefinition {
  importKind: ComponentImportKind;
  name: string;
  props: string[];
  roots: Array<t.JSXElement | t.JSXFragment>;
  node:
    | t.FunctionDeclaration
    | t.FunctionExpression
    | t.ArrowFunctionExpression;
}

export interface SurfaceCollectorState {
  controls: Map<string, CollectedControl>;
  fields: CollectedField[];
  hasOpaqueJsx: boolean;
  headings: Map<string, CollectedText>;
  labelsById: Map<string, string>;
  supplementalAssertions: Map<string, CollectedAssertion>;
  texts: Map<string, CollectedText>;
}

export interface SurfaceElementDetails {
  ariaLabel: string | null;
  attributes: Map<string, t.JSXAttribute>;
  htmlFor: string | null;
  id: string | null;
  importBinding?: ImportedBinding;
  inputType: string;
  placeholder: string | null;
  role: string | null;
  tagName: string;
  textContent: string | null;
}

export interface SurfaceVisitContext {
  wrapperLabel?: string | null;
}

export interface ComponentTargetPlan {
  additionalImports?: string[];
  analyzedRecording: AnalyzedRecording;
  enableSetupOverrides?: boolean;
  findings: Finding[];
  moduleStatements?: string[];
  queryResults: QueryResult[];
  renderTarget: RepoRenderTargetCandidate;
  renderExpression?: string | null;
  scenarios?: JsScenarioPlan[];
}

export type {
  AnalyzedRecording,
  ItGroup,
  JsScenarioPlan,
  NormalizedRecording,
  NormalizedStep,
  QueryDescriptor,
  QueryResult,
  RepoRenderTargetCandidate,
};
