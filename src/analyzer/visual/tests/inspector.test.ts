import { beforeEach, describe, expect, it, vi } from 'vitest'

import { inspectElement } from '#analyzer/visual/inspector.ts'

describe('inspectElement', () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns null when the selector does not resolve to an element', async () => {
    const page = {
      $: vi.fn().mockResolvedValue(null),
    }

    await expect(inspectElement(page as never, '#missing')).resolves.toBeNull()
  })

  it('extracts accessibility properties from a regular HTML element', async () => {
    vi.stubGlobal('window', {
      getComputedStyle: () => ({
        display: 'block',
        visibility: 'visible',
        opacity: '1',
      }),
    })

    const elementHandle = {
      evaluate: vi.fn(async (callback: (element: Element) => unknown) =>
        callback({
          tagName: 'BUTTON',
          textContent: ' Save ',
          getAttribute: (name: string) =>
            ({
              role: 'button',
              'aria-label': 'Save changes',
              name: 'save-button',
            })[name] ?? null,
          id: 'save',
          className: 'primary large',
          disabled: true,
        } as unknown as Element)
      ),
    }

    const page = {
      $: vi.fn().mockResolvedValue(elementHandle),
    }

    await expect(inspectElement(page as never, '#save')).resolves.toEqual({
      tagName: 'button',
      textContent: 'Save',
      ariaRole: 'button',
      ariaLabel: 'Save changes',
      nameAttr: 'save-button',
      id: 'save',
      classes: ['primary', 'large'],
      isVisible: true,
      isDisabled: true,
    })
  })

  it('returns null when evaluating the element fails', async () => {
    const page = {
      $: vi.fn().mockResolvedValue({
        evaluate: vi.fn().mockRejectedValue(new Error('boom')),
      }),
    }

    await expect(inspectElement(page as never, '#broken')).resolves.toBeNull()
  })
})
