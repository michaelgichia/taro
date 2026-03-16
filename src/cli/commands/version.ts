import { Command } from 'commander'
import { TARO_VERSION } from '#version.ts'

interface VersionCommandContext {
  logger?: Pick<typeof console, 'log'>
}

export function runVersionCommand(context: VersionCommandContext = {}): void {
  const logger = context.logger ?? console
  logger.log(TARO_VERSION)
}

export function createVersionCommand(context: VersionCommandContext = {}): Command {
  return new Command('version')
    .description('Show the current Taro version')
    .action(() => runVersionCommand(context))
}
