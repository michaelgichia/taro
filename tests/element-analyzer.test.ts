import type { Page } from 'playwright';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { inspectElementMock } = vi.hoisted(() => ({
  inspectElementMock: vi.fn(),
}))

vi.mock('#analyzer/visual/inspector.ts', () => ({
  inspectElement: inspectElementMock,
}))

import { analyzeElementProperties, recommendQueryMethod } from '#analyzer/visual/element-analyzer.ts';

const mockPage = {
  $eval: vi.fn(),
} as unknown as Page;

describe('element-analyzer', () => {
  describe('recommendQueryMethod', () => {
    it('should recommend query method for high priority strategy', () => {
      const properties = {
        preferredQuery: {
          method: 'getByRole',
          args: ['button', { name: 'Submit' }],
          priority: 1,
        },
        alternatives: [],
        hasAccessibleName: true,
        isInteractive: true,
      };

      const result = recommendQueryMethod(properties);
      expect(result).toBe('getByRole("button", {"name":"Submit"})');
    });

    it('should return warning for no good query strategy', () => {
      const properties = {
        preferredQuery: {
          method: 'getByRole',
          args: ['generic'],
          priority: 99,
        },
        alternatives: [],
        hasAccessibleName: false,
        isInteractive: false,
      };

      const result = recommendQueryMethod(properties);
      expect(result).toContain('Warning');
      expect(result).toContain('data-testid');
    });

    it('should format regex args correctly', () => {
      const properties = {
        preferredQuery: {
          method: 'getByText',
          args: [/clicked/],
          priority: 6,
        },
        alternatives: [],
        hasAccessibleName: true,
        isInteractive: false,
      };

      const result = recommendQueryMethod(properties);
      expect(result).toBe('getByText(/clicked/)');
    });

    it('should handle string args without options', () => {
      const properties = {
        preferredQuery: {
          method: 'getByTestId',
          args: ['submit-button'],
          priority: 5,
        },
        alternatives: [],
        hasAccessibleName: true,
        isInteractive: true,
      };

      const result = recommendQueryMethod(properties);
      expect(result).toBe('getByTestId("submit-button")');
    });
  });

  describe('analyzeElementProperties', () => {
    beforeEach(() => {
      vi.clearAllMocks();
      inspectElementMock.mockReset()
      vi.mocked(mockPage.$eval).mockReset()
    });

    it('should return null when element not found', async () => {
      inspectElementMock.mockResolvedValue(null)
      
      const result = await analyzeElementProperties(mockPage, '#nonexistent');
      expect(result).toBeNull();
    });

    it('builds ranked strategies for labelled form fields', async () => {
      inspectElementMock.mockResolvedValue({
        tagName: 'input',
        textContent: '',
        ariaRole: 'textbox',
        ariaLabel: 'Customer Name',
        nameAttr: 'customer',
        id: 'customer',
        classes: [],
        isVisible: true,
        isDisabled: false,
      })
      vi.mocked(mockPage.$eval)
        .mockResolvedValueOnce('Customer Name')
        .mockResolvedValueOnce('Enter customer name')
        .mockResolvedValueOnce('customer-input')

      const result = await analyzeElementProperties(mockPage, '#customer')

      expect(result).toEqual(
        expect.objectContaining({
          hasAccessibleName: true,
          isInteractive: true,
          preferredQuery: expect.objectContaining({
            method: 'getByLabelText',
            args: ['Customer Name'],
          }),
          alternatives: expect.arrayContaining([
            expect.objectContaining({
              method: 'getByLabelText',
              args: ['Customer Name'],
            }),
            expect.objectContaining({
              method: 'getByPlaceholderText',
              args: ['Enter customer name', { exact: true }],
            }),
            expect.objectContaining({
              method: 'getByTestId',
              args: ['customer-input'],
            }),
          ]),
        })
      )
    })

    it('prefers role queries for interactive elements with visible text and supports parent-label lookup', async () => {
      const documentQuerySelectorMock = vi.fn().mockReturnValue(null)
      const oldDocument = globalThis.document
      Object.defineProperty(globalThis, 'document', {
        configurable: true,
        value: {
          querySelector: documentQuerySelectorMock,
        },
      })

      inspectElementMock
        .mockResolvedValueOnce({
          tagName: 'button',
          textContent: 'Save changes',
          ariaRole: 'button',
          ariaLabel: undefined,
          nameAttr: undefined,
          id: '',
          classes: [],
          isVisible: true,
          isDisabled: false,
        })
        .mockResolvedValueOnce({
          tagName: 'textarea',
          textContent: '',
          ariaRole: undefined,
          ariaLabel: undefined,
          nameAttr: undefined,
          id: '',
          classes: [],
          isVisible: true,
          isDisabled: false,
        })

      vi.mocked(mockPage.$eval)
        .mockImplementationOnce(async (_selector, callback) =>
          callback({ id: '', closest: () => null } as unknown as Element)
        )
        .mockImplementationOnce(async (_selector, callback) =>
          callback({ placeholder: '' } as unknown as Element)
        )
        .mockImplementationOnce(async (_selector, callback) =>
          callback({ getAttribute: () => '' } as unknown as Element)
        )
        .mockImplementationOnce(async (_selector, callback) =>
          callback({
            id: '',
            closest: () => ({ textContent: 'Notes' }),
          } as unknown as Element)
        )
        .mockImplementationOnce(async (_selector, callback) =>
          callback({ placeholder: '' } as unknown as Element)
        )
        .mockImplementationOnce(async (_selector, callback) =>
          callback({ getAttribute: () => '' } as unknown as Element)
        )

      try {
        const buttonResult = await analyzeElementProperties(mockPage, '#save-button')
        const textareaResult = await analyzeElementProperties(mockPage, '#notes')

        expect(buttonResult).toEqual(
          expect.objectContaining({
            isInteractive: true,
            preferredQuery: expect.objectContaining({
              method: 'getByRole',
              args: ['button', { name: 'Save changes' }],
            }),
            alternatives: expect.arrayContaining([
              expect.objectContaining({
                method: 'getByText',
                args: ['Save changes', { exact: true }],
              }),
            ]),
          })
        )

        expect(textareaResult).toEqual(
          expect.objectContaining({
            hasAccessibleName: true,
            isInteractive: true,
            preferredQuery: expect.objectContaining({
              method: 'getByLabelText',
              args: ['Notes'],
            }),
          })
        )
      } finally {
        Object.defineProperty(globalThis, 'document', {
          configurable: true,
          value: oldDocument,
        })
      }
    })

    it('uses alt text for images and falls back to a generic role when no good strategy exists', async () => {
      inspectElementMock
        .mockResolvedValueOnce({
          tagName: 'img',
          textContent: '',
          ariaRole: undefined,
          ariaLabel: undefined,
          nameAttr: undefined,
          id: '',
          classes: [],
          isVisible: true,
          isDisabled: false,
        })
        .mockResolvedValueOnce({
          tagName: 'div',
          textContent: '',
          ariaRole: undefined,
          ariaLabel: undefined,
          nameAttr: undefined,
          id: '',
          classes: [],
          isVisible: true,
          isDisabled: false,
        })

      vi.mocked(mockPage.$eval)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce('')
        .mockResolvedValueOnce('Product image')
        .mockResolvedValueOnce('')
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce('')
        .mockResolvedValueOnce('')
        .mockResolvedValueOnce('')

      const imageResult = await analyzeElementProperties(mockPage, '#hero-image')
      const fallbackResult = await analyzeElementProperties(mockPage, '#plain-div')

      expect(imageResult?.preferredQuery).toEqual(
        expect.objectContaining({
          method: 'getByAltText',
          args: ['Product image'],
        })
      )
      expect(fallbackResult?.preferredQuery).toEqual(
        expect.objectContaining({
          method: 'getByRole',
          args: ['generic'],
          priority: 99,
        })
      )
    })

    it('falls back to data-test-id attributes when present under the alternate attribute name', async () => {
      inspectElementMock.mockResolvedValue({
        tagName: 'div',
        textContent: '',
        ariaRole: undefined,
        ariaLabel: undefined,
        nameAttr: undefined,
        id: '',
        classes: [],
        isVisible: true,
        isDisabled: false,
      })

      vi.mocked(mockPage.$eval)
        .mockImplementationOnce(async (_selector, callback) =>
          callback({ id: '', closest: () => null } as unknown as Element)
        )
        .mockImplementationOnce(async (_selector, callback) =>
          callback({ placeholder: '' } as unknown as Element)
        )
        .mockImplementationOnce(async (_selector, callback) =>
          callback({
            getAttribute: (name: string) => (name === 'data-test-id' ? 'legacy-test-id' : null),
          } as unknown as Element)
        )

      const result = await analyzeElementProperties(mockPage, '#legacy')

      expect(result?.preferredQuery).toEqual(
        expect.objectContaining({
          method: 'getByTestId',
          args: ['legacy-test-id'],
        })
      )
    })

    it('evaluates label and alt-text callbacks against the DOM when the element has an id', async () => {
      const oldDocument = globalThis.document
      Object.defineProperty(globalThis, 'document', {
        configurable: true,
        value: {
          querySelector: vi.fn().mockReturnValue({ textContent: 'Email Address' }),
        },
      })

      inspectElementMock
        .mockResolvedValueOnce({
          tagName: 'input',
          textContent: '',
          ariaRole: undefined,
          ariaLabel: undefined,
          nameAttr: undefined,
          id: 'email',
          classes: [],
          isVisible: true,
          isDisabled: false,
        })
        .mockResolvedValueOnce({
          tagName: 'img',
          textContent: '',
          ariaRole: undefined,
          ariaLabel: undefined,
          nameAttr: undefined,
          id: '',
          classes: [],
          isVisible: true,
          isDisabled: false,
        })

      vi.mocked(mockPage.$eval)
        .mockImplementationOnce(async (_selector, callback) =>
          callback({ id: 'email', closest: () => null } as unknown as Element)
        )
        .mockImplementationOnce(async (_selector, callback) =>
          callback({ placeholder: '' } as unknown as Element)
        )
        .mockImplementationOnce(async (_selector, callback) =>
          callback({ getAttribute: () => '' } as unknown as Element)
        )
        .mockImplementationOnce(async (_selector, callback) =>
          callback({ id: '', closest: () => null } as unknown as Element)
        )
        .mockImplementationOnce(async (_selector, callback) =>
          callback({ placeholder: '' } as unknown as Element)
        )
        .mockImplementationOnce(async (_selector, callback) =>
          callback({ alt: 'Hero image' } as unknown as Element)
        )
        .mockImplementationOnce(async (_selector, callback) =>
          callback({ getAttribute: () => '' } as unknown as Element)
        )

      try {
        const fieldResult = await analyzeElementProperties(mockPage, '#email')
        const imageResult = await analyzeElementProperties(mockPage, '#hero-image')

        expect(fieldResult?.preferredQuery).toEqual(
          expect.objectContaining({
            method: 'getByLabelText',
            args: ['Email Address'],
          })
        )
        expect(imageResult?.preferredQuery).toEqual(
          expect.objectContaining({
            method: 'getByAltText',
            args: ['Hero image'],
          })
        )
      } finally {
        Object.defineProperty(globalThis, 'document', {
          configurable: true,
          value: oldDocument,
        })
      }
    })
  });
});
