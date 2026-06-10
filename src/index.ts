#!/usr/bin/env node

/**
 * Taro CLI entry point
 * Installer-first package surface with runtime-native generation entrypoints.
 */

import { Command } from "commander";
import pc from "picocolors";

import { createGenerateCommand } from "#cli/commands/generate.ts";
import { createGradeCommand } from "#cli/commands/grade.ts";
import { createInitCommand } from "#cli/commands/init.ts";
import {
  applyInstallOptions,
  createInstallCommand,
  runInstallCommand,
} from "#cli/commands/install.ts";
import { createOverridesCommand } from "#cli/commands/overrides.ts";
import { createRefreshCommand } from "#cli/commands/refresh.ts";
import { createRegradeCommand } from "#cli/commands/regrade.ts";
import { createTargetCommand } from "#cli/commands/target.ts";
import { createVersionCommand } from "#cli/commands/version.ts";
import type { InstallCommandOptions } from "#install/types.ts";
import { TARO_VERSION } from "#version.ts";

const program = new Command();

if (process.argv[2] === "__generate") {
  await createGenerateCommand().parseAsync(process.argv.slice(3), {
    from: "user",
  });
} else if (process.argv[2] === "__grade") {
  await createGradeCommand().parseAsync(process.argv.slice(3), {
    from: "user",
  });
} else if (process.argv[2] === "__init") {
  await createInitCommand().parseAsync(process.argv.slice(3), { from: "user" });
} else if (process.argv[2] === "__overrides") {
  await createOverridesCommand().parseAsync(process.argv.slice(3), {
    from: "user",
  });
} else if (process.argv[2] === "__refresh") {
  await createRefreshCommand().parseAsync(process.argv.slice(3), {
    from: "user",
  });
} else if (process.argv[2] === "__regrade") {
  await createRegradeCommand().parseAsync(process.argv.slice(3), {
    from: "user",
  });
} else if (process.argv[2] === "__target") {
  await createTargetCommand().parseAsync(process.argv.slice(3), {
    from: "user",
  });
} else {
  applyInstallOptions(program);

  program
    .name("taro")
    .description(
      `${pc.bold("@tr-rtl/cli")} — Install Taro into Claude Code, OpenCode, Gemini CLI, or Codex`
    )
    .version(TARO_VERSION, "-v, --version", "Output the current version")
    .helpOption("-h, --help", "Display help for command")
    .addHelpText(
      "after",
      "\nAfter install, use the runtime-native Taro help/init/overrides/generate/refresh entrypoints."
    )
    .action(async () => {
      await runInstallCommand(
        program.optsWithGlobals() as InstallCommandOptions
      );
    });

  program.addCommand(createInstallCommand());
  program.addCommand(createVersionCommand());
  program.parse(process.argv);
}
