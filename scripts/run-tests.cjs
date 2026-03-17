#!/usr/bin/env node

const { spawnSync } = require('node:child_process')
const { join } = require('node:path')

function buildVitestArgs(rawArgs, options = {}) {
  const vitestCli = options.vitestCli ?? join(__dirname, '..', 'node_modules', 'vitest', 'vitest.mjs')
  const subcommand = rawArgs[0] === 'run' || rawArgs[0] === 'watch' ? rawArgs[0] : null
  const forwardedArgs = subcommand ? rawArgs.slice(1) : rawArgs
  const targetArgs = forwardedArgs.length > 0 ? forwardedArgs : ['src', 'tests']

  return [vitestCli, ...(subcommand ? [subcommand] : []), ...targetArgs]
}

function runVitest(rawArgs, options = {}) {
  const spawnImpl = options.spawnImpl ?? spawnSync
  const execPath = options.execPath ?? process.execPath
  const exit = options.exit ?? process.exit
  const vitestArgs = buildVitestArgs(rawArgs, options)

  const result = spawnImpl(execPath, vitestArgs, {
    stdio: 'inherit',
  })

  exit(result.status ?? 1)
}

module.exports = {
  buildVitestArgs,
  runVitest,
}

if (require.main === module) {
  runVitest(process.argv.slice(2))
}
