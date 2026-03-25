import { Node, Project, SyntaxKind, ts } from "ts-morph";

import { orderBy, uniqBy } from "#core/lodash.ts";
import { MAX_EVIDENCE, MAX_EXEMPLARS } from "#core/state.constants.ts";
import type { GeneratedTestQualityIndex } from "#core/state.types.ts";
import { extractMockTargets, findStages } from "#core/state-mock-analysis.ts";
import { toPosixPath, toProjectRelativeFilePath } from "#core/state-paths.ts";
import {
  getFileQualityWeight,
  getRelativeFileQualityWeight,
} from "#core/state-weighting.ts";
import type {
  TaroExemplarProfile,
  TaroFixtureRootKind,
  TaroFixtureRootProfile,
  TaroProviderWrapperProfile,
  TaroRenderHelperProfile,
  TaroSharedMockFactoryProfile,
} from "#types/state.ts";

export interface StateSourceFileInput {
  content: string;
  path: string;
}

interface StateImportBinding {
  local: string;
  imported: string;
  importPath: string;
  kind: "default" | "named";
}

interface ParsedStateSourceFile {
  calledIdentifiers: Set<string>;
  content: string;
  fileWeight: number;
  importBindings: StateImportBinding[];
  importsByLocal: Map<string, string>;
  path: string;
  relativePath: string;
  wrapperIdentifiers: string[];
}

export interface StateSourceInsights {
  exemplars: TaroExemplarProfile[];
  fixtureRoots: TaroFixtureRootProfile[];
  providerWrappers: TaroProviderWrapperProfile[];
  renderHelpers: TaroRenderHelperProfile[];
  sharedMockFactories: TaroSharedMockFactoryProfile[];
}

function createStateAnalysisProject(): Project {
  return new Project({
    useInMemoryFileSystem: true,
    skipAddingFilesFromTsConfig: true,
    skipFileDependencyResolution: true,
    skipLoadingLibFiles: true,
    compilerOptions: {
      allowJs: true,
      checkJs: false,
      jsx: ts.JsxEmit.Preserve,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      target: ts.ScriptTarget.ES2022,
    },
  });
}

function collectImportBindingsFromSourceFile(
  sourceFile: import("ts-morph").SourceFile
): StateImportBinding[] {
  const bindings: StateImportBinding[] = [];

  for (const declaration of sourceFile.getImportDeclarations()) {
    const importPath = declaration.getModuleSpecifierValue();
    const defaultImport = declaration.getDefaultImport();
    if (defaultImport) {
      bindings.push({
        local: defaultImport.getText(),
        imported: "default",
        importPath,
        kind: "default",
      });
    }

    for (const namedImport of declaration.getNamedImports()) {
      bindings.push({
        local: namedImport.getAliasNode()?.getText() ?? namedImport.getName(),
        imported: namedImport.getName(),
        importPath,
        kind: "named",
      });
    }
  }

  return bindings;
}

function parseStateSourceFile(
  project: Project,
  projectRoot: string,
  file: StateSourceFileInput,
  qualityIndex: GeneratedTestQualityIndex
): ParsedStateSourceFile {
  const relativePath = toProjectRelativeFilePath(projectRoot, file.path);
  let calledIdentifiers = new Set<string>();
  let importBindings: StateImportBinding[] = [];
  let wrapperIdentifiers: string[] = [];

  try {
    const sourceFile = project.createSourceFile(file.path, file.content, {
      overwrite: true,
    });
    importBindings = collectImportBindingsFromSourceFile(sourceFile);
    calledIdentifiers = new Set(
      sourceFile
        .getDescendantsOfKind(SyntaxKind.CallExpression)
        .map((callExpression) => callExpression.getExpression())
        .filter(Node.isIdentifier)
        .map((identifier) => identifier.getText())
    );
    wrapperIdentifiers = [
      ...sourceFile
        .getDescendantsOfKind(SyntaxKind.PropertyAssignment)
        .filter((property) => property.getName() === "wrapper")
        .map((property) => property.getInitializer())
        .filter(Node.isIdentifier)
        .map((identifier) => identifier.getText()),
      ...sourceFile
        .getDescendantsOfKind(SyntaxKind.ShorthandPropertyAssignment)
        .filter((property) => property.getName() === "wrapper")
        .map((property) => property.getName()),
    ];
  } catch {
    // Best-effort parsing: keep the file in the analysis even if the AST is partial.
  }

  return {
    calledIdentifiers,
    content: file.content,
    fileWeight: getRelativeFileQualityWeight(qualityIndex, relativePath),
    importBindings,
    importsByLocal: new Map(
      importBindings.map((binding) => [binding.local, binding.importPath])
    ),
    path: file.path,
    relativePath,
    wrapperIdentifiers,
  };
}

