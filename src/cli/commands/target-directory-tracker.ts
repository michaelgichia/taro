import { mkdir, rename, writeFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";

import { getProjectStatePath } from "#project-state.ts";

export type DirectoryLoopStatus = "pending" | "in-progress" | "completed";

export interface DirectoryLoopTrackerEntry {
  componentPath: string;
  outputPath: string;
  status: DirectoryLoopStatus;
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
    outputPath: string;
    status?: DirectoryLoopStatus;
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
        outputPath: toDisplayPath(params.projectRoot, entry.outputPath),
        status: entry.status ?? "pending",
      }))
      .sort((left, right) => left.componentPath.localeCompare(right.componentPath)),
    trackerPath: getDirectoryLoopTrackerPath(
      params.projectRoot,
      params.directoryPath
    ),
    updatedAt: createdAt,
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
  const targetPath = toDisplayPath(params.projectRoot, params.componentPath);

  return {
    ...tracker,
    entries: tracker.entries.map((entry) => {
      if (entry.componentPath === targetPath) {
        return { ...entry, status: params.status };
      }

      if (params.status === "in-progress" && entry.status === "in-progress") {
        return { ...entry, status: "pending" };
      }

      return entry;
    }),
    updatedAt: params.updatedAt ?? new Date().toISOString(),
  };
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
      ? ["| pending | (none) | - |"]
      : tracker.entries.map(
          (entry) =>
            `| ${entry.status} | ${entry.componentPath} | ${entry.outputPath} |`
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
    "| Status | Component | Output |",
    "| --- | --- | --- |",
    ...rows,
    "",
  ].join("\n");
}

export async function writeDirectoryLoopTracker(
  tracker: DirectoryLoopTracker
): Promise<void> {
  const trackerDir = dirname(tracker.trackerPath);
  const tempPath = `${tracker.trackerPath}.${process.pid}.${Date.now()}.tmp`;

  await mkdir(trackerDir, { recursive: true });
  await writeFile(tempPath, renderDirectoryLoopTrackerMarkdown(tracker), "utf-8");
  await rename(tempPath, tracker.trackerPath);
}
