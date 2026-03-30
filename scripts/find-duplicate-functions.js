#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { Node, Project, SyntaxKind, ts } from "ts-morph";

import { shouldRunAsMain } from "./script-runtime-utils.js";

const DEFAULT_LIMIT = 20;
const DEFAULT_MIN_BODY_LENGTH = 24;
const DEFAULT_SCOPES = ["src", "scripts", "tests"];
const SUPPORTED_EXTENSIONS = new Set([
  ".cjs",
  ".cts",
  ".js",
  ".jsx",
  ".mjs",
  ".mts",
  ".ts",
  ".tsx",
]);
const IGNORED_DIRECTORY_NAMES = new Set([
  ".git",
  ".taro",
  "coverage",
  "dist",
  "node_modules",
]);
const PRINTER = ts.createPrinter({
  newLine: ts.NewLineKind.LineFeed,
  removeComments: true,
});

export function getDuplicateIndexPath(rootDir) {
  return join(rootDir, ".taro", "function-dupes.json");
}

export function parseArgs(argv) {
  const options = {
    cached: false,
    json: false,
    limit: DEFAULT_LIMIT,
    minBodyLength: DEFAULT_MIN_BODY_LENGTH,
    rootDir: null,
    scopes: [...DEFAULT_SCOPES],
    dbPath: null,
    name: null,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const nextValue = () => {
      const value = argv[index + 1];
      if (!value) {
        throw new Error(`Missing value for ${arg}`);
      }
      index += 1;
      return value;
    };

    if (arg === "--cached") {
      options.cached = true;
      continue;
    }

    if (arg === "--json") {
      options.json = true;
      continue;
    }

    if (arg === "--root") {
      options.rootDir = nextValue();
      continue;
    }

    if (arg === "--db") {
      options.dbPath = nextValue();
      continue;
    }

    if (arg === "--name") {
      options.name = nextValue();
      continue;
    }

    if (arg === "--limit") {
      options.limit = Number.parseInt(nextValue(), 10);
      continue;
    }

    if (arg === "--min-body-length") {
      options.minBodyLength = Number.parseInt(nextValue(), 10);
      continue;
    }

    if (arg === "--scope") {
      const raw = nextValue();
      options.scopes = raw
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean);
      continue;
    }

    if (arg === "--help" || arg === "-h") {
      options.help = true;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  if (!Number.isFinite(options.limit) || options.limit < 1) {
    throw new Error("--limit must be a positive integer");
  }
  if (!Number.isFinite(options.minBodyLength) || options.minBodyLength < 0) {
    throw new Error("--min-body-length must be zero or greater");
  }

  return options;
}

export function getHelpText() {
  return [
    "Usage: node scripts/find-duplicate-functions.js [options]",
    "",
    "Options:",
    "  --root <path>             Project root to scan (defaults to repo root)",
    "  --db <path>               Override the cache index path",
    "  --scope <dirs>            Comma-separated directories to scan (default: src,scripts,tests)",
    "  --name <functionName>     Limit results to a specific extracted function name",
    "  --limit <count>           Max duplicate groups to print (default: 20)",
    "  --min-body-length <n>     Skip tiny functions shorter than n chars after normalization (default: 24)",
    "  --cached                  Query the existing index without refreshing files",
    "  --json                    Print JSON instead of human-readable text",
    "  --help                    Show this message",
    "",
    "Warm-cache path:",
    "  Run once without --cached to refresh the index, then use --cached for a query-only path.",
  ].join("\n");
}

function normalizeWhitespace(value) {
  return value.replace(/\s+/g, " ").trim();
}

function hashText(value) {
  return createHash("sha256").update(value).digest("hex");
}

function isSupportedSourceFile(filePath) {
  const extension = extname(filePath);
  return SUPPORTED_EXTENSIONS.has(extension) && !filePath.endsWith(".d.ts");
}

async function walkDirectory(rootDir, relativeDir, files, readdirImpl) {
  const absoluteDir = join(rootDir, relativeDir);
  let entries;
  try {
    entries = await readdirImpl(absoluteDir, { withFileTypes: true });
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      return;
    }
    throw error;
  }

  for (const entry of entries) {
    const nextRelativePath = join(relativeDir, entry.name);
    if (entry.isDirectory()) {
      if (IGNORED_DIRECTORY_NAMES.has(entry.name)) {
        continue;
      }
      await walkDirectory(rootDir, nextRelativePath, files, readdirImpl);
      continue;
    }

    if (!entry.isFile()) {
      continue;
    }

    if (isSupportedSourceFile(nextRelativePath)) {
      files.push(nextRelativePath);
    }
  }
}

