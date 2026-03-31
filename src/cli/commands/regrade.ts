import { readdir, realpath, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { cwd } from "node:process";

import { Command } from "commander";
import pc from "picocolors";

import { logToStderr as log } from "#cli/commands/log.ts";
import { type RegradeRunnerResult, runRegradeForTestFile } from "#cli/commands/regrade-runner.ts";
import {
  type DirectoryLoopTracker,
  createDirectoryLoopTracker,
  readDirectoryLoopTracker,
  updateDirectoryLoopTrackerEntry,
  updateDirectoryLoopTrackerStatus,
  writeDirectoryLoopTracker,
} from "#cli/commands/target-directory-tracker.ts";
import { normalizeGeneratedTestHistoryPath } from "#core/state-paths.ts";
import { loadOrBootstrapTaroState } from "#core/state.ts";

interface RegradeCommandContext {
  runRegradeTestFile?: (params: {
    projectRoot: string;
    testFile: string;
  }) => Promise<RegradeRunnerResult>;
}

interface CommandOptions {
  directoryLoop?: boolean;
}

interface LatestStoredScoreThreshold {
  createdAtMs: number;
  overall: number;
}

function resolveRegradeTrackerEntryStatus(
  previousStatus: DirectoryLoopTracker["entries"][number]["status"] | undefined
): DirectoryLoopTracker["entries"][number]["status"] {
  if (previousStatus === "completed" || previousStatus === "in-progress") {
    return previousStatus;
  }

  return "pending";
}

function selectNextRegradeTrackerEntry(tracker: DirectoryLoopTracker): {
  entry: DirectoryLoopTracker["entries"][number] | null;
  pendingCount: number;
} {
  const inProgressEntry = tracker.entries.find(
    (entry) => entry.status === "in-progress"
  );
  const pendingEntries = tracker.entries.filter(
    (entry) => entry.status === "pending"
  );

  return {
    entry: inProgressEntry ?? pendingEntries[0] ?? null,
    pendingCount: pendingEntries.length + (inProgressEntry ? 1 : 0),
  };
}

function formatExecutionFailureMessage(entryPath: string, error: unknown): string {
  const details =
    error instanceof Error
      ? error.message
      : "Unknown regrade execution failure.";

  return `[taro] Regrade directory loop stopped on ${entryPath}: ${details}`;
}

function isSupportedSourceFile(filePath: string): boolean {
  return /\.(?:[cm]?[jt]sx?)$/u.test(filePath);
}

function isTestFilePath(filePath: string): boolean {
  return /\.(?:test|spec)\.[cm]?[jt]sx?$/u.test(filePath);
}

async function collectRegradeTestFiles(dirPath: string): Promise<string[]> {
  const entries = await readdir(dirPath, {
    recursive: true,
    withFileTypes: true,
  });

  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => join(entry.parentPath, entry.name))
    .filter(
      (filePath) => isSupportedSourceFile(filePath) && isTestFilePath(filePath)
    )
    .sort();
}

async function readLatestStoredScoreThresholds(
  projectRoot: string
): Promise<Map<string, LatestStoredScoreThreshold>> {
  const bootstrap = await loadOrBootstrapTaroState(projectRoot);
  const latestThresholds = new Map<string, LatestStoredScoreThreshold>();

  for (const record of bootstrap.state.generatedTests) {
    const normalizedPath = normalizeGeneratedTestHistoryPath(
      projectRoot,
      record.testFile
    );
    const createdAtMs = Number.isFinite(Date.parse(record.createdAt))
      ? Date.parse(record.createdAt)
      : 0;
    const previous = latestThresholds.get(normalizedPath);

    if (
      !previous ||
      createdAtMs > previous.createdAtMs ||
      (createdAtMs === previous.createdAtMs &&
        record.quality.overall >= previous.overall)
    ) {
      latestThresholds.set(normalizedPath, {
        createdAtMs,
        overall: record.quality.overall,
      });
    }
  }

  return latestThresholds;
}

async function buildRegradeDirectoryLoopTracker(params: {
  directoryPath: string;
  projectRoot: string;
  testFiles: string[];
}) {
  const previousTracker = await readDirectoryLoopTracker({
    directoryPath: params.directoryPath,
    projectRoot: params.projectRoot,
  });
  const latestThresholds = await readLatestStoredScoreThresholds(
    params.projectRoot
  );

  return createDirectoryLoopTracker({
    directoryPath: params.directoryPath,
    entries: params.testFiles.map((testFile) => {
      const previousEntry = previousTracker?.entries.find(
        (entry) => resolve(params.projectRoot, entry.componentPath) === testFile
      );
      const latestThreshold = latestThresholds.get(
        normalizeGeneratedTestHistoryPath(params.projectRoot, testFile)
      );

      return {
        componentPath: testFile,
        currentScoreThreshold: latestThreshold?.overall ?? null,
        followUpComments: previousEntry?.followUpComments ?? [],
        kind: "regrade",
        outputPath: testFile,
        status: resolveRegradeTrackerEntryStatus(previousEntry?.status),
        updatedScoreThreshold: previousEntry?.updatedScoreThreshold ?? null,
      };
    }),
    projectRoot: params.projectRoot,
  });
}

