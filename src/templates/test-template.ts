/**
 * Code templates for RTL test structure.
 * Functions return string fragments for composing test files.
 */

import type { NormalizedAction } from "../types/recording.js";

export interface RenderTargetImport {
  symbol: string;
  importPath: string;
}

export interface RenderHelperImport {
  name: string;
  importPath: string;
  importKind: "named" | "default";
}

export interface ImportBlockOptions {
  renderTarget?: RenderTargetImport | null;
  renderHelper?: RenderHelperImport | null;
  jestDomImportPath?: string;
  needsWithin?: boolean;
  needsWaitFor?: boolean;
}

export function importBlock(
  hasUserEvents: boolean,
  importStyle: "esm" | "cjs" = "esm",
  options: ImportBlockOptions = {}
): string {
  const testingLibraryMembers = ["screen"];
  if (options.needsWaitFor) {
    testingLibraryMembers.push("waitFor");
  }
  if (options.needsWithin) {
    testingLibraryMembers.push("within");
  }
  if (!options.renderHelper) {
    testingLibraryMembers.unshift("render");
  }
  const jestDomImportPath =
    options.jestDomImportPath ?? "@testing-library/jest-dom";

  if (importStyle === "cjs") {
    const lines = [
      `const { ${testingLibraryMembers.join(", ")} } = require('@testing-library/react')`,
      `require('${jestDomImportPath}')`,
    ];
    if (hasUserEvents) {
      lines.push("const userEvent = require('@testing-library/user-event')");
    }
    if (options.renderTarget) {
      lines.push(
        `const ${options.renderTarget.symbol} = require('${options.renderTarget.importPath}').default`
      );
    }
    if (options.renderHelper) {
      const helperImport =
        options.renderHelper.importKind === "default"
          ? `require('${options.renderHelper.importPath}').default`
          : `require('${options.renderHelper.importPath}').${options.renderHelper.name}`;
      lines.push(`const ${options.renderHelper.name} = ${helperImport}`);
    }
    return lines.join("\n");
  }
  // ESM (default)
  const lines = [
    `import { ${testingLibraryMembers.join(", ")} } from '@testing-library/react'`,
    `import '${jestDomImportPath}'`,
  ];
  if (hasUserEvents) {
    lines.push("import userEvent from '@testing-library/user-event'");
  }
  if (options.renderTarget) {
    lines.push(
      `import ${options.renderTarget.symbol} from '${options.renderTarget.importPath}'`
    );
  }
  if (options.renderHelper) {
    lines.push(
      options.renderHelper.importKind === "default"
        ? `import ${options.renderHelper.name} from '${options.renderHelper.importPath}'`
        : `import { ${options.renderHelper.name} } from '${options.renderHelper.importPath}'`
    );
  }
  return lines.join("\n");
}

function escapeSingleQuote(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

function indentLines(text: string, spaces: number): string {
  const pad = " ".repeat(spaces);
  return text
    .split("\n")
    .map((line) => (line.trim() ? pad + line : ""))
    .join("\n");
}

export interface StepTemplateOptions {
  action: NormalizedAction;
  query: string;
  value?: string;
  matcher?: string; // context-aware matcher, e.g. '.toHaveValue()', '.toBeChecked()'
  checkpoint?: { reason: string; selector: string };
}

function sanitizeCommentText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function normalizeAssertionMatcher(matcher: string): string {
  if (matcher.startsWith(".")) {
    return /\)\s*$/u.test(matcher) ? matcher : `${matcher}()`;
  }

  return /\)\s*$/u.test(matcher) ? `.${matcher}` : `.${matcher}()`;
}

