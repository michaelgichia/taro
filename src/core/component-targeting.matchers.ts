import * as t from "@babel/types";
import { match, P } from "ts-pattern";

import type { InferredPropValue } from "#core/component-targeting.types.ts";
export { normalizeNullableText as normalizeText } from "#core/string-utils.ts";
import { normalizeNullableText as normalizeText } from "#core/string-utils.ts";

function getTemplateLiteralText(expression: t.TemplateLiteral): string | null {
  return normalizeText(
    expression.quasis.map((quasi) => quasi.value.cooked ?? "").join("")
  );
}

export function getStringAttributeValue(
  attribute?: t.JSXAttribute["value"] | null
): string | null {
  return match(attribute)
    .with(P.nullish, () => null)
    .with({ type: "StringLiteral" }, (value) => normalizeText(value.value))
    .with({ type: "JSXExpressionContainer" }, (container) =>
      match(container.expression)
        .with({ type: "StringLiteral" }, (value) => normalizeText(value.value))
        .with(
          {
            type: "TemplateLiteral",
            expressions: P.when(
              (expressions): expressions is [] => expressions.length === 0
            ),
          },
          (value) => getTemplateLiteralText(value)
        )
        .otherwise(() => null)
    )
    .otherwise(() => null);
}

export function collectLiteralText(node: t.Node | null | undefined): string {
  return match(node)
    .with(P.nullish, () => "")
    .with({ type: "JSXText" }, (value) => value.value)
    .with({ type: "StringLiteral" }, (value) => value.value)
    .with(
      {
        type: "TemplateLiteral",
        expressions: P.when(
          (expressions): expressions is [] => expressions.length === 0
        ),
      },
      (value) => value.quasis.map((quasi) => quasi.value.cooked ?? "").join("")
    )
    .with({ type: "JSXExpressionContainer" }, (container) =>
      collectLiteralText(container.expression)
    )
    .with({ type: "JSXElement" }, (element) =>
      element.children.map((child) => collectLiteralText(child)).join(" ")
    )
    .with({ type: "JSXFragment" }, (fragment) =>
      fragment.children.map((child) => collectLiteralText(child)).join(" ")
    )
    .otherwise(() => "");
}

export function collectReturnedJsxRoots(
  node: t.FunctionDeclaration | t.FunctionExpression | t.ArrowFunctionExpression
): Array<t.JSXElement | t.JSXFragment> {
  const roots: Array<t.JSXElement | t.JSXFragment> = [];

  const visitExpression = (
    expression: t.Expression | t.PrivateName | null | undefined
  ) => {
    match(expression)
      .with(P.nullish, () => undefined)
      .with({ type: "PrivateName" }, () => undefined)
      .with({ type: "JSXElement" }, (value) => roots.push(value))
      .with({ type: "JSXFragment" }, (value) => roots.push(value))
      .with({ type: "ConditionalExpression" }, (value) => {
        visitExpression(value.consequent);
        visitExpression(value.alternate);
      })
      .with({ type: "LogicalExpression" }, (value) => {
        visitExpression(value.right);
      })
      .with({ type: "SequenceExpression" }, (value) => {
        value.expressions.forEach((part) => visitExpression(part));
      })
      .with({ type: "ArrayExpression" }, (value) => {
        value.elements.forEach((part) => {
          if (part && t.isExpression(part)) {
            visitExpression(part);
          }
        });
      })
      .otherwise(() => undefined);
  };

  const visitStatement = (statement: t.Statement) => {
    match(statement)
      .with({ type: "ReturnStatement" }, (value) => {
        if (value.argument && t.isExpression(value.argument)) {
          visitExpression(value.argument);
        }
      })
      .with({ type: "BlockStatement" }, (value) => {
        value.body.forEach(visitStatement);
      })
      .with({ type: "IfStatement" }, (value) => {
        visitStatement(value.consequent);
        if (!value.alternate) {
          return;
        }

        if (t.isStatement(value.alternate)) {
          visitStatement(value.alternate);
          return;
        }

        if (t.isExpression(value.alternate)) {
          visitExpression(value.alternate);
        }
      })
      .with({ type: "SwitchStatement" }, (value) => {
        value.cases.forEach((switchCase) => {
          switchCase.consequent.forEach(visitStatement);
        });
      })
      .otherwise(() => undefined);
  };

  if (node.type === "ArrowFunctionExpression" && t.isExpression(node.body)) {
    visitExpression(node.body);
    return roots;
  }

  const body = node.body;
  if (!t.isBlockStatement(body)) {
    return roots;
  }

  body.body.forEach(visitStatement);
  return roots;
}