export async function collectSourceFiles(
  rootDir,
  scopes = DEFAULT_SCOPES,
  options = {}
) {
  const readdirImpl = options.readdirImpl ?? readdir;
  const files = [];

  for (const scope of scopes) {
    await walkDirectory(rootDir, scope, files, readdirImpl);
  }

  return files.sort();
}

function buildProject() {
  return new Project({
    compilerOptions: {
      allowJs: true,
      checkJs: false,
      jsx: ts.JsxEmit.Preserve,
      target: ts.ScriptTarget.ESNext,
    },
    skipAddingFilesFromTsConfig: true,
  });
}

function getOwnerName(node) {
  if (
    Node.isMethodDeclaration(node) ||
    Node.isGetAccessorDeclaration(node) ||
    Node.isSetAccessorDeclaration(node)
  ) {
    const classDeclaration = node.getFirstAncestorByKind(
      SyntaxKind.ClassDeclaration
    );
    const methodName = node.getName();
    if (classDeclaration?.getName()) {
      return `${classDeclaration.getName()}.${methodName}`;
    }
    return methodName;
  }

  const parent = node.getParent();
  if (Node.isVariableDeclaration(parent)) {
    return parent.getName();
  }
  if (Node.isPropertyAssignment(parent)) {
    return parent.getName();
  }
  if (
    Node.isBinaryExpression(parent) &&
    parent.getOperatorToken().getText() === "="
  ) {
    return parent.getLeft().getText();
  }

  return null;
}

function getFunctionRecord(node, rootDir) {
  const body = node.getBody?.();
  if (!body) {
    return null;
  }

  const sourceFile = node.getSourceFile();
  const normalizedBody = normalizeWhitespace(
    PRINTER.printNode(
      ts.EmitHint.Unspecified,
      body.compilerNode,
      sourceFile.compilerNode
    )
  );
  if (!normalizedBody) {
    return null;
  }

  const name =
    (Node.isFunctionDeclaration(node) ? node.getName() : null) ??
    getOwnerName(node);
  if (!name) {
    return null;
  }

  let kind = "function";
  if (Node.isFunctionDeclaration(node)) {
    kind = "function-declaration";
  } else if (Node.isArrowFunction(node)) {
    kind = "arrow-function";
  } else if (Node.isFunctionExpression(node)) {
    kind = "function-expression";
  } else if (Node.isMethodDeclaration(node)) {
    kind = "method";
  } else if (Node.isGetAccessorDeclaration(node)) {
    kind = "get-accessor";
  } else if (Node.isSetAccessorDeclaration(node)) {
    kind = "set-accessor";
  }

  return {
    bodyText: normalizedBody,
    endLine: node.getEndLineNumber(),
    filePath: relative(rootDir, sourceFile.getFilePath()),
    kind,
    name,
    normalizedHash: hashText(normalizedBody),
    rawHash: hashText(normalizeWhitespace(body.getText())),
    startLine: node.getStartLineNumber(),
  };
}

export function extractFunctionRecords(sourceFile, rootDir, options = {}) {
  const minBodyLength = options.minBodyLength ?? DEFAULT_MIN_BODY_LENGTH;
  const records = [];

  sourceFile.forEachDescendant((node) => {
    if (
      !Node.isFunctionDeclaration(node) &&
      !Node.isFunctionExpression(node) &&
      !Node.isArrowFunction(node) &&
      !Node.isMethodDeclaration(node) &&
      !Node.isGetAccessorDeclaration(node) &&
      !Node.isSetAccessorDeclaration(node)
    ) {
      return;
    }

    const record = getFunctionRecord(node, rootDir);
    if (!record || record.bodyText.length < minBodyLength) {
      return;
    }
    records.push(record);
  });

  return records;
}

function getEmptyIndex() {
  return { functionIndex: [], indexedFiles: {}, version: 1 };
}

async function readIndexFile(indexPath, readFileImpl = readFile) {
  try {
    const payload = await readFileImpl(indexPath, "utf-8");
    const parsed = JSON.parse(payload);

    return {
      functionIndex: Array.isArray(parsed?.functionIndex)
        ? parsed.functionIndex
        : [],
      indexedFiles:
        parsed?.indexedFiles &&
        typeof parsed.indexedFiles === "object" &&
        !Array.isArray(parsed.indexedFiles)
          ? parsed.indexedFiles
          : {},
      version: Number(parsed?.version) || 1,
    };
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      return getEmptyIndex();
    }
    throw error;
  }
}

