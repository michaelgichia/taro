import { Command } from 'commander'
import { cwd } from 'node:process'
import { formatStateSummary, refreshTaroState } from '#core/state.ts'

export function createRefreshCommand(): Command {
  const refresh = new Command('__refresh')

  refresh
    .description('Internal runtime-only state refresher for Taro package profiles')
    .action(async () => {
      const projectRoot = cwd()
      const result = await refreshTaroState(projectRoot)
      for (const line of formatStateSummary(result.summary, 'refresh')) {
        console.log(line)
      }
    })

  return refresh
}
