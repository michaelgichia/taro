import * as babelParser from "@babel/parser";
import * as t from "@babel/types";
import { describe, expect, it } from "vitest";

import {
  collectReturnedJsxRoots,
  evaluateAttributeValue,
  extractDisplayText,
} from "#core/component-targeting.matchers.ts";

const AST_PLUGINS: babelParser.ParserPlugin[] = [
  "jsx",
  "typescript",
  "classProperties",
  "classPrivateProperties",
  "classPrivateMethods",
  "topLevelAwait",
];

function parseExpression(source: string): t.Expression {
  return babelParser.parseExpression(source, {
    plugins: AST_PLUGINS,
  }) as t.Expression;
}

function parseFunction(
  source: string
): t.FunctionDeclaration | t.FunctionExpression | t.ArrowFunctionExpression {
  const ast = babelParser.parse(source, {
    sourceType: "module",
    plugins: AST_PLUGINS,
  });
  const node = ast.program.body[0];
  if (!node || !t.isFunctionDeclaration(node)) {
    throw new Error("Expected a function declaration");
  }

  return node;
}

function getHrefAttribute(
  source: string
): t.JSXAttribute["value"] | null | undefined {
  const ast = babelParser.parse(source, {
    sourceType: "module",
    plugins: AST_PLUGINS,
  });
  const statement = ast.program.body[0];
  if (
    !statement ||
    !t.isVariableDeclaration(statement) ||
    statement.declarations.length === 0
  ) {
    throw new Error("Expected a variable declaration");
  }

  const initializer = statement.declarations[0]?.init;
  if (!initializer || !t.isJSXElement(initializer)) {
    throw new Error("Expected a JSX element initializer");
  }

  return initializer.openingElement.attributes.find(
    (attribute): attribute is t.JSXAttribute =>
      t.isJSXAttribute(attribute) &&
      t.isJSXIdentifier(attribute.name) &&
      attribute.name.name === "href"
  )?.value;
}

describe("component-targeting matchers", () => {
  it("extracts display text from prop comparisons and template literals", () => {
    const expressionSource =
      "kind === 'business' ? `Account ${name}` : 'Personal'";
    const text = extractDisplayText({
      baseProps: new Map([
        ["kind", { expression: "'business'", literalValue: "business" }],
        ["name", { expression: "'Ada'", literalValue: "Ada" }],
      ]),
      expression: parseExpression(expressionSource),
      propNames: new Set(["kind", "name"]),
      source: expressionSource,
    });

    expect(text).toBe("Account Ada");
  });

  it("evaluates attribute values with nullish fallback expressions", () => {
    const source =
      "const link = <a href={profileHref ?? '/profiles'}>Open</a>;";
    const value = evaluateAttributeValue({
      attributeValue: getHrefAttribute(source),
      baseProps: new Map(),
      propNames: new Set(["profileHref"]),
      source,
    });

    expect(value).toBe("/profiles");
  });

  it("collects returned JSX roots across blocks, conditionals, and arrays", () => {
    const node = parseFunction(`
      function Example(show: boolean) {
        if (show) {
          return <Header />;
        }

        return [<span key="one">One</span>, show && <button>Go</button>];
      }
    `);

    const roots = collectReturnedJsxRoots(node);

    expect(roots).toHaveLength(3);
    expect(roots.every((root) => t.isJSXElement(root))).toBe(true);
  });
});