async function writeIndexFile(indexPath, index, writeFileImpl = writeFile) {
  await writeFileImpl(indexPath, JSON.stringify(index, null, 2), "utf-8");
}

function getIndexedFiles(index) {
  return new Map(
    Object.entries(index.indexedFiles).map(([filePath, value]) => [
      filePath,
      { mtimeMs: Number(value?.mtimeMs ?? 0), size: Number(value?.size ?? 0) },
    ])
  );
}

function buildFunctionBuckets(index) {
  const buckets = new Map();

  for (const record of index.functionIndex) {
    if (!record?.filePath || !record?.normalizedHash || !record?.bodyText) {
      continue;
    }

    const normalizedRecord = {
      bodyText: String(record.bodyText),
      endLine: Number(record.endLine),
      filePath: String(record.filePath),
      kind: String(record.kind),
      name: String(record.name),
      normalizedHash: String(record.normalizedHash),
      rawHash: String(record.rawHash),
      startLine: Number(record.startLine),
    };

    const fileRecords = buckets.get(normalizedRecord.filePath) ?? [];
    fileRecords.push(normalizedRecord);
    buckets.set(normalizedRecord.filePath, fileRecords);
  }

  return buckets;
}

function serializeIndex(indexedFiles, functionBuckets) {
  const functionIndex = [...functionBuckets.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .flatMap(([, records]) =>
      [...records].sort(
        (left, right) =>
          left.startLine - right.startLine || left.endLine - right.endLine
      )
    );

  return {
    functionIndex,
    indexedFiles: Object.fromEntries(
      [...indexedFiles.entries()].sort(([left], [right]) =>
        left.localeCompare(right)
      )
    ),
    version: 1,
  };
}

function queryDuplicateGroups(functionBuckets, options = {}) {
  const groups = new Map();

  for (const records of functionBuckets.values()) {
    for (const record of records) {
      if (options.name && record.name !== options.name) {
        continue;
      }

      const group = groups.get(record.normalizedHash) ?? {
        filePaths: new Set(),
        normalizedHash: record.normalizedHash,
        occurrenceCount: 0,
        occurrences: [],
        preview: record.bodyText,
      };

      group.filePaths.add(record.filePath);
      group.occurrenceCount += 1;
      group.occurrences.push({
        endLine: record.endLine,
        filePath: record.filePath,
        kind: record.kind,
        name: record.name,
        startLine: record.startLine,
      });
      groups.set(record.normalizedHash, group);
    }
  }

  return [...groups.values()]
    .filter((group) => group.occurrenceCount > 1 && group.filePaths.size > 1)
    .map((group) => ({
      fileCount: group.filePaths.size,
      normalizedHash: group.normalizedHash,
      occurrenceCount: group.occurrenceCount,
      occurrences: group.occurrences.sort(
        (left, right) =>
          left.filePath.localeCompare(right.filePath) ||
          left.startLine - right.startLine
      ),
      preview: group.preview,
    }))
    .sort(
      (left, right) =>
        right.fileCount - left.fileCount ||
        right.occurrenceCount - left.occurrenceCount ||
        left.normalizedHash.localeCompare(right.normalizedHash)
    )
    .slice(0, options.limit ?? DEFAULT_LIMIT);
}

export async function findDuplicateFunctions(options = {}) {
  const scriptRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
  const rootDir = resolve(options.rootDir ?? scriptRoot);
  const dbPath = resolve(options.dbPath ?? getDuplicateIndexPath(rootDir));
  await mkdir(dirname(dbPath), { recursive: true });
  const index = await readIndexFile(dbPath, options.indexReadFileImpl);
  const indexedFilesByPath = getIndexedFiles(index);
  const functionBuckets = buildFunctionBuckets(index);

  let indexedFiles = 0;
  let refreshedFiles = 0;
  let removedFiles = 0;

  if (!options.cached) {
    const sourceFiles = await collectSourceFiles(
      rootDir,
      options.scopes ?? DEFAULT_SCOPES,
      { readdirImpl: options.readdirImpl }
    );
    const statImpl = options.statImpl ?? stat;
    const sourceReadFileImpl = options.readFileImpl ?? readFile;
    const currentFiles = new Map();

    for (const relativePath of sourceFiles) {
      const info = await statImpl(join(rootDir, relativePath));
      currentFiles.set(relativePath, {
        mtimeMs: Math.trunc(info.mtimeMs),
        size: info.size,
      });
    }

    const deletedFiles = [...indexedFilesByPath.keys()].filter(
      (filePath) => !currentFiles.has(filePath)
    );
    const changedFiles = [...currentFiles.entries()]
      .filter(([filePath, info]) => {
        const existing = indexedFilesByPath.get(filePath);
        return (
          !existing ||
          existing.mtimeMs !== info.mtimeMs ||
          existing.size !== info.size
        );
      })
      .map(([filePath]) => filePath);

    for (const filePath of deletedFiles) {
      indexedFilesByPath.delete(filePath);
      functionBuckets.delete(filePath);
    }

    const project = buildProject();
    for (const filePath of changedFiles) {
      const absolutePath = join(rootDir, filePath);
      const contents = await sourceReadFileImpl(absolutePath, "utf-8");
      const sourceFile = project.createSourceFile(absolutePath, contents, {
        overwrite: true,
      });
      const records = extractFunctionRecords(sourceFile, rootDir, {
        minBodyLength: options.minBodyLength,
      });

      indexedFilesByPath.set(filePath, currentFiles.get(filePath));
      functionBuckets.set(filePath, records);
    }

    await writeIndexFile(
      dbPath,
      serializeIndex(indexedFilesByPath, functionBuckets),
      options.indexWriteFileImpl
    );

    indexedFiles = currentFiles.size;
    refreshedFiles = changedFiles.length;
    removedFiles = deletedFiles.length;
  } else {
    indexedFiles = indexedFilesByPath.size;
  }

  const duplicateGroups = queryDuplicateGroups(functionBuckets, {
    limit: options.limit ?? DEFAULT_LIMIT,
    name: options.name ?? null,
  });

  return {
    cached: Boolean(options.cached),
    dbPath,
    duplicateGroups,
    indexedFiles,
    refreshedFiles,
    removedFiles,
    rootDir,
  };
}

function truncatePreview(value, maxLength = 96) {
  if (value.length <= maxLength) {
    return value;
  }
  return `${value.slice(0, maxLength - 1)}…`;
}

export function formatDuplicateFunctionReport(result) {
  const dbPathLabel = relative(result.rootDir, result.dbPath) || result.dbPath;
  const lines = [`[taro] Duplicate function index: ${dbPathLabel}`];

  if (result.cached) {
    lines.push(
      `[taro] Query mode: cached (${result.indexedFiles} indexed file(s))`
    );
  } else {
    lines.push(
      `[taro] Refreshed ${result.refreshedFiles} file(s), removed ${result.removedFiles}, indexed ${result.indexedFiles}`
    );
  }

  if (result.duplicateGroups.length === 0) {
    lines.push("[taro] No cross-file duplicate functions found.");
    return lines.join("\n");
  }

  lines.push(
    `[taro] Found ${result.duplicateGroups.length} duplicate group(s). Re-run with --cached for a query-only path.`
  );

  for (const [index, group] of result.duplicateGroups.entries()) {
    lines.push(
      `${index + 1}. ${group.occurrenceCount} occurrence(s) across ${group.fileCount} file(s)`
    );
    lines.push(`   body: ${truncatePreview(group.preview)}`);
    for (const occurrence of group.occurrences) {
      lines.push(
        `   - ${occurrence.filePath}:${occurrence.startLine}-${occurrence.endLine} ${occurrence.name} [${occurrence.kind}]`
      );
    }
  }

  return lines.join("\n");
}

export async function main(argv = process.argv.slice(2), io = {}) {
  const stdout = io.stdout ?? process.stdout;
  const stderr = io.stderr ?? process.stderr;

  try {
    const args = parseArgs(argv);
    if (args.help) {
      stdout.write(`${getHelpText()}\n`);
      return 0;
    }

    const result = await findDuplicateFunctions(args);
    const output = args.json
      ? JSON.stringify(result, null, 2)
      : formatDuplicateFunctionReport(result);
    stdout.write(`${output}\n`);
    return 0;
  } catch (error) {
    stderr.write(
      `[taro] Duplicate function scan failed: ${error instanceof Error ? error.message : String(error)}\n`
    );
    return 1;
  }
}

if (shouldRunAsMain(process.argv[1], import.meta.url)) {
  const exitCode = await main();
  if (exitCode !== 0) {
    process.exit(exitCode);
  }
}
