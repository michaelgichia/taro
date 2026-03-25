import * as t from "@babel/types";

export function walkBabelAst(
  node: t.Node | null | undefined,
  visit: (node: t.Node) => void
): void {
  if (!node) {
    return;
  }

  visit(node);

  for (const key of t.VISITOR_KEYS[node.type] ?? []) {
    const value = (node as unknown as Record<string, unknown>)[key];
    if (Array.isArray(value)) {
      for (const entry of value) {
        if (entry && typeof entry === "object" && "type" in entry) {
          walkBabelAst(entry as t.Node, visit);
        }
      }
      continue;
    }

    if (value && typeof value === "object" && "type" in value) {
      walkBabelAst(value as t.Node, visit);
    }
  }
}

export function getStringLiteralValue(
  node?: t.Node | t.PrivateName | null
): string | null {
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

export function getJsxName(
  name: t.JSXIdentifier | t.JSXMemberExpression | t.JSXNamespacedName
): string | null {
  if (t.isJSXIdentifier(name)) {
    return name.name;
  }

  return null;
}

export function getCalleeName(node?: t.Node | null): string | undefined {
  if (!node) {
    return undefined;
  }

  if (t.isIdentifier(node)) {
    return node.name;
  }

  if (
    t.isMemberExpression(node) &&
    !node.computed &&
    t.isIdentifier(node.property)
  ) {
    return node.property.name;
  }

  return undefined;
}

export function getObjectPropertyNames(
  node: t.ObjectExpression | null | undefined
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
