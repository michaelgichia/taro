import "@/tests/mocks/digitax-components";

import { ToastMessage } from "@digitax/components";
import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import AddButton from "@/components/library/AddButton";
import {
  MOCK_KRA_SALE_ITEM_NAME,
  mockKraSaleCustomer,
  mockKraSaleInputExpectation,
  mockKraSaleItem,
} from "@/tests/mocks";

import AddSaleForm from "./AddSaleForm";

const CUSTOMER_LABEL = `${mockKraSaleCustomer.taxIdentificationNumber} - ${mockKraSaleCustomer.name}`;

if (!globalThis.ResizeObserver) {
  class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  }

  globalThis.ResizeObserver =
    ResizeObserver as typeof globalThis.ResizeObserver;
}

const { createSaleMutate, createCustomerMutate, control } = vi.hoisted(() => ({
  createSaleMutate: vi.fn(),
  createCustomerMutate: vi.fn(),
  control: { createShouldFail: false },
}));

vi.mock("@clerk/nextjs", () => ({
  useUser: () => ({
    user: { primaryEmailAddress: { emailAddress: "qa@namiri.tech" } },
  }),
}));

vi.mock("next/navigation", () => ({
  useParams: () => ({ slug: mockKraSaleInputExpectation.businessID }),
}));

vi.mock("@/modules/kenya/items/AddItemForm", () => ({
  default: () => <div>Mock Add Item Form</div>,
}));

vi.mock("@digitax/data-layer", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@digitax/data-layer")>();

  return {
    ...actual,
    useKraItemsQuery: (
      _args: unknown,
      options?: { select?: (data: any) => any }
    ) => {
      const response = { kraItems: { edges: [mockKraSaleItem] } };
      return {
        data: options?.select ? options.select(response) : response.kraItems.edges,
        isFetching: false,
      };
    },
    useKraCustomersQuery: (
      _args: unknown,
      options?: { select?: (data: any) => any }
    ) => {
      const response = { kraCustomers: { edges: [mockKraSaleCustomer] } };
      return {
        data: options?.select
          ? options.select(response)
          : response.kraCustomers.edges,
      };
    },
    useKraCreateCustomerMutation: () => ({
      mutate: createCustomerMutate,
      isPending: false,
    }),
    useKraCreateSaleMutation: ({ onSuccess, onError, onSettled }: any = {}) => ({
      mutate: (args: any) => {
        createSaleMutate(args);
        if (control.createShouldFail) {
          onError?.({ message: "Mutation failed" });
          onSettled?.();
          return;
        }

        onSuccess?.();
        onSettled?.();
      },
      isPending: false,
    }),
    useEtimsQuantityUnitCodes: () => [{ code: "NMB", name: "Number" }],
  };
});

beforeEach(() => {
  control.createShouldFail = false;
  createSaleMutate.mockClear();
  createCustomerMutate.mockClear();
  vi.mocked(ToastMessage.success).mockClear();
  vi.mocked(ToastMessage.error).mockClear();
});

afterEach(cleanup);

const setup = () => {
  const user = userEvent.setup();

  render(
    <AddButton dialogTitle="Add Sale (Invoice)" buttonText="Add Sale (Invoice)">
      <AddSaleForm />
    </AddButton>
  );

  return user;
};

const openEntryPathDialog = async (
  user: ReturnType<typeof userEvent.setup>
) => {
  await user.click(screen.getByRole("button", { name: /add sale \(invoice\)/i }));

  // Marker-derived checkpoint from recording line 5.
  expect(
    await screen.findByRole("heading", { name: "Add Sale (Invoice)" })
  ).toBeDefined();
};

const addItemAndOpenOtherDetails = async (
  user: ReturnType<typeof userEvent.setup>
) => {
  await user.click(
    screen.getByRole("button", { name: /\+ add item to cart/i })
  );

  // Marker-derived checkpoints from recording lines 8-11.
  expect(
    await screen.findByText("Please enter or select an item")
  ).toBeDefined();
  expect(await screen.findByText("Please enter unit price")).toBeDefined();
  expect(await screen.findByText("Please enter quantity")).toBeDefined();

  await user.click(screen.getByRole("combobox", { name: /item/i }));
  await user.click(await screen.findByText(MOCK_KRA_SALE_ITEM_NAME));

  const quantityInput = screen.getByPlaceholderText("Enter quantity");
  await user.clear(quantityInput);
  await user.type(quantityInput, "4");

  await user.click(
    screen.getByRole("button", { name: /\+ add item to cart/i })
  );

  // Marker-derived checkpoint from recording lines 20-27.
  expect(
    await screen.findByText(new RegExp(MOCK_KRA_SALE_ITEM_NAME, "i"))
  ).toBeDefined();

  const continueButtons = screen.getAllByRole("button", { name: "Continue" });
  await user.click(continueButtons[0]);
};

