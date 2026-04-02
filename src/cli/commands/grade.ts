import { realpath, stat } from "node:fs/promises";
import { resolve } from "node:path";
import { cwd } from "node:process";

import { Command } from "commander";
import pc from "picocolors";

import {
  buildSingleFileExistingTestSummaryLines,
  isTestFilePath,
} from "#cli/commands/existing-test-grading.ts";
import {
  type GradeRunnerResult,
  runGradeForTestFile,
} from "#cli/commands/grade-runner.ts";
import { logToStderr as log } from "#cli/commands/log.ts";

interface GradeCommandContext {
  runGradeTestFile?: (params: {
    projectRoot: string;
    testFile: string;
  }) => Promise<GradeRunnerResult>;
}

export function createGradeCommand(context: GradeCommandContext = {}): Command {
  const grade = new Command("__grade");

  grade
    .description("Internal runtime-only existing-test grading surface")
    .argument("<test-file>", "Path to the test file that should be graded")
    .action(async (targetPath: string) => {
      try {
        const rawProjectRoot = cwd();
        const projectRoot = await realpath(rawProjectRoot).catch(
          () => rawProjectRoot
        );
        const rawTargetPath = resolve(targetPath);
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
          const message =
            pc.red("Error:") +
            " Directory input is not supported by __grade. Use __regrade <test-directory> --directory-loop for batch regrading.";
          console.error(message);
          process.stderr.write(message + "\n");
          process.exit(2);
        }

        if (!pathStat.isFile() || !isTestFilePath(resolvedTargetPath)) {
          const message =
            pc.red("Error:") +
            " Target file must be an RTL test file ending in .test.* or .spec.*.";
          console.error(message);
          process.stderr.write(message + "\n");
          process.exit(2);
        }

        const executeGradeForTestFile =
          context.runGradeTestFile ?? runGradeForTestFile;
        const result = await executeGradeForTestFile({
          projectRoot,
          testFile: resolvedTargetPath,
        });

        for (const line of buildSingleFileExistingTestSummaryLines({
          mode: "grade",
          result: {
            followUpComments: result.followUpComments,
            matchedHistoryRecord: result.matchedHistoryRecord,
            matchedHistorySource: result.matchedHistorySource,
            scoreResult: result.gradeResult,
            testFile: result.testFile,
          },
        })) {
          log(line);
        }

        process.exit(0);
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
            : "Grade failed with an unknown error.";
        console.error(pc.red("Error:") + ` ${message}`);
        process.stderr.write(pc.red("Error:") + ` ${message}\n`);
        process.exit(2);
      }
    });

  return grade;
}
