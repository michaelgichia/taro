import { readFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";

import * as babelParser from "@babel/parser";
import type { NodePath } from "@babel/traverse";
import _traverse from "@babel/traverse";
import * as t from "@babel/types";
import { P, match } from "ts-pattern";

import type {
  BoundaryImportReference,
  BoundaryLearningResult,
  BoundaryLearningTestFile,
  BoundaryObservation,
  FileBoundaryUsage,
  ImportedBinding,
  SupportImportReference,
  SupportModuleMockDescriptor,
} from "#core/boundary-learning.types.ts";
import type { MutationLifecyclePattern } from "#types/conventions.ts";
import type {
  RepoRenderTargetCandidate,
  TaroBoundaryExemplarProfile,
  TaroBoundaryGuardrailReason,
  TaroBoundaryKind,
  TaroBoundaryPattern,
  TaroBoundaryPayloadSource,
  TaroBoundaryProfile,
  TaroBoundaryStrategy,
  TaroBoundaryTeachingExample,
  TaroBoundaryTeachingProfile,
  TaroPlaywrightAuthProfile,
  TaroProviderWrapperProfile,
  TaroRenderHelperProfile,
  TaroStateConfidence,
} from "#types/state.ts";

const traverse = (_traverse as any).default ?? _traverse;

const AST_PLUGINS: babelParser.ParserPlugin[] = [
  "jsx",
  "typescript",
  "classProperties",
  "classPrivateProperties",
  "classPrivateMethods",
  "topLevelAwait",
];

const SUPPORT_IMPORT_REGEX = /(mock|fixture|factor|support)/i;
const MOCK_METHOD_REGEX =
  /^mock(?:Implementation(?:Once)?|ReturnValue(?:Once)?|ResolvedValue(?:Once)?|RejectedValue(?:Once)?|Reset|Clear)$/u;
const UI_PATH_REGEX =
  /(?:^|\/)(?:components?|library|ui(?:-kit)?|design-system)(?:\/|$)/i;
const THIRD_PARTY_UI_PACKAGE_REGEX =
  /(?:^@[^/]+\/(?:components|ui(?:-kit)?|design-system)$)|(?:^[^./~@][^/]*\/(?:components|ui(?:-kit)?|design-system)$)/i;

function parseCode(code: string) {
  return babelParser.parse(code, {
    sourceType: "module",
    plugins: AST_PLUGINS,
  });
}

function isTestingSupportImport(importPath: string): boolean {
  return SUPPORT_IMPORT_REGEX.test(importPath);
}

function toConfidence(score: number): TaroStateConfidence {
  if (score >= 0.8) {
    return "high";
  }
  if (score >= 0.45) {
    return "medium";
  }
  return "low";
}

function strategyPriority(strategy: TaroBoundaryStrategy): number {
  switch (strategy) {
    case "forbid":
      return 6;
    case "provider-wrapper":
      return 5;
    case "shared-module-factory":
      return 4;
    case "scaffolded-module-factory":
      return 3;
    case "inline-safe":
      return 2;
    case "real-runtime":
      return 1;
    default:
      return 0;
  }
}

function normalizeTarget(target: string): string {
  return target.replace(/\\/g, "/");
}

function isRepoOwnedBoundaryTarget(target: string): boolean {
  return /^(?:\.{1,2}\/|@\/|~\/)/u.test(target);
}

function isComponentLikeExportName(name: string): boolean {
  if (name === "default") {
    return true;
  }

  if (!/^[A-Z][A-Za-z0-9]*$/u.test(name)) {
    return false;
  }

  if (/^use[A-Z]/u.test(name) || /^[A-Z0-9_]+$/u.test(name)) {
    return false;
  }

  return true;
}

function isRepoOwnedUiWrapperTarget(
  target: string,
  exportedNames: string[]
): boolean {
  return (
    isRepoOwnedBoundaryTarget(target) &&
    UI_PATH_REGEX.test(target) &&
    exportedNames.some((name) => isComponentLikeExportName(name))
  );
}

export function getBoundaryGuardrailReason(
  target: string,
  exportedNames: string[] = []
): TaroBoundaryGuardrailReason | null {
  const normalized = normalizeTarget(target);

  if (isRepoOwnedUiWrapperTarget(normalized, exportedNames)) {
    return "repo-owned-ui-wrapper";
  }

  if (
    !isRepoOwnedBoundaryTarget(normalized) &&
    THIRD_PARTY_UI_PACKAGE_REGEX.test(normalized)
  ) {
    return "ui-package";
  }

  return null;
}

export function classifyBoundaryKind(target: string): TaroBoundaryKind {
  const normalized = normalizeTarget(target);

  return match(normalized)
    .with("next/navigation", () => "router" as const)
    .with(
      P.when((value) => /(?:router|navigation|navigate|history)/i.test(value)),
      () => "router" as const
    )
    .with(
      P.when((value) => /(?:auth|session|clerk|next-auth)/i.test(value)),
      () => "auth" as const
    )
    .with(
      P.when((value) =>
        /(?:feature-flag|flag|featureFlags|launchdarkly|statsig)/i.test(value)
      ),
      () => "feature-flag" as const
    )
    .with("fetch", () => "network-client" as const)
    .with(
      P.when((value) =>
        /(?:axios|graphql|trpc|rpc|rest|nock|msw|undici|fetch-mock)/i.test(
          value
        )
      ),
      () => "network-client" as const
    )
    .with(
      P.when((value) =>
        /(?:^|\/)(?:actions?|server-actions?)(?:\/|$)/i.test(value)
      ),
      () => "server-action" as const
    )
    .with(
      P.when((value) =>
        /(?:data-layer|query|mutation|repository|repo|api)(?:\/|$)|(?:\/api(?:\/|$))/i.test(
          value
        )
      ),
      () => "data-module" as const
    )
    .with(
      P.when((value) =>
        /(?:localStorage|sessionStorage|Date|Math|window|document)/i.test(value)
      ),
      () => "env" as const
    )
    .with(
      P.when(
        (value) =>
          value.startsWith("./") ||
          value.startsWith("../") ||
          value.startsWith("@/") ||
          value.startsWith("~/")
      ),
      () => "local-child" as const
    )
    .otherwise(() => "unknown" as const);
}

function inferPayloadSource(
  importPath: string | null
): TaroBoundaryPayloadSource {
  if (!importPath) {
    return "unknown";
  }
  if (/mock-store/i.test(importPath)) {
    return "mock-store";
  }
  if (/fixtures?/i.test(importPath)) {
    return "fixtures";
  }
  if (/mocks?/i.test(importPath)) {
    return "typed-defaults";
  }
  if (/factors?/i.test(importPath)) {
    return "exemplar-only";
  }
  return "manual";
}

function createEmptySupportExports(): TaroBoundaryProfile["supportExports"] {
  return {
    factoryExport: null,
    resetExport: null,
    overrideExports: [],
    spyExports: [],
    fixtureExports: [],
  };
}

function getStringLiteral(node: t.Node | null | undefined): string | null {
  if (!node) {
    return null;
  }
  if (t.isStringLiteral(node)) {
    return node.value;
  }
  if (t.isTemplateLiteral(node) && node.expressions.length === 0) {
    return node.quasis[0]?.value.cooked ?? null;
  }
  return null;
}

function getMockTarget(path: NodePath<t.CallExpression>): string | null {
  const callee = path.node.callee;
  if (
    t.isMemberExpression(callee) &&
    t.isIdentifier(callee.object) &&
    (callee.object.name === "vi" || callee.object.name === "jest") &&
    t.isIdentifier(callee.property, { name: "mock" })
  ) {
    return getStringLiteral(path.node.arguments[0] ?? null);
  }

  return null;
}

function resolveImportedBinding(
  importedBindings: Map<string, ImportedBinding>,
  name: string | null | undefined
): ImportedBinding | null {
  if (!name) {
    return null;
  }
  return importedBindings.get(name) ?? null;
}

function buildImportedBindings(ast: t.File): Map<string, ImportedBinding> {
  const bindings = new Map<string, ImportedBinding>();

  for (const node of ast.program.body) {
    if (!t.isImportDeclaration(node)) {
      continue;
    }

    for (const specifier of node.specifiers) {
      if (t.isImportDefaultSpecifier(specifier)) {
        bindings.set(specifier.local.name, {
          importPath: node.source.value,
          imported: "default",
          local: specifier.local.name,
        });
      } else if (t.isImportSpecifier(specifier)) {
        bindings.set(specifier.local.name, {
          importPath: node.source.value,
          imported: t.isIdentifier(specifier.imported)
            ? specifier.imported.name
            : specifier.imported.value,
          local: specifier.local.name,
        });
      }
    }
  }

  return bindings;
}

function buildImportedNamesByPath(ast: t.File): Map<string, string[]> {
  const namesByPath = new Map<string, Set<string>>();

  for (const node of ast.program.body) {
    if (!t.isImportDeclaration(node)) {
      continue;
    }

    const target = normalizeTarget(node.source.value);
    const names = namesByPath.get(target) ?? new Set<string>();
    for (const specifier of node.specifiers) {
      if (t.isImportDefaultSpecifier(specifier)) {
        names.add("default");
        continue;
      }
      if (t.isImportSpecifier(specifier)) {
        names.add(
          t.isIdentifier(specifier.imported)
            ? specifier.imported.name
            : specifier.imported.value
        );
      }
    }
    namesByPath.set(target, names);
  }

  return new Map(
    [...namesByPath.entries()].map(([target, names]) => [
      target,
      [...names].sort(),
    ])
  );
}

function hasComponentLikeSurface(names: string[]): boolean {
  return names.some((name) => isComponentLikeExportName(name));
}

function getSupportModuleCandidateBases(params: {
  projectRoot: string;
  importerFile: string;
  importPath: string;
}): string[] {
  const normalizedImportPath = normalizeTarget(params.importPath);
  if (normalizedImportPath.startsWith("/")) {
    return [normalizedImportPath];
  }
  if (
    normalizedImportPath.startsWith("./") ||
    normalizedImportPath.startsWith("../")
  ) {
    return [resolve(dirname(params.importerFile), normalizedImportPath)];
  }
  if (
    normalizedImportPath.startsWith("@/") ||
    normalizedImportPath.startsWith("~/")
  ) {
    const trimmed = normalizedImportPath.slice(2);
    return [
      resolve(params.projectRoot, "src", trimmed),
      resolve(params.projectRoot, trimmed),
    ];
  }
  return [];
}

async function resolveSupportModulePath(params: {
  projectRoot: string;
  importerFile: string;
  importPath: string;
}): Promise<string | null> {
  const candidates = new Set<string>();
  const extensions = [
    ".ts",
    ".tsx",
    ".js",
    ".jsx",
    ".mts",
    ".cts",
    ".mjs",
    ".cjs",
  ];

  for (const base of getSupportModuleCandidateBases(params)) {
    candidates.add(base);
    for (const extension of extensions) {
      candidates.add(`${base}${extension}`);
      candidates.add(join(base, `index${extension}`));
    }
  }

  for (const candidate of candidates) {
    try {
      await readFile(candidate, "utf-8");
      return candidate;
    } catch {
      continue;
    }
  }

  return null;
}

async function collectSupportImportReferences(params: {
  ast: t.File;
  projectRoot: string;
  importerFile: string;
}): Promise<SupportImportReference[]> {
  const references = new Map<string, SupportImportReference>();

  for (const node of params.ast.program.body) {
    if (!t.isImportDeclaration(node)) {
      continue;
    }

    const importPath = normalizeTarget(node.source.value);
    if (!isTestingSupportImport(importPath)) {
      continue;
    }

    const resolvedPath = await resolveSupportModulePath({
      projectRoot: params.projectRoot,
      importerFile: params.importerFile,
      importPath,
    });
    references.set(importPath, {
      importPath,
      resolvedPath,
      sideEffectOnly: node.specifiers.length === 0,
    });
  }

  return [...references.values()];
}

function pushUnique(target: string[], value: string | null | undefined): void {
  if (!value) {
    return;
  }
  if (!target.includes(value)) {
    target.push(value);
  }
}

export const __boundaryLearningTestUtils = {
  getStringLiteral,
  inferPayloadSource,
  pushUnique,
  resolveImportedBinding,
  strategyPriority,
  isComponentLikeExportName,
  buildImportedNamesByPath,
};

function isProtectedKeepRealGuardrail(
  guardrailReason: TaroBoundaryGuardrailReason | null
): boolean {
  return guardrailReason === "repo-owned-ui-wrapper";
}

function getFactoryFunction(
  factory: t.Expression | t.SpreadElement | t.ArgumentPlaceholder | undefined
):
  | t.ArrowFunctionExpression
  | t.FunctionExpression
  | t.FunctionDeclaration
  | null {
  if (!factory) {
    return null;
  }
  if (
    t.isArrowFunctionExpression(factory) ||
    t.isFunctionExpression(factory) ||
    t.isFunctionDeclaration(factory)
  ) {
    return factory;
  }
  return null;
}

function detectOriginalRuntimeReuse(params: {
  factory: t.Expression | t.SpreadElement | t.ArgumentPlaceholder | undefined;
  returnedObject: t.ObjectExpression | null;
}): boolean {
  const fn = getFactoryFunction(params.factory);
  if (!fn || !params.returnedObject) {
    return false;
  }

  const isOriginalRuntimeCall = (
    node:
      | t.Expression
      | t.SpreadElement
      | t.ArgumentPlaceholder
      | null
      | undefined
  ): boolean => {
    if (!node) {
      return false;
    }
    const call = t.isAwaitExpression(node) ? node.argument : node;
    if (!t.isCallExpression(call)) {
      return false;
    }
    if (
      t.isIdentifier(call.callee) &&
      importOriginalParams.has(call.callee.name)
    ) {
      return true;
    }
    if (
      t.isIdentifier(call.callee, { name: "requireActual" }) ||
      (t.isMemberExpression(call.callee) &&
        t.isIdentifier(call.callee.object, { name: "jest" }) &&
        t.isIdentifier(call.callee.property, { name: "requireActual" }))
    ) {
      return true;
    }
    return false;
  };

  const importOriginalParams = new Set(
    fn.params
      .filter((param): param is t.Identifier => t.isIdentifier(param))
      .map((param) => param.name)
  );
  const runtimeAliases = new Set(importOriginalParams);

  if (t.isBlockStatement(fn.body)) {
    for (const statement of fn.body.body) {
      if (!t.isVariableDeclaration(statement)) {
        continue;
      }
      for (const declaration of statement.declarations) {
        if (!t.isIdentifier(declaration.id)) {
          continue;
        }
        const init = declaration.init;
        if (isOriginalRuntimeCall(init)) {
          runtimeAliases.add(declaration.id.name);
        }
      }
    }
  }

  return params.returnedObject.properties.some((property) => {
    if (!t.isSpreadElement(property)) {
      return false;
    }
    const argument = property.argument;
    if (t.isIdentifier(argument) && runtimeAliases.has(argument.name)) {
      return true;
    }
    if (isOriginalRuntimeCall(argument)) {
      return true;
    }
    return false;
  });
}

function analyzeSupportModuleSource(
  source: string
): SupportModuleMockDescriptor[] {
  let ast: t.File;
  try {
    ast = parseCode(source);
  } catch {
    return [];
  }

  const descriptors = new Map<string, SupportModuleMockDescriptor>();
  traverse(ast, {
    CallExpression(path: NodePath<t.CallExpression>) {
      const target = getMockTarget(path);
      if (!target) {
        return;
      }

      const normalizedTarget = normalizeTarget(target);
      const returnedObject = getReturnedObjectExpression(
        path.node.arguments[1]
      );
      const returnedObjectPropertyNames =
        getReturnedObjectPropertyNames(returnedObject);
      descriptors.set(normalizedTarget, {
        target: normalizedTarget,
        kind: classifyBoundaryKind(normalizedTarget),
        guardrailReason: getBoundaryGuardrailReason(
          normalizedTarget,
          returnedObjectPropertyNames
        ),
        usesOriginalRuntime: detectOriginalRuntimeReuse({
          factory: path.node.arguments[1],
          returnedObject,
        }),
        componentLikeSurface:
          getBoundaryGuardrailReason(
            normalizedTarget,
            returnedObjectPropertyNames
          ) === "ui-package" ||
          hasComponentLikeSurface(returnedObjectPropertyNames),
      });
    },
  });

  return [...descriptors.values()];
}

function inferObservationPattern(
  entry: Pick<
    BoundaryObservation,
    | "strategy"
    | "guardrailReason"
    | "supportImportPath"
    | "supportExports"
    | "usesOriginalRuntime"
  >
): TaroBoundaryPattern {
  return inferBoundaryPattern({
    strategy: entry.strategy,
    guardrailReason: entry.guardrailReason,
    supportImportPath: entry.supportImportPath,
    supportExports: entry.supportExports,
    usesOriginalRuntime: entry.usesOriginalRuntime,
  });
}

function getUiPackageObservationTrustRank(entry: BoundaryObservation): number {
  if (entry.guardrailReason !== "ui-package" || !entry.componentLikeSurface) {
    return 0;
  }

  const pattern = inferObservationPattern(entry);
  switch (pattern) {
    case "partial-support-import":
      return 4;
    case "keep-real":
      return 3;
    case "factory-support":
      return 2;
    default:
      return 1;
  }
}

function compareBoundaryObservations(
  left: BoundaryObservation,
  right: BoundaryObservation
): number {
  return (
    getUiPackageObservationTrustRank(right) -
      getUiPackageObservationTrustRank(left) ||
    right.weight - left.weight ||
    strategyPriority(right.strategy) - strategyPriority(left.strategy) ||
    (right.supportImportPath ?? "").localeCompare(left.supportImportPath ?? "")
  );
}

function shouldFallbackToKeepReal(
  entries: BoundaryObservation[],
  winner: BoundaryObservation
): boolean {
  if (
    winner.guardrailReason !== "ui-package" ||
    !winner.componentLikeSurface ||
    entries.some(
      (entry) => inferObservationPattern(entry) === "partial-support-import"
    )
  ) {
    return false;
  }

  const patterns = new Set(
    entries.map((entry) => inferObservationPattern(entry))
  );
  const supportImportPaths = new Set(
    entries.map((entry) => entry.supportImportPath ?? "__none__")
  );
  return patterns.size > 1 || supportImportPaths.size > 1;
}

function createKeepRealFallbackObservation(
  winner: BoundaryObservation
): BoundaryObservation {
  return {
    ...winner,
    strategy: "real-runtime",
    supportImportPath: null,
    usesOriginalRuntime: false,
    supportExports: createEmptySupportExports(),
    payloadSource: "unknown",
    evidence: new Set([
      ...winner.evidence,
      `${winner.target}: ui-package evidence conflicted without a trusted partial support import, so the profile fell back to keep-real`,
    ]),
  };
}

export function inferBoundaryPattern(params: {
  strategy: TaroBoundaryStrategy;
  guardrailReason: TaroBoundaryGuardrailReason | null;
  supportImportPath: string | null;
  supportExports?: TaroBoundaryProfile["supportExports"] | null;
  usesOriginalRuntime?: boolean;
}): TaroBoundaryPattern {
  const supportExports = params.supportExports ?? createEmptySupportExports();

  if (params.strategy === "provider-wrapper") {
    return "provider-wrapper";
  }
  if (params.strategy === "inline-safe") {
    return "inline-safe";
  }
  if (
    isProtectedKeepRealGuardrail(params.guardrailReason) ||
    params.strategy === "forbid"
  ) {
    return "keep-real";
  }
  if (params.usesOriginalRuntime && params.supportImportPath) {
    return "partial-support-import";
  }
  if (params.supportImportPath || supportExports.factoryExport) {
    return "factory-support";
  }
  return "keep-real";
}

function describeBoundaryPattern(
  profile: Pick<
    TaroBoundaryProfile,
    | "target"
    | "kind"
    | "guardrailReason"
    | "supportImportPath"
    | "supportExports"
  > & { pattern?: TaroBoundaryPattern }
): { summary: string; reason: string } {
  const pattern =
    profile.pattern ??
    inferBoundaryPattern({
      strategy: "real-runtime",
      guardrailReason: profile.guardrailReason,
      supportImportPath: profile.supportImportPath,
      supportExports: profile.supportExports,
    });

  switch (pattern) {
    case "partial-support-import":
      return {
        summary: `Keep ${profile.target} mostly real and reuse a partial support import when instability is isolated to a narrow export.`,
        reason:
          "Local examples preserve the real boundary surface and override only the unstable slice instead of rebuilding the package inline.",
      };
    case "factory-support":
      return {
        summary: `Reuse stable support handles for ${profile.target} rather than rebuilding collaborator state per test.`,
        reason:
          "Local examples expose shared factory or reset handles that keep setup explicit and deterministic.",
      };
    case "provider-wrapper":
      return {
        summary: `Keep ${profile.target} behind a provider wrapper instead of mocking the collaborator directly.`,
        reason:
          "Repo examples show this boundary is best satisfied by rendering through a wrapper rather than replacing it with a test double.",
      };
    case "inline-safe":
      return {
        summary: `Treat ${profile.target} as an inline-safe collaborator when no stronger local pattern exists.`,
        reason:
          "Repo examples show lightweight inline mocking is acceptable here because the boundary is simple and setup-oriented.",
      };
    case "keep-real":
    default:
      return {
        summary: `Keep ${profile.target} real at the render boundary instead of mocking through it.`,
        reason:
          profile.guardrailReason === "repo-owned-ui-wrapper"
            ? "Repo evidence treats this collaborator as part of the render surface, so environment or portal issues should be solved at the boundary itself."
            : "No stronger support pattern was learned, so the safest default is to preserve the real collaborator surface.",
      };
  }
}

export function buildBoundaryTeachingProfile(
  profiles: TaroBoundaryProfile[]
): TaroBoundaryTeachingProfile {
  const patternCounts = new Map<TaroBoundaryPattern, number>();
  for (const profile of profiles) {
    const pattern =
      profile.pattern ??
      inferBoundaryPattern({
        strategy: profile.strategy,
        guardrailReason: profile.guardrailReason,
        supportImportPath: profile.supportImportPath,
        supportExports: profile.supportExports,
      });
    patternCounts.set(pattern, (patternCounts.get(pattern) ?? 0) + 1);
  }

  const dominantPatterns = [...patternCounts.entries()]
    .sort((left, right) => {
      return right[1] - left[1] || left[0].localeCompare(right[0]);
    })
    .slice(0, 3)
    .map(([pattern]) => pattern);

  const examples: TaroBoundaryTeachingExample[] = [];
  const usedPatterns = new Set<TaroBoundaryPattern>();
  const sortedProfiles = [...profiles].sort((left, right) => {
    const confidenceOrder = { high: 3, medium: 2, low: 1 };
    return (
      confidenceOrder[right.confidence] - confidenceOrder[left.confidence] ||
      left.target.localeCompare(right.target)
    );
  });

  for (const profile of sortedProfiles) {
    const pattern =
      profile.pattern ??
      inferBoundaryPattern({
        strategy: profile.strategy,
        guardrailReason: profile.guardrailReason,
        supportImportPath: profile.supportImportPath,
        supportExports: profile.supportExports,
      });
    if (usedPatterns.has(pattern) || examples.length >= 3) {
      continue;
    }
    usedPatterns.add(pattern);
    const description = describeBoundaryPattern({ ...profile, pattern });
    examples.push({
      target: profile.target,
      pattern,
      summary: description.summary,
      reason: description.reason,
      confidence: profile.confidence,
      evidence: profile.evidence.slice(0, 2),
      counterExamples: profile.conflictTargets.slice(0, 2),
    });
  }

  return { dominantPatterns, examples };
}

function inferStrategy(params: {
  target: string;
  guardrailReason: TaroBoundaryGuardrailReason | null;
  supportImportPath: string | null;
  usedFactoryExport: boolean;
}): TaroBoundaryStrategy {
  if (isProtectedKeepRealGuardrail(params.guardrailReason)) {
    return "forbid";
  }
  if (params.usedFactoryExport && params.supportImportPath) {
    return "shared-module-factory";
  }
  if (classifyBoundaryKind(params.target) === "router") {
    return "inline-safe";
  }
  if (classifyBoundaryKind(params.target) === "env") {
    return "inline-safe";
  }
  return "real-runtime";
}

function getReturnedObjectExpression(
  factory:
    | t.Expression
    | t.FunctionDeclaration
    | t.SpreadElement
    | t.ArgumentPlaceholder
    | undefined
): t.ObjectExpression | null {
  const findReturnedObjectExpression = (
    statements: t.Statement[]
  ): t.ObjectExpression | null => {
    for (const statement of statements) {
      const returnedObject = match(statement)
        .with(
          { type: "ReturnStatement", argument: { type: "ObjectExpression" } },
          (returnStatement) => returnStatement.argument
        )
        .otherwise(() => null);
      if (returnedObject) {
        return returnedObject;
      }
    }

    return null;
  };

  return match(factory)
    .with(P.nullish, () => null)
    .with(
      { type: "ArrowFunctionExpression", body: { type: "ObjectExpression" } },
      (arrowFunction) => arrowFunction.body
    )
    .with({ type: "ArrowFunctionExpression" }, (arrowFunction) =>
      match(arrowFunction.body)
        .with({ type: "BlockStatement" }, (body) =>
          findReturnedObjectExpression(body.body)
        )
        .otherwise(() => null)
    )
    .with({ type: "FunctionExpression" }, (functionNode) =>
      findReturnedObjectExpression(functionNode.body.body)
    )
    .with({ type: "FunctionDeclaration" }, (functionNode) =>
      findReturnedObjectExpression(functionNode.body.body)
    )
    .otherwise(() => null);
}

function getReturnedObjectPropertyNames(
  node: t.ObjectExpression | null
): string[] {
  if (!node) {
    return [];
  }

  const names = new Set<string>();
  for (const property of node.properties) {
    if (t.isObjectProperty(property)) {
      if (t.isIdentifier(property.key)) {
        names.add(property.key.name);
      } else if (t.isStringLiteral(property.key)) {
        names.add(property.key.value);
      }
      continue;
    }

    if (t.isObjectMethod(property) && t.isIdentifier(property.key)) {
      names.add(property.key.name);
    }
  }

  return [...names].sort();
}

function inferRenderBoundary(
  file: string,
  renderTargets: RepoRenderTargetCandidate[]
): TaroBoundaryExemplarProfile["renderBoundary"] {
  const matches = renderTargets.filter(
    (target) => target.sourceTestFile === file
  );
  if (matches.length === 0) {
    return "unknown";
  }
  if (
    matches.some(
      (target) => /Module$/u.test(target.symbol) || target.usesWithin
    )
  ) {
    return "module";
  }
  return "component";
}

export async function collectBoundaryLearning(params: {
  projectRoot: string;
  testFiles: BoundaryLearningTestFile[];
  renderTargets: RepoRenderTargetCandidate[];
  providerWrappers: TaroProviderWrapperProfile[];
  mutationLifecycles: MutationLifecyclePattern[];
  getFileWeight?: (relativeFile: string) => number;
}): Promise<BoundaryLearningResult> {
  const observations = new Map<string, BoundaryObservation[]>();
  const fileUsage = new Map<string, FileBoundaryUsage>();
  const providerWrapperFiles = new Set(
    params.providerWrappers.map((wrapper) => wrapper.sourceTestFile)
  );
  const mutationFiles = new Set(
    params.mutationLifecycles.map((entry) => entry.file)
  );
  const supportModuleCache = new Map<string, SupportModuleMockDescriptor[]>();

  for (const testFile of params.testFiles) {
    const relativeFile = relative(params.projectRoot, testFile.path).replace(
      /\\/g,
      "/"
    );
    const fileQualityWeight = params.getFileWeight?.(relativeFile) ?? 1;
    const usage: FileBoundaryUsage = {
      file: relativeFile,
      targets: new Set(),
      kinds: new Set(),
      usesCentralBoundarySupport: false,
      usesProviderWrapper: providerWrapperFiles.has(relativeFile),
      overrideStyle: "none",
      qualityWeight: fileQualityWeight,
    };

    let ast: t.File;
    try {
      ast = parseCode(testFile.content);
    } catch {
      fileUsage.set(relativeFile, usage);
      continue;
    }

    const importedBindings = buildImportedBindings(ast);
    const importedNamesByPath = buildImportedNamesByPath(ast);
    const supportImports = await collectSupportImportReferences({
      ast,
      projectRoot: params.projectRoot,
      importerFile: testFile.path,
    });

    function upsertObservation(
      target: string,
      next: Partial<BoundaryObservation> &
        Pick<BoundaryObservation, "kind" | "strategy">
    ) {
      const existing = observations.get(target) ?? [];
      const supportExports = next.supportExports ?? createEmptySupportExports();
      const entry: BoundaryObservation = {
        target,
        kind: next.kind,
        strategy: next.strategy,
        guardrailReason: next.guardrailReason ?? null,
        supportImportPath: next.supportImportPath ?? null,
        usesOriginalRuntime: next.usesOriginalRuntime ?? false,
        supportExports,
        payloadSource:
          next.payloadSource ??
          inferPayloadSource(next.supportImportPath ?? null),
        files: new Set([relativeFile]),
        evidence: new Set(next.evidence ?? []),
        weight: (next.weight ?? 1) * fileQualityWeight,
        componentLikeSurface: next.componentLikeSurface ?? false,
      };
      existing.push(entry);
      observations.set(target, existing);
      usage.targets.add(target);
      usage.kinds.add(next.kind);
      if (
        entry.strategy === "shared-module-factory" ||
        entry.supportImportPath
      ) {
        usage.usesCentralBoundarySupport = true;
      }
    }

    for (const supportImport of supportImports) {
      if (!supportImport.sideEffectOnly || !supportImport.resolvedPath) {
        continue;
      }

      let descriptors = supportModuleCache.get(supportImport.resolvedPath);
      if (!descriptors) {
        const source = await readFile(
          supportImport.resolvedPath,
          "utf-8"
        ).catch(() => null);
        descriptors = source ? analyzeSupportModuleSource(source) : [];
        supportModuleCache.set(supportImport.resolvedPath, descriptors);
      }

      for (const descriptor of descriptors) {
        upsertObservation(descriptor.target, {
          kind: descriptor.kind,
          strategy: inferStrategy({
            target: descriptor.target,
            guardrailReason: descriptor.guardrailReason,
            supportImportPath: supportImport.importPath,
            usedFactoryExport: false,
          }),
          guardrailReason: descriptor.guardrailReason,
          supportImportPath: supportImport.importPath,
          usesOriginalRuntime: descriptor.usesOriginalRuntime,
          supportExports: createEmptySupportExports(),
          payloadSource: inferPayloadSource(supportImport.importPath),
          evidence: new Set([
            `${relativeFile}: support import ${supportImport.importPath} for ${descriptor.target}`,
          ]),
          weight: descriptor.usesOriginalRuntime ? 5 : 3,
          componentLikeSurface: descriptor.componentLikeSurface,
        });
      }
    }

    traverse(ast, {
      CallExpression(path: NodePath<t.CallExpression>) {
        const target = getMockTarget(path);
        if (target) {
          const normalizedTarget = normalizeTarget(target);
          const returnedObject = getReturnedObjectExpression(
            path.node.arguments[1]
          );
          const returnedObjectPropertyNames =
            getReturnedObjectPropertyNames(returnedObject);
          let supportImportPath: string | null = null;
          const supportExports = createEmptySupportExports();
          let usedFactoryExport = false;
          const usesOriginalRuntime = detectOriginalRuntimeReuse({
            factory: path.node.arguments[1],
            returnedObject,
          });

          if (returnedObject) {
            for (const property of returnedObject.properties) {
              if (
                t.isSpreadElement(property) &&
                t.isCallExpression(property.argument) &&
                t.isIdentifier(property.argument.callee)
              ) {
                const imported = resolveImportedBinding(
                  importedBindings,
                  property.argument.callee.name
                );
                if (imported && isTestingSupportImport(imported.importPath)) {
                  supportImportPath = imported.importPath;
                  supportExports.factoryExport = imported.local;
                  usedFactoryExport = true;
                }
              }

              if (
                t.isObjectProperty(property) &&
                t.isIdentifier(property.value)
              ) {
                const imported = resolveImportedBinding(
                  importedBindings,
                  property.value.name
                );
                if (imported && isTestingSupportImport(imported.importPath)) {
                  supportImportPath = imported.importPath;
                  pushUnique(supportExports.overrideExports, imported.local);
                }
              }
            }
          }

          const kind = classifyBoundaryKind(normalizedTarget);
          const guardrailReason = getBoundaryGuardrailReason(
            normalizedTarget,
            returnedObjectPropertyNames
          );
          const componentLikeSurface =
            guardrailReason === "ui-package" ||
            hasComponentLikeSurface([
              ...returnedObjectPropertyNames,
              ...(importedNamesByPath.get(normalizedTarget) ?? []),
            ]);
          upsertObservation(normalizedTarget, {
            kind,
            strategy: inferStrategy({
              target: normalizedTarget,
              guardrailReason,
              supportImportPath,
              usedFactoryExport,
            }),
            guardrailReason,
            supportImportPath,
            usesOriginalRuntime,
            supportExports,
            payloadSource: inferPayloadSource(supportImportPath),
            evidence: new Set([
              `${relativeFile}: mock target ${normalizedTarget}`,
            ]),
            weight: usedFactoryExport ? 3 : 1,
            componentLikeSurface,
          });
        }

        if (t.isIdentifier(path.node.callee, { name: "beforeEach" })) {
          const arg = path.node.arguments[0];
          if (t.isIdentifier(arg)) {
            const imported = resolveImportedBinding(importedBindings, arg.name);
            if (imported && isTestingSupportImport(imported.importPath)) {
              for (const entries of observations.values()) {
                for (const entry of entries) {
                  if (entry.supportImportPath === imported.importPath) {
                    entry.supportExports.resetExport = imported.local;
                    entry.weight += fileQualityWeight;
                    entry.evidence.add(
                      `${relativeFile}: beforeEach(${imported.local})`
                    );
                  }
                }
              }
            }
          }
        }

        if (
          t.isMemberExpression(path.node.callee) &&
          t.isIdentifier(path.node.callee.object) &&
          t.isIdentifier(path.node.callee.property) &&
          MOCK_METHOD_REGEX.test(path.node.callee.property.name)
        ) {
          const imported = resolveImportedBinding(
            importedBindings,
            path.node.callee.object.name
          );
          if (imported && isTestingSupportImport(imported.importPath)) {
            usage.overrideStyle = "stable-handles";
            for (const entries of observations.values()) {
              for (const entry of entries) {
                if (entry.supportImportPath === imported.importPath) {
                  pushUnique(
                    entry.supportExports.overrideExports,
                    imported.local
                  );
                  entry.weight += fileQualityWeight;
                  entry.evidence.add(
                    `${relativeFile}: ${imported.local}.${path.node.callee.property.name}(...)`
                  );
                }
              }
            }
          }
        }
      },
      Identifier(path: NodePath<t.Identifier>) {
        const imported = resolveImportedBinding(
          importedBindings,
          path.node.name
        );
        if (!imported || !isTestingSupportImport(imported.importPath)) {
          return;
        }
        if (/Spy|Mutate|Mock$/u.test(imported.local)) {
          for (const entries of observations.values()) {
            for (const entry of entries) {
              if (entry.supportImportPath === imported.importPath) {
                pushUnique(entry.supportExports.spyExports, imported.local);
              }
            }
          }
        }
      },
    });

    fileUsage.set(relativeFile, usage);
  }

  for (const wrapper of params.providerWrappers) {
    const target = normalizeTarget(wrapper.importPath);
    const existing = observations.get(target) ?? [];
    existing.push({
      target,
      kind: classifyBoundaryKind(target),
      strategy: "provider-wrapper",
      guardrailReason: getBoundaryGuardrailReason(target, []),
      supportImportPath: wrapper.importPath,
      usesOriginalRuntime: false,
      supportExports: createEmptySupportExports(),
      payloadSource: "manual",
      files: new Set([wrapper.sourceTestFile]),
      evidence: new Set([`${wrapper.sourceTestFile}: wrapper ${wrapper.name}`]),
      weight: 2 * (params.getFileWeight?.(wrapper.sourceTestFile) ?? 1),
      componentLikeSurface: false,
    });
    observations.set(target, existing);
    const usage = fileUsage.get(wrapper.sourceTestFile);
    if (usage) {
      usage.targets.add(target);
      usage.kinds.add(classifyBoundaryKind(target));
      usage.usesProviderWrapper = true;
    }
  }

  const profiles: TaroBoundaryProfile[] = [...observations.entries()]
    .map(([target, entries]) => {
      const sortedEntries = [...entries].sort(compareBoundaryObservations);
      const initialWinner = sortedEntries[0]!;
      const usedKeepRealFallback = shouldFallbackToKeepReal(
        sortedEntries,
        initialWinner
      );
      const winner = usedKeepRealFallback
        ? createKeepRealFallbackObservation(initialWinner)
        : initialWinner;
      const totalWeight =
        sortedEntries.reduce((sum, entry) => sum + entry.weight, 0) || 1;
      const winnerPattern = inferObservationPattern(winner);
      const hasConflictingNonPartialSupport = sortedEntries.some(
        (entry) =>
          entry !== initialWinner &&
          inferObservationPattern(entry) !== "partial-support-import"
      );
      let confidence = toConfidence(
        winner.weight / totalWeight + (winner.supportImportPath ? 0.2 : 0)
      );
      if (
        winner.guardrailReason === "ui-package" &&
        winner.componentLikeSurface &&
        winnerPattern === "partial-support-import" &&
        hasConflictingNonPartialSupport &&
        confidence === "high"
      ) {
        confidence = "medium";
      }
      if (usedKeepRealFallback) {
        confidence = "low";
      }
      const files = [
        ...new Set(sortedEntries.flatMap((entry) => [...entry.files])),
      ].sort();
      const evidence = [
        ...new Set(sortedEntries.flatMap((entry) => [...entry.evidence])),
      ].sort();
      const conflictTargets = [
        ...new Set(
          sortedEntries
            .slice(1)
            .map(
              (entry) =>
                `${entry.strategy}${entry.supportImportPath ? ` -> ${entry.supportImportPath}` : ""}`
            )
        ),
      ];

      return {
        target,
        kind: winner.kind,
        strategy: winner.strategy,
        pattern: inferBoundaryPattern({
          strategy: winner.strategy,
          guardrailReason: winner.guardrailReason,
          supportImportPath:
            winner.strategy === "forbid" ? null : winner.supportImportPath,
          supportExports:
            winner.strategy === "forbid"
              ? createEmptySupportExports()
              : {
                  factoryExport: winner.supportExports.factoryExport,
                  resetExport: winner.supportExports.resetExport,
                  overrideExports: [
                    ...winner.supportExports.overrideExports,
                  ].sort(),
                  spyExports: [...winner.supportExports.spyExports].sort(),
                  fixtureExports: [
                    ...winner.supportExports.fixtureExports,
                  ].sort(),
                },
          usesOriginalRuntime: winner.usesOriginalRuntime,
        }),
        guardrailReason: winner.guardrailReason,
        supportImportPath:
          winner.strategy === "forbid" ? null : winner.supportImportPath,
        supportPath: null,
        supportExports:
          winner.strategy === "forbid"
            ? createEmptySupportExports()
            : {
                factoryExport: winner.supportExports.factoryExport,
                resetExport: winner.supportExports.resetExport,
                overrideExports: [
                  ...winner.supportExports.overrideExports,
                ].sort(),
                spyExports: [...winner.supportExports.spyExports].sort(),
                fixtureExports: [
                  ...winner.supportExports.fixtureExports,
                ].sort(),
              },
        payloadSource:
          winner.strategy === "forbid" ? "unknown" : winner.payloadSource,
        confidence,
        files,
        evidence,
        conflictTargets,
        lowConfidenceScaffold: false,
      };
    })
    .sort((left, right) => left.target.localeCompare(right.target));

  const exemplars: TaroBoundaryExemplarProfile[] = [...fileUsage.values()]
    .map((usage) => ({
      exemplar: {
        file: usage.file,
        renderBoundary: inferRenderBoundary(usage.file, params.renderTargets),
        boundaryTargets: [...usage.targets].sort(),
        boundaryKinds: [...usage.kinds].sort(),
        usesProviderWrapper: usage.usesProviderWrapper,
        usesCentralBoundarySupport: usage.usesCentralBoundarySupport,
        hasMutationLifecycle: mutationFiles.has(usage.file),
        overrideStyle: usage.overrideStyle,
        tags: [
          ...(usage.usesProviderWrapper ? ["provider-wrapper"] : []),
          ...(usage.usesCentralBoundarySupport
            ? ["central-boundary-support"]
            : []),
          ...(mutationFiles.has(usage.file) ? ["mutation-lifecycle"] : []),
          ...[...usage.kinds].map((kind) => `boundary:${kind}`),
        ].sort(),
      },
      qualityWeight: usage.qualityWeight,
    }))
    .sort((left, right) => {
      return (
        right.qualityWeight - left.qualityWeight ||
        right.exemplar.tags.length - left.exemplar.tags.length ||
        left.exemplar.file.localeCompare(right.exemplar.file)
      );
    })
    .map(({ exemplar }) => exemplar);

  return { profiles, exemplars };
}

export async function discoverBoundaryImportsFromSource(
  filePath: string
): Promise<BoundaryImportReference[]> {
  let content: string;
  try {
    content = await readFile(filePath, "utf-8");
  } catch {
    return [];
  }

  let ast: t.File;
  try {
    ast = parseCode(content);
  } catch {
    return [];
  }

  const imports = new Map<string, Set<string>>();
  for (const node of ast.program.body) {
    if (!t.isImportDeclaration(node)) {
      continue;
    }

    const importPath = normalizeTarget(node.source.value);
    if (
      importPath === "react" ||
      importPath.startsWith("@testing-library/") ||
      importPath.endsWith(".css") ||
      importPath.endsWith(".scss") ||
      importPath.endsWith(".sass")
    ) {
      continue;
    }

    const names = imports.get(importPath) ?? new Set<string>();
    for (const specifier of node.specifiers) {
      if (t.isImportDefaultSpecifier(specifier)) {
        names.add("default");
      } else if (t.isImportSpecifier(specifier)) {
        names.add(
          t.isIdentifier(specifier.imported)
            ? specifier.imported.name
            : specifier.imported.value
        );
      }
    }
    imports.set(importPath, names);
  }

  return [...imports.entries()]
    .map(([target, importedNames]) => ({
      target,
      importedNames: [...importedNames].sort(),
      kind: classifyBoundaryKind(target),
      guardrailReason: getBoundaryGuardrailReason(target, [...importedNames]),
    }))
    .sort((left, right) => left.target.localeCompare(right.target));
}

export function summarizeBoundaryProfiles(
  profiles: TaroBoundaryProfile[],
  options: {
    renderHelpers: TaroRenderHelperProfile[];
    playwrightAuth: TaroPlaywrightAuthProfile | null;
  }
): string[] {
  const lines: string[] = [];

  if (profiles.length === 0) {
    lines.push("- No learned boundary profiles yet.");
  } else {
    for (const profile of profiles) {
      const detail = [
        `${profile.kind}`,
        `${profile.strategy}`,
        `confidence=${profile.confidence}`,
      ];
      if (profile.pattern) {
        detail.push(`pattern=${profile.pattern}`);
      }
      if (profile.guardrailReason) {
        detail.push(`guardrail=${profile.guardrailReason}`);
      }
      if (profile.supportImportPath) {
        detail.push(`support=${profile.supportImportPath}`);
      }
      if (profile.lowConfidenceScaffold) {
        detail.push("low-confidence-scaffold");
      }
      if (profile.conflictTargets.length > 0) {
        detail.push(`conflicts=${profile.conflictTargets.join(", ")}`);
      }
      lines.push(`- \`${profile.target}\`: ${detail.join(", ")}`);
    }
  }

  if (options.renderHelpers.length > 0) {
    lines.push(
      `- Render helpers: ${options.renderHelpers.map((helper) => `\`${helper.name}\``).join(", ")}`
    );
  }

  if (options.playwrightAuth) {
    lines.push(
      `- Visual auth: \`${options.playwrightAuth.strategy}\` from \`${options.playwrightAuth.path}\``
    );
  }

  return lines;
}