export function createRegradeCommand(
  context: RegradeCommandContext = {}
): Command {
  const regrade = new Command("__regrade");

  regrade
    .description(
      "Internal runtime-only regrade surface for directory-loop test discovery"
    )
    .argument(
      "<target-path>",
      "Path to the test file or directory that should be regraded"
    )
    .option(
      "--directory-loop",
      "Treat directory input as an explicit iterative regrade loop"
    )
    .action(async (targetPath: string) => {
      try {
        const rawProjectRoot = cwd();
        const projectRoot = await realpath(rawProjectRoot).catch(
          () => rawProjectRoot
        );
        const rawTargetPath = resolve(targetPath);
        const commandOptions = regrade.opts<CommandOptions>();

        const pathStat = await stat(rawTargetPath).catch(() => null);
        if (!pathStat) {
          const message =
            pc.red("Error:") +
            ` File not found or not accessible: ${rawTargetPath}`;
          console.error(message);
          process.stderr.write(message + "\n");
          process.exit(2);
        }

        const resolvedTargetPath = await realpath(rawTargetPath).catch(
          () => rawTargetPath
        );

        if (pathStat.isDirectory()) {
          if (!commandOptions.directoryLoop) {
            const message =
              pc.red("Error:") +
              " Directory input requires --directory-loop. Pass a single test file to use the runtime regrade skill for one-off regrading.";
            console.error(message);
            process.stderr.write(message + "\n");
            process.exit(2);
          }

          const testFiles = await collectRegradeTestFiles(resolvedTargetPath);
          let tracker = await buildRegradeDirectoryLoopTracker({
            directoryPath: resolvedTargetPath,
            projectRoot,
            testFiles,
          });

          await writeDirectoryLoopTracker(tracker);

          log(pc.dim("[taro]") + " Regrade directory loop mode enabled");
          log(
            pc.dim("[taro]") +
              ` Directory loop tracker: ${tracker.trackerPath}`
          );

          if (testFiles.length === 0) {
            log(
              pc.yellow(
                `[taro] No RTL test files found in: ${resolvedTargetPath}`
              )
            );
            process.exit(0);
          }

          log(
            pc.dim("[taro]") +
              ` Queued ${testFiles.length} pending test file${testFiles.length === 1 ? "" : "s"} for regrade in ${resolvedTargetPath}`
          );

          const executeRegradeForTestFile =
            context.runRegradeTestFile ?? runRegradeForTestFile;

          while (true) {
            const { entry, pendingCount } = selectNextRegradeTrackerEntry(
              tracker
            );

            if (!entry && pendingCount === 0) {
              log(
                pc.dim("[taro]") +
                  " Regrade directory loop tracker is complete; no pending test files remain."
              );
              process.exit(0);
            }

            log(
              pc.dim("[taro]") +
                ` Processing ${pendingCount} pending test file${pendingCount === 1 ? "" : "s"} in ${resolvedTargetPath}`
            );

            const activeEntry = entry!;
            tracker = updateDirectoryLoopTrackerStatus(tracker, {
              componentPath: activeEntry.componentPath,
              projectRoot,
              status: "in-progress",
            });
            await writeDirectoryLoopTracker(tracker);

            let result: RegradeRunnerResult;
            try {
              result = await executeRegradeForTestFile({
                projectRoot,
                testFile: resolve(projectRoot, activeEntry.componentPath),
              });
            } catch (error) {
              log(pc.red(formatExecutionFailureMessage(activeEntry.componentPath, error)));
              process.exit(1);
            }

            tracker = updateDirectoryLoopTrackerEntry(tracker, {
              componentPath: activeEntry.componentPath,
              followUpComments: result.followUpComments,
              projectRoot,
              status: "completed",
              updatedScoreThreshold: result.scoreResult.total,
            });
            await writeDirectoryLoopTracker(tracker);
          }
        }

        if (commandOptions.directoryLoop) {
          const message =
            pc.red("Error:") +
            " --directory-loop is only valid when the target path is a directory.";
          console.error(message);
          process.stderr.write(message + "\n");
          process.exit(2);
        }

        const message =
          pc.red("Error:") +
          " Single-file regrade remains a runtime skill flow; this internal command currently supports only directory bootstrap.";
        console.error(message);
        process.stderr.write(message + "\n");
        process.exit(2);
      } catch (error) {
        if (
          error &&
          typeof error === "object" &&
          "constructor" in error &&
          (error as { constructor?: { name?: string } }).constructor?.name ===
            "ProcessExitSignal"
        ) {
          throw error;
        }

        const message =
          error instanceof Error
            ? error.message
            : "Regrade directory bootstrap failed with an unknown error.";
        console.error(pc.red("Error:") + ` ${message}`);
        process.stderr.write(pc.red("Error:") + ` ${message}\n`);
        process.exit(2);
      }
    });

  return regrade;
}
