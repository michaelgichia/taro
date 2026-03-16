import { Command } from 'commander'
import { cwd } from 'node:process'
import { formatStateSummary, initTaroState } from '#core/state.ts'

export function createInitCommand(): Command {
  const init = new Command('__init')

  init
    .description('Internal runtime-only state initializer for brownfield repositories')
    .action(async () => {
      const projectRoot = cwd()
      const result = await initTaroState(projectRoot)
      for (const line of formatStateSummary(result.summary, 'init')) {
        console.log(line)
      }
    })

  return init
}
