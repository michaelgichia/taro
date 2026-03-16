import { describe, expect, it } from 'vitest'
import { resolveAssetSource } from '#install/assets.ts'
import { RUNTIME_REGISTRY } from '#install/registry.ts'

describe('RUNTIME_REGISTRY', () => {
  it('models Codex as a skill-first runtime family', () => {
    expect(RUNTIME_REGISTRY.codex.family).toBe('skill')
    expect(RUNTIME_REGISTRY.codex.packageContainerSegments).toEqual(['skills'])
  })

  it('keeps OpenCode local installs under ./.opencode', () => {
    expect(RUNTIME_REGISTRY.opencode.localDirectoryName).toBe('.opencode')
  })

  it('keeps prompt runtimes fully namespaced to @taro-test/rtl', () => {
    expect(RUNTIME_REGISTRY.claude.packageContainerSegments).toContain('@taro-test')
    expect(RUNTIME_REGISTRY.gemini.packageContainerSegments).toContain('rtl')
    expect(RUNTIME_REGISTRY.opencode.verificationCommand).toBe('/@taro-test/rtl-help')
  })
})

describe('resolveAssetSource', () => {
  it('resolves authored install sources from the package root', () => {
    expect(resolveAssetSource(['commands', 'claude', '@taro-test', 'rtl', 'help.md'])).toContain(
      '/commands/claude/@taro-test/rtl/help.md'
    )
  })
})
