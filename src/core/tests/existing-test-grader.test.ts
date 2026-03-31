import { describe, expect, it } from "vitest";

import { gradeExistingTest } from "#core/existing-test-grader.ts";

describe("gradeExistingTest", () => {
  it("keeps a strong existing test in the B range", () => {
    const result = gradeExistingTest(`
      import { beforeEach, describe, expect, it, vi } from 'vitest';
      import { renderWithProviders } from '@/tests/render';
      import { submitInvoiceMock } from '@/tests/mocks/digitax-data-layer';
      import { screen } from '@testing-library/react';

      const buildProps = () => ({ invoiceId: 'INV-1' });

      beforeEach(() => {
        submitInvoiceMock.mockReset();
      });

      describe('InvoiceForm', () => {
        it('submits the invoice payload and shows success feedback', async () => {
          renderWithProviders(<InvoiceForm {...buildProps()} />);
          screen.getByLabelText('Invoice number');
          await user.click(screen.getByRole('button', { name: 'Submit invoice' }));
          expect(submitInvoiceMock).toHaveBeenCalledWith({ invoiceId: 'INV-1' });
          expect(screen.getByRole('status')).toHaveTextContent('Invoice submitted');
        });
      });
    `);

    expect(result.total).toBeGreaterThanOrEqual(80);
    expect(result.grade).toBe("B");
    expect(result.requiresReview).toBe(false);
  });

  it("keeps brittle layout-coupled tests in the F range", () => {
    const result = gradeExistingTest(`
      import { describe, expect, it, vi } from 'vitest';
      import { render } from '@testing-library/react';

      const saveMock = vi.fn();

      describe('App', () => {
        it('renders correctly', () => {
          const { container, getByPlaceholderText } = render(<App />);
          getByPlaceholderText('Name');
          const buttons = container.querySelectorAll('button');
          buttons[1]?.click();
          expect(saveMock).toHaveBeenCalled();
        });
      });
    `);

    expect(result.total).toBeLessThan(60);
    expect(result.grade).toBe("F");
    expect(result.requiresReview).toBe(true);
  });

  it("moves a borderline test into B when exact payload and success assertions are added", () => {
    const before = gradeExistingTest(`
      import { beforeEach, describe, expect, it, vi } from 'vitest';
      import { renderWithProviders } from '@/tests/render';
      import { saveItemMock } from '@/tests/mocks/digitax-data-layer';
      import { screen } from '@testing-library/react';

      const buildProps = () => ({ itemId: 'ITEM-1' });

      beforeEach(() => {
        saveItemMock.mockReset();
      });

      describe('EditItemForm', () => {
        it('shows the save button', async () => {
          renderWithProviders(<EditItemForm {...buildProps()} />);
          screen.getByLabelText('Item name');
          screen.getByText('Edit item');
          expect(screen.getByRole('button', { name: 'Save changes' })).toBeInTheDocument();
        });
      });
    `);

    const after = gradeExistingTest(`
      import { beforeEach, describe, expect, it, vi } from 'vitest';
      import { renderWithProviders } from '@/tests/render';
      import { saveItemMock } from '@/tests/mocks/digitax-data-layer';
      import { screen } from '@testing-library/react';

      const buildProps = () => ({ itemId: 'ITEM-1' });

      beforeEach(() => {
        saveItemMock.mockReset();
      });

      describe('EditItemForm', () => {
        it('saves the item payload and reports success', async () => {
          renderWithProviders(<EditItemForm {...buildProps()} />);
          screen.getByLabelText('Item name');
          screen.getByText('Edit item');
          await user.click(screen.getByRole('button', { name: 'Save changes' }));
          expect(saveItemMock).toHaveBeenCalledWith({ itemId: 'ITEM-1' });
          expect(screen.getByRole('status')).toHaveTextContent('Saved');
        });
      });
    `);

    expect(before.total).toBeGreaterThanOrEqual(60);
    expect(before.total).toBeLessThan(80);
    expect(after.grade).toBe("B");
    expect(after.total).toBeGreaterThan(before.total);
  });
});
