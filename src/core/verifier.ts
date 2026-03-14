/**
 * Post-write syntax verification using Babel parser.
 * Ensures generated files parse successfully before reporting completion.
 */

import * as babelParser from "@babel/parser";

export interface VerificationResult {
  valid: boolean;
  error?: string;
}

function getPlugins(filePath: string): babelParser.ParserPlugin[] {
  if (filePath.endsWith(".tsx")) {
    return ["typescript", "jsx"];
  }

  if (filePath.endsWith(".ts")) {
    return ["typescript"];
  }

  return ["jsx"];
}

export function verifySyntax(
  code: string,
  filePath: string
): VerificationResult {
  try {
    babelParser.parse(code, {
      sourceType: "module",
      plugins: getPlugins(filePath),
    });

    return { valid: true };
  } catch (error) {
    return {
      valid: false,
      error: error instanceof Error ? error.message : "Unknown parse error",
    };
  }
}
