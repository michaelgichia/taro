import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";

import { getProjectStatePath } from "#project-state.ts";

export type DirectoryLoopStatus = "pending" | "in-progress" | "completed";
export type DirectoryLoopEntryKind = "target" | "regrade";

export interface DirectoryLoopTrackerEntry {
  componentPath: string;
  currentScoreThreshold: number | null;
  followUpComments: string[];
  kind: DirectoryLoopEntryKind;
  outputPath: string;
  status: DirectoryLoopStatus;
  updatedScoreThreshold: number | null;
}

export interface DirectoryLoopTracker {
  createdAt: string;
  directoryPath: string;
  entries: DirectoryLoopTrackerEntry[];
  trackerPath: string;
  updatedAt: string;
}

function toDisplayPath(projectRoot: string, targetPath: string): string {
  const relativePath = relative(projectRoot, targetPath);
  if (
    relativePath &&
    relativePath !== "" &&
    !relativePath.startsWith("..") &&
    !relativePath.startsWith("../") &&
    !relativePath.startsWith("..\\")
  ) {
    return relativePath.replaceAll("\\", "/");
  }

  if (relativePath === "") {
    return ".";
  }

  return resolve(targetPath).replaceAll("\\", "/");
}

function toTrackerBasename(projectRoot: string, directoryPath: string): string {
  const displayPath = toDisplayPath(projectRoot, directoryPath);
  if (displayPath === ".") {
    return "root";
  }

  return (
    displayPath
      .replaceAll("/", "__")
      .replaceAll("\\", "__")
      .replace(/[^A-Za-z0-9._-]+/gu, "-")
      .replace(/^-+|-+$/gu, "") || "root"
  );
}

export function getDirectoryLoopTrackerPath(
  projectRoot: string,
  directoryPath: string
): string {
  return getProjectStatePath(
    projectRoot,
    "directory-loop",
    `${toTrackerBasename(projectRoot, directoryPath)}.md`
  );
}

export function createDirectoryLoopTracker(params: {
  createdAt?: string;
  directoryPath: string;
  entries: Array<{
    componentPath: string;
    currentScoreThreshold?: number | null;
    followUpComments?: string[];
    kind?: DirectoryLoopEntryKind;
    outputPath: string;
    status?: DirectoryLoopStatus;
    updatedScoreThreshold?: number | null;
  }>;
  projectRoot: string;
}): DirectoryLoopTracker {
  const createdAt = params.createdAt ?? new Date().toISOString();

  return {
    createdAt,
    directoryPath: toDisplayPath(params.projectRoot, params.directoryPath),
    entries: params.entries
      .map((entry) => ({
        componentPath: toDisplayPath(params.projectRoot, entry.componentPath),
        currentScoreThreshold: entry.currentScoreThreshold ?? null,
        followUpComments: entry.followUpComments ?? [],
        kind: entry.kind ?? "target",
        outputPath: toDisplayPath(params.projectRoot, entry.outputPath),
        status: entry.status ?? "pending",
        updatedScoreThreshold: entry.updatedScoreThreshold ?? null,
      }))
      .sort((left, right) =>
        left.componentPath.localeCompare(right.componentPath)
      ),
    trackerPath: getDirectoryLoopTrackerPath(
      params.projectRoot,
      params.directoryPath
    ),
    updatedAt: createdAt,
  };
}

function formatScoreThreshold(value: number | null): string {
  return value === null ? "-" : `${value}%`;
}

function formatFollowUpComments(comments: string[]): string {
  if (comments.length === 0) {
    return "-";
  }

  return comments
    .map((comment) => comment.replaceAll("|", "/").trim())
    .filter((comment) => comment.length > 0)
    .join("<br>");
}

function parseScoreThreshold(rawValue: string | undefined): number | null {
  const trimmed = rawValue?.trim();
  const parsed =
    trimmed && trimmed !== "-"
      ? Number.parseFloat(trimmed.replace(/%$/u, ""))
      : null;

  return Number.isFinite(parsed) ? parsed : null;
}

function parseFollowUpComments(rawValue: string | undefined): string[] {
  const trimmed = rawValue?.trim();
  if (!trimmed || trimmed === "-") {
    return [];
  }

  return trimmed
    .split(/<br\s*\/?>/iu)
    .map((comment) => comment.trim())
    .filter((comment) => comment.length > 0);
}

export function updateDirectoryLoopTrackerEntry(
  tracker: DirectoryLoopTracker,
  params: {
    componentPath: string;
    currentScoreThreshold?: number | null;
    followUpComments?: string[];
    projectRoot: string;
    status?: DirectoryLoopStatus;
    updatedAt?: string;
    updatedScoreThreshold?: number | null;
  }
): DirectoryLoopTracker {
  const targetPath = toDisplayPath(params.projectRoot, params.componentPath);

  return {
    ...tracker,
    entries: tracker.entries.map((entry) => {
      if (entry.componentPath === targetPath) {
        return {
          ...entry,
          currentScoreThreshold:
            params.currentScoreThreshold ?? entry.currentScoreThreshold,
          followUpComments: params.followUpComments ?? entry.followUpComments,
          status: params.status ?? entry.status,
          updatedScoreThreshold:
            params.updatedScoreThreshold ?? entry.updatedScoreThreshold,
        };
      }

      if (params.status === "in-progress" && entry.status === "in-progress") {
        return { ...entry, status: "pending" };
      }

      return entry;
    }),
    updatedAt: params.updatedAt ?? new Date().toISOString(),
  };
}

