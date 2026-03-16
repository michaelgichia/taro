import { fileURLToPath } from 'node:url'

import { defineConfig } from 'vitest/config'

const srcRoot = fileURLToPath(new URL('./src/', import.meta.url))

export default defineConfig({
  resolve: {
    alias: [
      {
        find: /^#(.+\.ts)$/,
        replacement: `${srcRoot}$1`,
      },
    ],
  },
})
