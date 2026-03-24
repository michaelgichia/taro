import pc from "picocolors";

import type { MockAnalysis } from "#core/mock-intelligence.ts";
import { analyzeMocks } from "#core/mock-intelligence.ts";
import { appendGeneratedTestRecord } from "#core/state.ts";
import { verifySyntax } from "#core/verifier.ts";
import type { ScoreResult } from "#types/score.ts";
import type { ResolvedTaroPackageProfile } from "#types/state.ts";

function log(msg: string): void {
  process.stderr.write(msg + "\n");
}

export async function maybeAnalyzeMocks(
  projectRoot: string,
  packageProfile: ResolvedTaroPackageProfile | null
): Promise<MockAnalysis | null> {
  try {
    return await analyzeMocks(projectRoot, { packageProfile });
  } catch {
    return null;
  }
}

export async function finalizeGeneratedOutput(params: {
  code: string;
  outputPath: string;
  projectRoot: string;
  recordingFile: string;
  scoreResult: ScoreResult;
  packageProfile: ResolvedTaroPackageProfile | null;
}): Promise<void> {
  const {
    code,
    outputPath,
    projectRoot,
    recordingFile,
    scoreResult,
    packageProfile,
  } = params;

  const verification = verifySyntax(code, outputPath);
  if (!verification.valid) {
    console.error(pc.red("[taro] Error: Post-write verification failed"));
    console.error(pc.red(`  ${verification.error}`));
    console.error(pc.red("  This is a Taro bug. Please report it."));
    process.exit(2);
  }

  log(pc.green("[taro] ✓ post-write verified"));

  try {
    await appendGeneratedTestRecord(projectRoot, {
      packagePath: packageProfile?.packagePath ?? ".",
      recordingFile,
      testFile: outputPath,
      scoreResult,
    });
    log(
      pc.dim("[taro]") +
        ` Updated .taro/state.json for package ${packageProfile?.packagePath ?? "."}.`
    );
  } catch {
    // State updates are best-effort; generation should still succeed.
  }
}
