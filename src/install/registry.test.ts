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

  it('keeps prompt runtimes fully namespaced to @tayo-dev/rtl', () => {
    expect(RUNTIME_REGISTRY.claude.packageContainerSegments).toContain('@tayo-dev')
    expect(RUNTIME_REGISTRY.gemini.packageContainerSegments).toContain('rtl')
    expect(RUNTIME_REGISTRY.opencode.verificationCommand).toBe('/@tayo-dev/rtl-help')
  })
})

describe('resolveAssetSource', () => {
  it('resolves runtime asset paths from the package root', () => {
    expect(resolveAssetSource('claude', ['commands', 'help.md'])).toContain(
      '/assets/claude/commands/help.md'
    )
  })
})