function needsAsyncAssertion(query: string): boolean {
  return /\.(?:find|findAll)By[A-Za-z]+\s*\(/u.test(query);
}

export function stepTemplate(opts: StepTemplateOptions): string {
  const { action, query, value = "" } = opts;
  const escapedValue = escapeSingleQuote(value);

  if (opts.checkpoint) {
    return [
      `// taro-query-checkpoint: ${action} step requires manual RTL query recovery`,
      `// selector: ${sanitizeCommentText(opts.checkpoint.selector)}`,
      `// reason: ${sanitizeCommentText(opts.checkpoint.reason)}`,
      "// TODO: replace this checkpoint with a trustworthy RTL query before keeping the generated test",
    ].join("\n");
  }

  switch (action) {
    case "click":
      return `await user.click(${query})`;

    case "fill":
      return [
        `await user.clear(${query})`,
        `await user.type(${query}, '${escapedValue}')`,
      ].join("\n");

    case "select":
      return `await user.selectOptions(${query}, '${escapedValue}')`;

    case "scroll":
      return `${query}.scrollIntoView()`;

    case "assert":
      return needsAsyncAssertion(query)
        ? `expect(await ${query})${opts.matcher ?? ".toBeInTheDocument()"}`
        : `expect(${query})${opts.matcher ?? ".toBeInTheDocument()"}`;

    case "navigate":
      return `// navigate: ${value || query}`;

    case "keyDown":
      return `await user.keyboard('${escapedValue}')`;

    case "unknown":
    default:
      return `// TODO: unsupported step — original selector: ${query}`;
  }
}

export function markerAssertionTemplate(opts: {
  queryExpression: string;
  matcher?: string;
}): string {
  return `expect(await ${opts.queryExpression})${normalizeAssertionMatcher(opts.matcher ?? "toBeVisible")}`;
}

/** Synchronous variant for use inside waitFor callbacks — uses getBy instead of findBy. */
export function markerAssertionTemplateSync(opts: {
  queryExpression: string;
  matcher?: string;
}): string {
  const syncQuery = opts.queryExpression
    .replace(/\.findBy/g, ".getBy")
    .replace(/\.findAllBy/g, ".getAllBy");
  return `expect(${syncQuery})${normalizeAssertionMatcher(opts.matcher ?? "toBeVisible")}`;
}

/** Wrap 2+ assertions in a single waitFor callback for atomic async verification. */
export function waitForAssertionBlock(assertions: string[]): string {
  const indented = assertions.map((a) => `  ${a}`).join("\n");
  return `await waitFor(() => {\n${indented}\n})`;
}

export function describeBlock(
  name: string,
  bodyLines: string[],
  hasUserEvents: boolean
): string {
  const body = bodyLines.join("\n");
  const indented = indentLines(body, 4);
  const setupLine = hasUserEvents ? `    const user = userEvent.setup()\n` : "";
  return [
    `describe('${escapeSingleQuote(name)}', () => {`,
    `  it('${escapeSingleQuote(name)}', async () => {`,
    `${setupLine}`,
    indented,
    `  })`,
    `})`,
  ].join("\n");
}

export interface ItBlockTemplate {
  name: string;
  stepLines: string[];
  hasUserEvents: boolean;
}

export interface HelperBlockTemplate {
  name: string;
  stepLines: string[];
}

export function helperBlock(block: HelperBlockTemplate): string {
  const indented = indentLines(block.stepLines.join("\n"), 2);
  return [
    `const ${block.name} = async (user: ReturnType<typeof userEvent.setup>) => {`,
    indented,
    `}`,
  ].join("\n");
}

export function describeBlockMultiIt(
  name: string,
  itBlocks: ItBlockTemplate[],
  options: {
    renderExpression?: string;
    renderFunctionName?: string;
    helpers?: HelperBlockTemplate[];
  } = {}
): string {
  const escapedName = escapeSingleQuote(name);
  const renderExpression = options.renderExpression ?? "<App />";
  const renderFunctionName = options.renderFunctionName ?? "render";
  const helperBlocks = (options.helpers ?? []).map((block) =>
    helperBlock(block)
  );
  const hasAnyUserEvents = itBlocks.some((block) => block.hasUserEvents);
  const setupBlock = [
    `const setup = () => {`,
    ...(hasAnyUserEvents ? [`  const user = userEvent.setup()`] : []),
    `  const renderResult = ${renderFunctionName}(${renderExpression})`,
    hasAnyUserEvents
      ? `  return { user, ...renderResult }`
      : `  return { ...renderResult }`,
    `}`,
  ].join("\n");
  const blocks = itBlocks.map((block) => {
    const setupLine = block.hasUserEvents
      ? `    const { user } = setup()\n`
      : `    setup()\n`;
    const indented = indentLines(block.stepLines.join("\n"), 4);
    return [
      `  it('${escapeSingleQuote(block.name)}', async () => {`,
      setupLine.trimEnd(),
      indented,
      `  })`,
    ].join("\n");
  });

  return [
    `describe('${escapedName}', () => {`,
    setupBlock,
    ...helperBlocks,
    ...blocks,
    `})`,
  ].join("\n\n");
}
