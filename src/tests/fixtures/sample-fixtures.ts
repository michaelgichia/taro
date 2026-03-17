export const sampleRestRecordingJs = `/**
 * @jest-environment url
 * @jest-environment-options { "url": "http://localhost:3001/dashboard/orgs/organisation_01J19WTB4J3DZYD730T2K58KRF/apps/business_01JCK47QRT925ZFTVZGJAVPQE7?tab=sales" }
 */
const {screen, waitFor} = require('@testing-library/dom')
const {default: userEvent} = require('@testing-library/user-event')
require('@testing-library/jest-dom')

test('Recording-Add-Sale-KE-06/03/2026 at 08:25:15', async () => {
  expect(location.href).toBe('http://localhost:3001/dashboard/orgs/organisation_01J19WTB4J3DZYD730T2K58KRF/apps/business_01JCK47QRT925ZFTVZGJAVPQE7?tab=sales')
  expect(document.title).toBe('DigiTax')
  await userEvent.click(screen.getByRole('button', {name: 'Add Sale (Invoice)'}))
  await userEvent.dblClick(screen.getByRole('heading', {name: 'Add Sale (Invoice)'}))
  await userEvent.click(screen.getByRole('heading', {name: 'Add Sale (Invoice)'}))
  await userEvent.click(screen.getByRole('button', {name: '+ Add Item to Cart'}))
  await userEvent.dblClick(screen.getByText('Please enter or'))
  await userEvent.click(screen.getByText('Please enter or'))
  await userEvent.dblClick(screen.getByText('Please enter unit'))
  await userEvent.click(screen.getByText('Please enter unit'))
  await userEvent.dblClick(screen.getByText('Please enter quantity'))
  await userEvent.click(screen.getByText('Please enter quantity'))
  await userEvent.click(document.querySelector('div.css-19bb58m'))
  await userEvent.click(screen.getByText('LLM masterclass - 02'))
  await userEvent.click(screen.getByText('Enter quantity'))
  await userEvent.click(screen.getByText('Enter quantity'))
  await userEvent.type(screen.getByText('Enter quantity'), '1')
  await userEvent.click(screen.getByRole('button', {name: '+ Add Item to Cart'}))
  await userEvent.dblClick(document.querySelector('#radix-_r_8s_-content-items > div:nth-of-type(1) > div:nth-of-type(2) span'))
  await userEvent.click(document.querySelector('#radix-_r_8s_-content-items > div:nth-of-type(1) > div:nth-of-type(2) span'))
  await userEvent.dblClick(screen.getByText('LLM masterclass'))
  await userEvent.click(screen.getByText('LLM masterclass'))
  await userEvent.type(document.querySelector('#radix-_r_8s_-content-items > div:nth-of-type(1) > div:nth-of-type(2) input'), '2')
  await userEvent.click(document.querySelector('#radix-_r_8s_-content-items > div:nth-of-type(1) > div:nth-of-type(2) input'))
  await userEvent.type(document.querySelector('#radix-_r_8s_-content-items > div:nth-of-type(1) > div:nth-of-type(2) input'), '3')
  await userEvent.click(document.querySelector('#radix-_r_8s_-content-items > div:nth-of-type(1) > div:nth-of-type(2) input'))
  await userEvent.type(document.querySelector('#radix-_r_8s_-content-items > div:nth-of-type(1) > div:nth-of-type(2) input'), '4')
  await userEvent.click(document.querySelector('#radix-_r_8s_-content-items > div:nth-of-type(1) > div:nth-of-type(2) input'))
  await userEvent.dblClick(document.querySelector('#radix-_r_8s_-content-items > div:nth-of-type(1) > div:nth-of-type(2) span'))
  await userEvent.click(document.querySelector('#radix-_r_8s_-content-items > div:nth-of-type(1) > div:nth-of-type(2) span'))
  await userEvent.click(screen.getByRole('button', {name: 'Continue'}))
  await userEvent.click(document.querySelector('#radix-_r_8s_-content-otherDetails > div:nth-of-type(1) > div:nth-of-type(1) div.css-19bb58m'))
  await userEvent.click(screen.getByText('A009105523T - John Doe'))
  await userEvent.dblClick(screen.getByText('Customer PIN'))
  await userEvent.click(screen.getByText('Customer PIN'))
  await userEvent.dblClick(screen.getByText('Customer PIN'))
  await userEvent.click(screen.getByText('Customer PIN'))
  await userEvent.dblClick(screen.getByText('Phone Number'))
  await userEvent.click(screen.getByText('Phone Number'))
  await userEvent.dblClick(screen.getByText('Email Address'))
  await userEvent.click(screen.getByText('Email Address'))
  await userEvent.dblClick(screen.getByText('Invoice Type'))
  await userEvent.click(screen.getByText('Invoice Type'))
  await userEvent.click(document.querySelector('div:nth-of-type(2) div.css-19bb58m'))
  await userEvent.click(screen.getByText('NORMAL'))
  await userEvent.click(document.querySelector('div:nth-of-type(2) > div.w-auto'))
  await userEvent.dblClick(screen.getByText('Service Charge'))
  await userEvent.click(screen.getByText('Service Charge'))
  await userEvent.dblClick(screen.getByText('Unique trader'))
  await userEvent.click(screen.getByText('Unique trader'))
  await userEvent.click(screen.getByText('Unique trader'))
  await userEvent.dblClick(screen.getByText('General Invoice'))
  await userEvent.click(screen.getByText('General Invoice'))
  await userEvent.click(screen.getByText('General Invoice details (optional)'))
  await userEvent.type(screen.getByText('General Invoice details (optional)'), 'Hello world')
  await userEvent.click(screen.getByText('Enter a unique trader invoice no.'))
  await userEvent.type(screen.getByText('Enter a unique trader invoice no.'), '001')
  await userEvent.click(screen.getByText('Enter rate (0-100)%'))
  await userEvent.type(screen.getByText('Enter rate (0-100)%'), '1')
  await userEvent.click(screen.getByRole('button', {name: 'Continue'}))
  await userEvent.dblClick(screen.getByRole('heading', {name: 'Review Sale (Invoice)'}))
  await userEvent.click(screen.getByRole('heading', {name: 'Review Sale (Invoice)'}))
  await userEvent.dblClick(document.querySelector('div.gap-4 p.font-semibold'))
  await userEvent.click(document.querySelector('div.gap-4 p.font-semibold'))
  await userEvent.dblClick(document.querySelector('div.gap-4 p:nth-of-type(2)'))
  await userEvent.click(document.querySelector('div.gap-4 p:nth-of-type(2)'))
  await userEvent.dblClick(screen.getByText('+254710853300'))
  await userEvent.click(screen.getByText('+254710853300'))
  await userEvent.dblClick(screen.getByText('john.doe@namiri.tech'))
  await userEvent.click(screen.getByText('john.doe@namiri.tech'))
  await userEvent.dblClick(document.querySelector('div.pb-4 div.text-foreground > p:nth-of-type(1)'))
  await userEvent.click(document.querySelector('div.pb-4 div.text-foreground > p:nth-of-type(1)'))
  await userEvent.click(document.querySelector('div.pb-4 > div'))
  await userEvent.dblClick(screen.getByText('General Invoice Details'))
  await userEvent.click(screen.getByText('General Invoice Details'))
  await userEvent.dblClick(document.querySelector('div.text-s > p'))
  await userEvent.click(document.querySelector('div.text-s > p'))
  await userEvent.click(screen.getByRole('button', {name: 'Save'}))
  await userEvent.dblClick(screen.getByText('KES\\u00A04,800.00'))
  await userEvent.click(screen.getByText('KES\\u00A04,800.00'))
})
`

