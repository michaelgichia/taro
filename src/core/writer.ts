/**
 * Test file filesystem writing
 * Writes generated test code to the filesystem with proper naming and safety checks.
 */

import { access, mkdir, writeFile } from "node:fs/promises";
import { dirname, extname, resolve } from "node:path";

interface WriteOptions {
  createDir?: boolean;
  overwriteExisting?: boolean;
}

interface WriteResult {
  filePath: string;
  created: boolean;
  overwritten: boolean;
}

function isValidTestPath(filePath: string): boolean {
  const base = filePath.replace(/\?.*$/, "");
  return (
    base.endsWith(".test.ts") ||
    base.endsWith(".test.tsx") ||
    base.endsWith(".spec.ts") ||
    base.endsWith(".spec.tsx")
  );
}

export async function writeTestFile(
  content: string,
  outputPath: string,
  options: WriteOptions = {}
): Promise<WriteResult> {
  const { createDir = true, overwriteExisting = false } = options;
  const resolvedPath = resolve(outputPath);

  if (!isValidTestPath(resolvedPath)) {
    const ext = extname(resolvedPath);
    throw new Error(
      `Output file must have a test extension (.test.ts, .test.tsx, .spec.ts, .spec.tsx). Got: "${ext || "(no extension)"}"`
    );
  }

  const dir = dirname(resolvedPath);
  if (createDir) {
    await mkdir(dir, { recursive: true });
  }

  let fileExists = false;
  try {
    await access(resolvedPath);
    fileExists = true;
  } catch {
    // ENOENT — file does not exist, proceed
  }

  if (fileExists && !overwriteExisting) {
    throw new Error(
      `Output file already exists: ${resolvedPath}\nDelete or rename it before generating again.`
    );
  }

  await writeFile(resolvedPath, content, "utf-8");

  return {
    filePath: resolvedPath,
    created: !fileExists,
    overwritten: fileExists,
  };
}