function isRenderHelperBinding(
  binding: Pick<StateImportBinding, "importPath" | "local">
): boolean {
  if (binding.importPath === "@testing-library/react") {
    return false;
  }

  return (
    binding.local === "render" ||
    /^render[A-Z]/.test(binding.local) ||
    binding.local === "renderWithProviders"
  );
}

function collectRenderHelpersFromParsedFiles(
  parsedFiles: ParsedStateSourceFile[]
): TaroRenderHelperProfile[] {
  const helpers = new Map<
    string,
    {
      bestSourceWeight: number;
      profile: TaroRenderHelperProfile;
      weightedUsage: number;
    }
  >();

  for (const file of parsedFiles) {
    const usesWithin =
      file.calledIdentifiers.has("within") || file.content.includes("within(");

    for (const binding of file.importBindings) {
      if (
        !isRenderHelperBinding(binding) ||
        !file.calledIdentifiers.has(binding.local)
      ) {
        continue;
      }

      const key = `${binding.local}|${binding.importPath}`;
      const existing = helpers.get(key);
      if (existing) {
        existing.profile.usageCount += 1;
        existing.profile.usesWithin = existing.profile.usesWithin || usesWithin;
        existing.weightedUsage += file.fileWeight;
        if (
          file.fileWeight > existing.bestSourceWeight ||
          (file.fileWeight === existing.bestSourceWeight &&
            file.relativePath.localeCompare(existing.profile.sourceTestFile) <
              0)
        ) {
          existing.profile.sourceTestFile = file.relativePath;
          existing.bestSourceWeight = file.fileWeight;
        }
        continue;
      }

      helpers.set(key, {
        bestSourceWeight: file.fileWeight,
        profile: {
          name: binding.local,
          importPath: binding.importPath,
          importKind: binding.kind,
          sourceTestFile: file.relativePath,
          usageCount: 1,
          usesWithin,
        },
        weightedUsage: file.fileWeight,
      });
    }
  }

  return orderBy(
    [...helpers.values()],
    [
      (entry) => entry.weightedUsage,
      (entry) => entry.profile.usageCount,
      (entry) => entry.profile.name,
      (entry) => entry.profile.importPath,
    ],
    ["desc", "desc", "asc", "asc"]
  )
    .map(({ profile }) => profile)
    .slice(0, MAX_EVIDENCE);
}

