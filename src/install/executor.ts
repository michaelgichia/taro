import { verifyInstalledRuntime } from './verification.js'
import { writeInstallPlan } from './writer.js'
import type { InstallExecutionResult, InstallPlan } from './types.js'
import type { WriteInstallPlanOptions } from './writer.js'

export async function executeInstallPlan(
  plan: InstallPlan,
  options: WriteInstallPlanOptions = {}
): Promise<InstallExecutionResult> {
  const targets = await Promise.all(
    plan.targets.map(async (target) => {
      const result = await writeInstallPlan(target, {
        confirmReplace: options.confirmReplace,
        generatedAt: options.generatedAt,
      })

      if (result.status === 'blocked') {
        return result
      }

      const verification = await verifyInstalledRuntime(target)
      return {
        ...result,
        verification,
      }
    })
  )

  const hasSuccessfulWrites = targets.some((target) => target.status !== 'blocked')
  const hasFailures = targets.some(
    (target) =>
      target.status === 'blocked' || target.verification?.status === 'missing-installed-assets'
  )

  return {
    packageName: plan.packageName,
    status: hasFailures ? (hasSuccessfulWrites ? 'partial' : 'blocked') : 'installed',
    targets,
  }
}