export const sampleJsonBasicRecording = `{
  "title": "JSON basic sale flow",
  "settings": {
    "url": "http://localhost:3000/sales"
  },
  "steps": [
    {
      "type": "navigate",
      "url": "http://localhost:3000/sales"
    },
    {
      "type": "click",
      "target": "Add Sale"
    },
    {
      "type": "assertElementVisible",
      "target": "Add Sale"
    },
    {
      "type": "fill",
      "target": "Customer Name",
      "value": "Acme Ltd"
    },
    {
      "type": "fill",
      "target": "Amount",
      "value": "1200"
    },
    {
      "type": "click",
      "target": "Submit Sale"
    },
    {
      "type": "assertElementVisible",
      "target": "Sale created"
    }
  ]
}
`

export const sampleJsonDialogRecording = `{
  "title": "JSON dialog sale flow",
  "settings": {
    "url": "http://localhost:3000/sales"
  },
  "steps": [
    {
      "type": "click",
      "target": "Open Add Sale dialog"
    },
    {
      "type": "doubleClick",
      "target": "Open Add Sale dialog"
    },
    {
      "type": "assertElementVisible",
      "target": "Add Sale dialog"
    },
    {
      "type": "fill",
      "target": "Customer Name",
      "value": "Acme Ltd"
    },
    {
      "type": "fill",
      "target": "Reference",
      "value": "INV-16"
    },
    {
      "type": "click",
      "target": "Save draft"
    },
    {
      "type": "assertElementVisible",
      "target": "Draft saved"
    }
  ]
}
`

export const boundaryUnsafeSample = `
  import { render, screen } from "@testing-library/react";
  import { describe, expect, test, vi } from "vitest";
  import AddSaleForm from "./AddSaleForm";

  vi.mock("@digitax/data-layer", () => ({
    useOrdersQuery: vi.fn(() => ({ data: [] })),
    useCreateSaleMutation: vi.fn(() => ({ mutate: vi.fn() })),
  }));

  function helperWithAssertion() {
    expect(screen.getByText("Dialog ready")).toBeDefined();
  }

  const openReviewDialog = () => {
    const continueButtons = screen.getAllByRole("button", { name: "Continue" });
    return continueButtons[0];
  };

  describe("AddSaleForm", () => {
    test("renders", () => {
      render(<AddSaleForm />);
      screen.getByRole("button", { name: "Continue" });
      screen.getByRole("heading", { name: "Review Sale (Invoice)" });
      helperWithAssertion();
      openReviewDialog();
    });
  });
`

export const boundarySafeSample = `
  import { ToastMessage } from "@digitax/components";
  import { render, screen, waitFor, within } from "@testing-library/react";
  import userEvent from "@testing-library/user-event";
  import { beforeEach, describe, expect, test, vi } from "vitest";
  import SalesModule from "./SalesModule";

  const setup = () => {
    const user = userEvent.setup();
    render(<SalesModule />);
    return user;
  };

  const openAddSaleDialog = async (user) => {
    await user.click(screen.getByRole("button", { name: /add sale \\(invoice\\)/i }));
    await screen.findByRole("heading", { name: "Add Sale (Invoice)" });
  };

  const openReviewDialog = () =>
    screen.findByRole("dialog", { name: /review sale \\(invoice\\)/i });

  describe("SalesModule", () => {
    test("saves a Kenyan sale through the full Add Sale flow", async () => {
      const user = setup();
      await openAddSaleDialog(user);
      const reviewDialog = await openReviewDialog();
      await user.click(within(reviewDialog).getByRole("button", { name: /^save$/i }));
      await waitFor(() => expect(true).toBe(true));
      expect(ToastMessage.success).toHaveBeenCalledWith("Sale", "Sale added successfully");
    });
  });
`