function collectProviderWrappersFromParsedFiles(
  parsedFiles: ParsedStateSourceFile[]
): TaroProviderWrapperProfile[] {
  const providers = new Map<
    string,
    {
      bestSourceWeight: number;
      count: number;
      profile: TaroProviderWrapperProfile;
      weightedSupport: number;
    }
  >();

  for (const file of parsedFiles) {
    for (const name of file.wrapperIdentifiers) {
      const importPath = file.importsByLocal.get(name);
      if (!importPath) {
        continue;
      }

      const key = `${name}|${importPath}`;
      const existing = providers.get(key);
      if (existing) {
        existing.count += 1;
        existing.weightedSupport += file.fileWeight;
        if (
          file.fileWeight > existing.bestSourceWeight ||
          (file.fileWeight === existing.bestSourceWeight &&
            file.relativePath.localeCompare(existing.profile.sourceTestFile) <
              0)
        ) {
          existing.profile.sourceTestFile = file.relativePath;
          existing.bestSourceWeight = file.fileWeight;
        }
        continue;
      }

      providers.set(key, {
        bestSourceWeight: file.fileWeight,
        count: 1,
        profile: { name, importPath, sourceTestFile: file.relativePath },
        weightedSupport: file.fileWeight,
      });
    }
  }

  return orderBy(
    [...providers.values()],
    [
      (entry) => entry.weightedSupport,
      (entry) => entry.count,
      (entry) => entry.profile.name,
      (entry) => entry.profile.importPath,
    ],
    ["desc", "desc", "asc", "asc"]
  ).map(({ profile }) => profile);
}

export function extractFixtureRootFromImport(
  importPath: string
): { kind: TaroFixtureRootKind; path: string } | null {
  const normalized = toPosixPath(importPath);
  const match = normalized.match(
    /^(.*?(mock-store|mocks|fixtures|factories))(?:\/.*)?$/
  );
  if (!match) {
    return null;
  }

  return { path: match[1]!, kind: match[2] as TaroFixtureRootKind };
}

function collectFixtureRootsFromParsedFiles(
  parsedFiles: ParsedStateSourceFile[]
): TaroFixtureRootProfile[] {
  const roots = uniqBy(
    parsedFiles.flatMap((file) =>
      file.importBindings
        .map((binding) => extractFixtureRootFromImport(binding.importPath))
        .filter(
          (root): root is { kind: TaroFixtureRootKind; path: string } =>
            root !== null
        )
        .map((root) => ({
          path: root.path,
          kind: root.kind,
          source: "import" as const,
        }))
    ),
    (root) => `${root.path}:${root.kind}:${root.source}`
  );

  return orderBy(roots, [(root) => root.path], ["asc"]);
}

function collectSharedMockFactoriesFromParsedFiles(
  parsedFiles: ParsedStateSourceFile[]
): TaroSharedMockFactoryProfile[] {
  const factories = new Map<
    string,
    {
      count: number;
      files: Set<string>;
      importPath: string;
      target: string;
      weightedSupport: number;
    }
  >();

  for (const file of parsedFiles) {
    for (const binding of file.importBindings) {
      if (!/(mock|fixture|factor)/i.test(binding.importPath)) {
        continue;
      }

      const key = `${binding.importPath}|${binding.local}`;
      const existing = factories.get(key);
      if (existing) {
        existing.files.add(file.relativePath);
        existing.count += 1;
        existing.weightedSupport += file.fileWeight;
        continue;
      }

      factories.set(key, {
        count: 1,
        files: new Set([file.relativePath]),
        importPath: binding.importPath,
        target: binding.local,
        weightedSupport: file.fileWeight,
      });
    }
  }

  return orderBy(
    [...factories.values()],
    [
      (entry) => entry.weightedSupport,
      (entry) => entry.count,
      (entry) => entry.target,
    ],
    ["desc", "desc", "asc"]
  )
    .map((entry) => ({
      target: entry.target,
      importPath: entry.importPath,
      files: [...entry.files].sort(),
      count: entry.count,
    }))
    .slice(0, MAX_EVIDENCE);
}

export function createExemplarTags(
  file: Pick<ParsedStateSourceFile, "calledIdentifiers" | "content">,
  helperNames: string[]
): string[] {
  const tags = new Set<string>();

  if (
    file.calledIdentifiers.has("within") ||
    file.content.includes("within(")
  ) {
    tags.add("dialog-scope");
  }
  if (helperNames.some((name) => file.calledIdentifiers.has(name))) {
    tags.add("render-helper");
  }
  if (extractMockTargets(file.content).length > 0) {
    tags.add("mocking");
  }
  if (findStages(file.content).length >= 2) {
    tags.add("mutation");
  }
  if (file.content.includes("userEvent.setup")) {
    tags.add("user-event");
  }

  return [...tags].sort();
}

