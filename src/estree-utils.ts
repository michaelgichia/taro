interface EstreeLikeNode {
  callee?: EstreeLikeNode;
  name?: string;
  property?: EstreeLikeNode;
  type: string;
}

export function getEstreeCalleeName(callee: EstreeLikeNode): string {
  if (callee.type === "Identifier") {
    return callee.name || "";
  }
  if (callee.type === "MemberExpression" && callee.property) {
    return callee.property.name || "";
  }
  if (callee.type === "CallExpression" && callee.callee) {
    return getEstreeCalleeName(callee.callee);
  }
  return "";
}
