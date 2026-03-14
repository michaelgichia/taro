#!/usr/bin/env node

const { spawnSync } = require('node:child_process')
const { join } = require('node:path')

const vitestCli = join(__dirname, '..', 'node_modules', 'vitest', 'vitest.mjs')
const rawArgs = process.argv.slice(2)
const subcommand = rawArgs[0] === 'run' || rawArgs[0] === 'watch' ? rawArgs[0] : null
const forwardedArgs = subcommand ? rawArgs.slice(1) : rawArgs
const targetArgs = forwardedArgs.length > 0 ? forwardedArgs : ['src', 'tests']
const vitestArgs = [vitestCli, ...(subcommand ? [subcommand] : []), ...targetArgs]

const result = spawnSync(process.execPath, vitestArgs, {
  stdio: 'inherit',
})

process.exit(result.status ?? 1)
