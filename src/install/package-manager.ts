import { access } from "node:fs/promises";
import { join } from "node:path";

export const SUPPORTED_PACKAGE_MANAGERS = [
  "npm",
  "pnpm",
  "yarn",
  "bun",
  "deno",
] as const;

export type PackageManager = (typeof SUPPORTED_PACKAGE_MANAGERS)[number];

export const DEFAULT_PACKAGE_MANAGER: PackageManager = "npm";

export interface PackageManagerDetection {
  packageManager: PackageManager;
  source: "user-agent" | "lockfile" | "default";
  evidence?: string;
}

/**
 * Lockfile names that identify a package manager.
 * Order matters when multiple lockfiles exist in the same directory: we prefer
 * pnpm > yarn > bun > deno > npm because that matches the precedence
 * teams typically use when migrating between managers.
 */
const LOCKFILES: ReadonlyArray<{ file: string; pm: PackageManager }> = [
  { file: "pnpm-lock.yaml", pm: "pnpm" },
  { file: "yarn.lock", pm: "yarn" },
  { file: "bun.lockb", pm: "bun" },
  { file: "bun.lock", pm: "bun" },
  { file: "deno.lock", pm: "deno" },
  { file: "package-lock.json", pm: "npm" },
  { file: "npm-shrinkwrap.json", pm: "npm" },
];

function parseUserAgent(userAgent: string | undefined): PackageManager | null {
  if (!userAgent) {
    return null;
  }

  // Format: "<pm>/<version> node/<version> ..." — npm, pnpm, yarn, bun follow this.
  const token = userAgent.split(" ")[0]?.split("/")[0]?.toLowerCase();

  if (!token) {
    return null;
  }

  if ((SUPPORTED_PACKAGE_MANAGERS as readonly string[]).includes(token)) {
    return token as PackageManager;
  }

  return null;
}

async function probeLockfile(
  cwd: string
): Promise<{ pm: PackageManager; file: string } | null> {
  for (const candidate of LOCKFILES) {
    try {
      await access(join(cwd, candidate.file));
      return { pm: candidate.pm, file: candidate.file };
    } catch {
      // Lockfile not present; continue probing.
    }
  }

  return null;
}

export interface DetectPackageManagerOptions {
  cwd?: string;
  userAgent?: string | undefined;
  denoEnv?: string | undefined;
}

/**
 * Detect the package manager the user invoked Taro with.
 *
 * Resolution order:
 * 1. `npm_config_user_agent` env var (set by npm, pnpm, yarn, bun).
 * 2. `DENO_VERSION` / process.env.DENO_VERSION (Deno doesn't set user-agent).
 * 3. Lockfile probe in `cwd`.
 * 4. Fallback to `npm`.
 */
export async function detectPackageManager(
  options: DetectPackageManagerOptions = {}
): Promise<PackageManagerDetection> {
  const cwd = options.cwd ?? process.cwd();
  const userAgent = options.userAgent ?? process.env.npm_config_user_agent;
  const denoEnv = options.denoEnv ?? process.env.DENO_VERSION;

  const fromUa = parseUserAgent(userAgent);
  if (fromUa) {
    return {
      packageManager: fromUa,
      source: "user-agent",
      evidence: userAgent,
    };
  }

  if (denoEnv) {
    return {
      packageManager: "deno",
      source: "user-agent",
      evidence: `DENO_VERSION=${denoEnv}`,
    };
  }

  const fromLockfile = await probeLockfile(cwd);
  if (fromLockfile) {
    return {
      packageManager: fromLockfile.pm,
      source: "lockfile",
      evidence: fromLockfile.file,
    };
  }

  return { packageManager: DEFAULT_PACKAGE_MANAGER, source: "default" };
}

const PACKAGE_NAME = "@tr-rtl/cli";

/**
 * Build the one-shot install/upgrade command for the given package manager.
 * `versionTag` defaults to `latest` so callers can pin if needed.
 */
export function dlxCommand(
  packageManager: PackageManager,
  versionTag = "latest"
): string {
  const spec = `${PACKAGE_NAME}@${versionTag}`;

  switch (packageManager) {
    case "npm":
      return `npx ${spec}`;
    case "pnpm":
      return `pnpm dlx ${spec}`;
    case "yarn":
      // yarn berry (>=2) supports `dlx`. Yarn classic (v1) users must use
      // `npx` instead; we document that in the install matrix.
      return `yarn dlx ${spec}`;
    case "bun":
      return `bunx ${spec}`;
    case "deno":
      return `deno run -A npm:${spec}`;
  }
}

/**
 * Map of every supported package manager to its dlx-equivalent command.
 * Used by docs/help surfaces that need to render the full matrix.
 */
export function allDlxCommands(
  versionTag = "latest"
): Record<PackageManager, string> {
  return Object.fromEntries(
    SUPPORTED_PACKAGE_MANAGERS.map((pm) => [pm, dlxCommand(pm, versionTag)])
  ) as Record<PackageManager, string>;
}
