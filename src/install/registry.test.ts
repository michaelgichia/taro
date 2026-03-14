import { describe, expect, it } from 'vitest'
import { resolveAssetSource } from './assets.js'
import { RUNTIME_REGISTRY } from './registry.js'

describe('RUNTIME_REGISTRY', () => {
  it('models Codex as a skill-first runtime family', () => {
    expect(RUNTIME_REGISTRY.codex.family).toBe('skill')
    expect(RUNTIME_REGISTRY.codex.packageContainerSegments).toEqual(['skills'])
  })

  it('keeps OpenCode local installs under ./.opencode', () => {
    expect(RUNTIME_REGISTRY.opencode.localDirectoryName).toBe('.opencode')
  })

  it('keeps prompt runtimes fully namespaced to @taro-dev/rtl', () => {
    expect(RUNTIME_REGISTRY.claude.packageContainerSegments).toContain('@taro-dev')
    expect(RUNTIME_REGISTRY.gemini.packageContainerSegments).toContain('rtl')
    expect(RUNTIME_REGISTRY.opencode.verificationCommand).toBe('/@taro-dev/rtl-help')
  })
})

describe('resolveAssetSource', () => {
  it('resolves authored install sources from the package root', () => {
    expect(resolveAssetSource(['commands', 'claude', '@taro-dev', 'rtl', 'help.md'])).toContain(
      '/commands/claude/@taro-dev/rtl/help.md'
    )
  })
})