function collectExemplarsFromParsedFiles(
  projectRoot: string,
  parsedFiles: ParsedStateSourceFile[],
  renderHelpers: TaroRenderHelperProfile[],
  qualityIndex: GeneratedTestQualityIndex
): TaroExemplarProfile[] {
  const helperNames = renderHelpers.map((helper) => helper.name);

  return orderBy(
    parsedFiles.map((file) => ({
      file: file.relativePath,
      tags: createExemplarTags(file, helperNames),
      weight: getFileQualityWeight(projectRoot, qualityIndex, file.path),
    })),
    [
      (entry) => entry.weight,
      (entry) => entry.tags.length,
      (entry) => entry.file,
    ],
    ["desc", "desc", "asc"]
  )
    .map(({ file, tags }) => ({ file, tags }))
    .slice(0, MAX_EXEMPLARS);
}

export function collectStateSourceInsights(
  projectRoot: string,
  testFiles: StateSourceFileInput[],
  qualityIndex: GeneratedTestQualityIndex = new Map()
): StateSourceInsights {
  const project = createStateAnalysisProject();
  const parsedFiles = testFiles.map((file) =>
    parseStateSourceFile(project, projectRoot, file, qualityIndex)
  );
  const renderHelpers = collectRenderHelpersFromParsedFiles(parsedFiles);

  return {
    renderHelpers,
    providerWrappers: collectProviderWrappersFromParsedFiles(parsedFiles),
    fixtureRoots: collectFixtureRootsFromParsedFiles(parsedFiles),
    sharedMockFactories: collectSharedMockFactoriesFromParsedFiles(parsedFiles),
    exemplars: collectExemplarsFromParsedFiles(
      projectRoot,
      parsedFiles,
      renderHelpers,
      qualityIndex
    ),
  };
}

export function collectRenderHelpers(
  projectRoot: string,
  testFiles: StateSourceFileInput[],
  qualityIndex: GeneratedTestQualityIndex = new Map()
): TaroRenderHelperProfile[] {
  return collectStateSourceInsights(projectRoot, testFiles, qualityIndex)
    .renderHelpers;
}

export function collectProviderWrappers(
  projectRoot: string,
  testFiles: StateSourceFileInput[],
  qualityIndex: GeneratedTestQualityIndex = new Map()
): TaroProviderWrapperProfile[] {
  return collectStateSourceInsights(projectRoot, testFiles, qualityIndex)
    .providerWrappers;
}

export function collectFixtureRootsFromImports(
  testFiles: StateSourceFileInput[]
): TaroFixtureRootProfile[] {
  const project = createStateAnalysisProject();
  const parsedFiles = testFiles.map((file) =>
    parseStateSourceFile(project, "", file, new Map())
  );

  return collectFixtureRootsFromParsedFiles(
    parsedFiles.map((file) => ({ ...file, relativePath: file.path }))
  );
}

export function collectSharedMockFactories(
  projectRoot: string,
  testFiles: StateSourceFileInput[],
  qualityIndex: GeneratedTestQualityIndex = new Map()
): TaroSharedMockFactoryProfile[] {
  return collectStateSourceInsights(projectRoot, testFiles, qualityIndex)
    .sharedMockFactories;
}

export function collectExemplars(
  projectRoot: string,
  testFiles: StateSourceFileInput[],
  renderHelpers: TaroRenderHelperProfile[],
  qualityIndex: GeneratedTestQualityIndex = new Map()
): TaroExemplarProfile[] {
  const project = createStateAnalysisProject();
  const parsedFiles = testFiles.map((file) =>
    parseStateSourceFile(project, projectRoot, file, qualityIndex)
  );

  return collectExemplarsFromParsedFiles(
    projectRoot,
    parsedFiles,
    renderHelpers,
    qualityIndex
  );
}
