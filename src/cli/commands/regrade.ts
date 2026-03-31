import { realpath, stat } from "node:fs/promises";
import { resolve } from "node:path";
import { cwd } from "node:process";

import { Command } from "commander";
import pc from "picocolors";

import { logToStderr as log } from "#cli/commands/log.ts";
interface CommandOptions {
  directoryLoop?: boolean;
}

export function createRegradeCommand(): Command {
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

          log(pc.dim("[taro]") + " Regrade directory loop mode enabled");
          log(
            pc.dim("[taro]") +
              ` Directory target accepted for bootstrap: ${resolvedTargetPath}`
          );
          process.exit(0);
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
