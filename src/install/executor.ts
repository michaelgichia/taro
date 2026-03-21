import type { InstallExecutionResult, InstallPlan } from "#install/types.ts";
import { verifyInstalledRuntime } from "#install/verification.ts";
import type { WriteInstallPlanOptions } from "#install/writer.ts";
import { writeInstallPlan } from "#install/writer.ts";

export async function executeInstallPlan(
  plan: InstallPlan,
  options: WriteInstallPlanOptions = {}
): Promise<InstallExecutionResult> {
  const targets = await Promise.all(
    plan.targets.map(async (target) => {
      const result = await writeInstallPlan(target, {
        confirmReplace: options.confirmReplace,
        generatedAt: options.generatedAt,
      });

      if (result.status === "blocked") {
        return result;
      }

      const verification = await verifyInstalledRuntime(target);
      return { ...result, verification };
    })
  );

  const hasSuccessfulWrites = targets.some(
    (target) => target.status !== "blocked"
  );
  const hasFailures = targets.some(
    (target) =>
      target.status === "blocked" || target.verification?.status !== "verified"
  );

  return {
    packageName: plan.packageName,
    status: hasFailures
      ? hasSuccessfulWrites
        ? "partial"
        : "blocked"
      : "installed",
    targets,
  };
}
