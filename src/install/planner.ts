import { resolveInstallTargets } from './resolver.js'
import type { InstallPlan, InstallSelection } from './types.js'

export function buildInstallPlan(selection: InstallSelection): InstallPlan {
  return {
    packageName: '@tayo-dev/rtl',
    commandName: 'taro',
    stage: 'prewrite-preview',
    source: selection.source,
    mode: selection.mode,
    targets: resolveInstallTargets(selection),
  }
}
