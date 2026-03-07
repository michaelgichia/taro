import { writeInstallPlan } from './writer.js'
import type { InstallExecutionResult, InstallPlan } from './types.js'
import type { WriteInstallPlanOptions } from './writer.js'

export async function executeInstallPlan(
  plan: InstallPlan,
  options: WriteInstallPlanOptions = {}
): Promise<InstallExecutionResult> {
  const targets = await Promise.all(
    plan.targets.map((target) =>
      writeInstallPlan(target, {
        confirmReplace: options.confirmReplace,
        generatedAt: options.generatedAt,
      })
    )
  )

  const hasInstalled = targets.some((target) => target.status === 'installed')
  const hasFailures = targets.some((target) => target.status !== 'installed')

  return {
    packageName: plan.packageName,
    status: hasFailures ? (hasInstalled ? 'partial' : 'blocked') : 'installed',
    targets,
  }
}