export function updateDirectoryLoopTrackerStatus(
  tracker: DirectoryLoopTracker,
  params: {
    componentPath: string;
    projectRoot: string;
    status: DirectoryLoopStatus;
    updatedAt?: string;
  }
): DirectoryLoopTracker {
  return updateDirectoryLoopTrackerEntry(tracker, params);
}

export function renderDirectoryLoopTrackerMarkdown(
  tracker: DirectoryLoopTracker
): string {
  const counts = tracker.entries.reduce(
    (accumulator, entry) => {
      accumulator.total += 1;
      if (entry.status === "pending") {
        accumulator.pending += 1;
      } else if (entry.status === "in-progress") {
        accumulator.inProgress += 1;
      } else {
        accumulator.completed += 1;
      }
      return accumulator;
    },
    { completed: 0, inProgress: 0, pending: 0, total: 0 }
  );

  const rows =
    tracker.entries.length === 0
      ? ["| pending | (none) | - | - | - | - | - |"]
      : tracker.entries.map(
          (entry) =>
            `| ${entry.status} | ${entry.componentPath} | ${entry.outputPath} | ${formatScoreThreshold(entry.currentScoreThreshold)} | ${formatScoreThreshold(entry.updatedScoreThreshold)} | ${formatFollowUpComments(entry.followUpComments)} | ${entry.kind} |`
        );

  return [
    "# Taro Directory Loop Tracker",
    "",
    `- Directory: ${tracker.directoryPath}`,
    `- Updated: ${tracker.updatedAt}`,
    `- Total components: ${counts.total}`,
    `- Pending: ${counts.pending}`,
    `- In progress: ${counts.inProgress}`,
    `- Completed: ${counts.completed}`,
    "",
    "| Status | Path | Output | Current score | Updated score | Follow-up | Kind |",
    "| --- | --- | --- | --- | --- | --- | --- |",
    ...rows,
    "",
  ].join("\n");
}

function parseDirectoryLoopTrackerMarkdown(params: {
  content: string;
  directoryPath: string;
  projectRoot: string;
  trackerPath: string;
}): DirectoryLoopTracker {
  const lines = params.content.split(/\r?\n/u);
  const directoryPath =
    lines
      .find((line) => line.startsWith("- Directory: "))
      ?.slice("- Directory: ".length)
      .trim() || toDisplayPath(params.projectRoot, params.directoryPath);
  const updatedAt =
    lines
      .find((line) => line.startsWith("- Updated: "))
      ?.slice("- Updated: ".length)
      .trim() || new Date().toISOString();
  const entries: DirectoryLoopTrackerEntry[] = [];

  for (const line of lines) {
    const completeMatch = line.match(
      /^\| (pending|in-progress|completed) \| (.+) \| (.+) \| (.+) \| (.+) \| (.+) \| (target|regrade) \|$/u
    );
    const extendedMatch = line.match(
      /^\| (pending|in-progress|completed) \| (.+) \| (.+) \| (.+) \| (target|regrade) \|$/u
    );
    const legacyMatch = line.match(
      /^\| (pending|in-progress|completed) \| (.+) \| (.+) \|$/u
    );
    const match = completeMatch ?? extendedMatch ?? legacyMatch;
    if (!match) {
      continue;
    }

    if (match[2] === "(none)" && match[3] === "-") {
      continue;
    }

    entries.push({
      componentPath: match[2],
      currentScoreThreshold: parseScoreThreshold(
        completeMatch?.[4] ?? extendedMatch?.[4]
      ),
      followUpComments: parseFollowUpComments(completeMatch?.[6]),
      kind:
        ((completeMatch?.[7] ?? extendedMatch?.[5]) as
          | DirectoryLoopEntryKind
          | undefined) ?? "target",
      outputPath: match[3],
      status: match[1] as DirectoryLoopStatus,
      updatedScoreThreshold: parseScoreThreshold(completeMatch?.[5]),
    });
  }

  return {
    createdAt: updatedAt,
    directoryPath,
    entries,
    trackerPath: params.trackerPath,
    updatedAt,
  };
}

export async function readDirectoryLoopTracker(params: {
  directoryPath: string;
  projectRoot: string;
}): Promise<DirectoryLoopTracker | null> {
  const trackerPath = getDirectoryLoopTrackerPath(
    params.projectRoot,
    params.directoryPath
  );
  const content = await readFile(trackerPath, "utf-8").catch(
    (error: unknown) => {
      const errCode = (error as NodeJS.ErrnoException)?.code;
      if (errCode === "ENOENT") {
        return null;
      }

      throw error;
    }
  );

  if (content === null) {
    return null;
  }

  return parseDirectoryLoopTrackerMarkdown({
    content,
    directoryPath: params.directoryPath,
    projectRoot: params.projectRoot,
    trackerPath,
  });
}

export async function writeDirectoryLoopTracker(
  tracker: DirectoryLoopTracker
): Promise<void> {
  const trackerDir = dirname(tracker.trackerPath);
  const tempPath = `${tracker.trackerPath}.${process.pid}.${Date.now()}.tmp`;

  await mkdir(trackerDir, { recursive: true });
  await writeFile(
    tempPath,
    renderDirectoryLoopTrackerMarkdown(tracker),
    "utf-8"
  );
  await rename(tempPath, tracker.trackerPath);
}