const openReviewDialog = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(
    screen.getByRole("combobox", { name: /customer pin \/ name/i })
  );
  await user.click(await screen.findByText(CUSTOMER_LABEL));

  const serviceChargeInput = screen.getByPlaceholderText(
    "Enter rate (0-100)%"
  );
  await user.clear(serviceChargeInput);
  await user.type(serviceChargeInput, "1");

  await user.type(
    screen.getByPlaceholderText("Enter a unique trader invoice no."),
    "001"
  );
  await user.type(
    screen.getByPlaceholderText("General information concerning the invoice"),
    "Hello world"
  );

  const continueButtons = screen.getAllByRole("button", { name: "Continue" });
  await user.click(continueButtons[continueButtons.length - 1]);

  return screen.findByRole("dialog", { name: /Review Sale \(Invoice\)/i });
};

describe("AddSaleForm", () => {
  test("follows the add sale entry path and saves a kenya sale", async () => {
    const user = setup();

    await openEntryPathDialog(user);
    await addItemAndOpenOtherDetails(user);
    const reviewDialog = await openReviewDialog(user);

    // Marker-derived checkpoints from recording lines 47-78.
    expect(await within(reviewDialog).findByText(CUSTOMER_LABEL)).toBeDefined();
    expect(
      within(reviewDialog).getByText(mockKraSaleCustomer.phoneNumber)
    ).toBeDefined();
    expect(
      within(reviewDialog).getByText(mockKraSaleCustomer.email)
    ).toBeDefined();
    expect(
      within(reviewDialog).getByText(new RegExp(MOCK_KRA_SALE_ITEM_NAME, "i"))
    ).toBeDefined();
    expect(within(reviewDialog).getByText("x 4")).toBeDefined();
    expect(
      within(reviewDialog).getAllByText(/KES\s*4,800\.00/i)
    ).toHaveLength(2);
    expect(
      within(reviewDialog).getByText("General Invoice Details")
    ).toBeDefined();
    expect(within(reviewDialog).getByText("Hello world")).toBeDefined();

    await user.click(
      within(reviewDialog).getByRole("button", { name: "Save" })
    );

    await waitFor(() => expect(createSaleMutate).toHaveBeenCalledTimes(1));
    expect(createSaleMutate).toHaveBeenCalledWith({
      input: expect.objectContaining({
        businessID: mockKraSaleInputExpectation.businessID,
        customerEmail: mockKraSaleCustomer.email,
        customerID: mockKraSaleCustomer.id,
        customerType: mockKraSaleCustomer.taxPayerType,
        isTaxExempt: false,
        saleDate: expect.any(String),
        serviceChargeRate: 0.01,
        traderInvoiceNumber: "001",
        metadata: {
          client: mockKraSaleInputExpectation.metadata.client,
          user: mockKraSaleInputExpectation.metadata.user,
          general_invoice_details: "Hello world",
        },
        items: [
          expect.objectContaining({
            discountAmount: 0,
            discountRate: 0,
            itemID: mockKraSaleItem.id,
            packageUnitQuantity: 1,
            quantity: 4,
            totalAmount: 4800,
            unitPrice: 1200,
            metadata: { user: mockKraSaleInputExpectation.metadata.user },
          }),
        ],
      }),
    });

    expect(ToastMessage.success).toHaveBeenCalledWith(
      "Sale",
      "Sale added successfully"
    );
  });

  test("shows validation errors when item details are missing", async () => {
    const user = setup();

    await openEntryPathDialog(user);
    await user.click(
      screen.getByRole("button", { name: /\+ add item to cart/i })
    );

    expect(
      await screen.findByText("Please enter or select an item")
    ).toBeDefined();
    expect(await screen.findByText("Please enter unit price")).toBeDefined();
    expect(await screen.findByText("Please enter quantity")).toBeDefined();
    expect(createSaleMutate).not.toHaveBeenCalled();
  });

  test("shows API error toast when sale creation fails", async () => {
    control.createShouldFail = true;
    const user = setup();

    await openEntryPathDialog(user);
    await addItemAndOpenOtherDetails(user);
    const reviewDialog = await openReviewDialog(user);

    await user.click(
      within(reviewDialog).getByRole("button", { name: "Save" })
    );

    await waitFor(() => expect(createSaleMutate).toHaveBeenCalledTimes(1));
    expect(ToastMessage.error).toHaveBeenCalledWith("Sale", "Mutation failed");
  });
});