export function getComponentExpression(
  expression: t.Expression | null | undefined
): t.FunctionExpression | t.ArrowFunctionExpression | null {
  return match(expression)
    .with(P.nullish, () => null)
    .with({ type: "ArrowFunctionExpression" }, (value) => value)
    .with({ type: "FunctionExpression" }, (value) => value)
    .with(
      {
        type: "CallExpression",
        callee: { type: "Identifier", name: P.union("memo", "forwardRef") },
      },
      (value) => {
        const [firstArg] = value.arguments;
        return match(firstArg)
          .with({ type: "ArrowFunctionExpression" }, (fn) => fn)
          .with({ type: "FunctionExpression" }, (fn) => fn)
          .otherwise(() => null);
      }
    )
    .otherwise(() => null);
}

function toExpressionSource(
  source: string,
  node?: t.Node | null
): string | null {
  if (!node || typeof node.start !== "number" || typeof node.end !== "number") {
    return null;
  }

  return source.slice(node.start, node.end).trim();
}

function parseSimplePropComparison(
  expression: t.Expression,
  propNames: Set<string>,
  source: string
): { propName: string; valueExpression: string } | null {
  return match(expression)
    .with(
      { type: "BinaryExpression", operator: P.union("==", "===") },
      (value) => {
        if (t.isIdentifier(value.left) && propNames.has(value.left.name)) {
          const valueExpression = toExpressionSource(
            source,
            value.right as t.Expression
          );
          return valueExpression
            ? { propName: value.left.name, valueExpression }
            : null;
        }

        if (t.isIdentifier(value.right) && propNames.has(value.right.name)) {
          const valueExpression = toExpressionSource(
            source,
            value.left as t.Expression
          );
          return valueExpression
            ? { propName: value.right.name, valueExpression }
            : null;
        }

        return null;
      }
    )
    .otherwise(() => null);
}

export function extractDisplayText(params: {
  baseProps: Map<string, InferredPropValue>;
  expression: t.Expression;
  propNames: Set<string>;
  source: string;
}): string | null {
  const { baseProps, expression, propNames, source } = params;

  return match(expression)
    .with({ type: "StringLiteral" }, (value) => normalizeText(value.value))
    .with({ type: "NumericLiteral" }, (value) => String(value.value))
    .with(
      {
        type: "TemplateLiteral",
        expressions: P.when(
          (expressions): expressions is [] => expressions.length === 0
        ),
      },
      (value) => getTemplateLiteralText(value)
    )
    .with({ type: "TemplateLiteral" }, (value) => {
      let combined = "";
      for (let index = 0; index < value.quasis.length; index += 1) {
        combined += value.quasis[index]?.value.cooked ?? "";
        if (index >= value.expressions.length) {
          continue;
        }

        const part = extractDisplayText({
          baseProps,
          expression: value.expressions[index] as t.Expression,
          propNames,
          source,
        });
        if (part == null) {
          return null;
        }
        combined += part;
      }

      return normalizeText(combined);
    })
    .with({ type: "Identifier" }, (value) => {
      const propValue = baseProps.get(value.name)?.literalValue;
      return propValue == null ? null : String(propValue);
    })
    .with({ type: "ConditionalExpression" }, (value) => {
      const comparison = parseSimplePropComparison(
        value.test,
        propNames,
        source
      );
      if (!comparison) {
        return null;
      }

      const currentValue = baseProps.get(comparison.propName)?.expression;
      if (!currentValue) {
        return null;
      }

      return extractDisplayText({
        baseProps,
        expression:
          currentValue === comparison.valueExpression
            ? value.consequent
            : value.alternate,
        propNames,
        source,
      });
    })
    .with({ type: "LogicalExpression", operator: "??" }, (value) => {
      if (t.isIdentifier(value.left)) {
        const currentValue = baseProps.get(value.left.name);
        if (currentValue && currentValue.expression !== "undefined") {
          return currentValue.literalValue == null
            ? null
            : String(currentValue.literalValue);
        }
      }

      return extractDisplayText({
        baseProps,
        expression: value.right,
        propNames,
        source,
      });
    })
    .otherwise(() => null);
}

export function evaluateAttributeValue(params: {
  attributeValue?: t.JSXAttribute["value"] | null;
  baseProps: Map<string, InferredPropValue>;
  propNames: Set<string>;
  source: string;
}): string | null {
  const { attributeValue, baseProps, propNames, source } = params;

  return match(attributeValue)
    .with(P.nullish, () => null)
    .with({ type: "StringLiteral" }, (value) => normalizeText(value.value))
    .with({ type: "JSXExpressionContainer" }, (container) => {
      if (!t.isExpression(container.expression)) {
        return null;
      }

      return extractDisplayText({
        baseProps,
        expression: container.expression,
        propNames,
        source,
      });
    })
    .otherwise(() => null);
}
