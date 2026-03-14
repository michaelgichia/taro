import "@/tests/mocks/digitax-components";

import { ToastMessage } from "@digitax/components";

import {
  MOCK_KRA_SALE_CUSTOMER_ID,
  MOCK_KRA_SALE_ITEM_ID,
  MOCK_KRA_SALE_ITEM_NAME,
  MOCK_KRA_SALE_BUSINESS_ID,
  mockKraSaleCustomer,
} from "@/tests/mocks/kenya/sales/add-sale.mock";

import {
  createDataLayerMock,
  createSaleMutate,
  useKraCreateSaleMutationMock,
  resetDataLayerMock,
} from "@/tests/mocks/digitax-data-layer";

import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";

import SalesModule from "./SalesModule";

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock("@clerk/nextjs", () => ({
  useUser: () => ({
    user: { primaryEmailAddress: { emailAddress: "qa@namiri.tech" } },
  }),
  useAuth: () => ({
    getToken: vi.fn().mockResolvedValue("mock-token"),
    isLoaded: true,
  }),
}));

vi.mock("next/navigation", () => ({
  useParams: () => ({ slug: MOCK_KRA_SALE_BUSINESS_ID }),
}));

vi.mock("@/hooks/useCountryData", () => ({ default: () => "KES" }));
vi.mock("@/hooks/useWindowSize", () => ({
  default: () => ({ isMobile: false }),
}));

vi.mock("lodash/debounce", () => ({
  default: <T extends (...args: any[]) => any>(callback: T) => {
    const debounced = (...args: Parameters<T>) => callback(...args);
    debounced.cancel = vi.fn();
    debounced.flush = vi.fn();
    return debounced;
  },
}));

vi.mock("@digitax/data-layer", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@digitax/data-layer")>();
  return { ...actual, ...createDataLayerMock() };
});

// ---------------------------------------------------------------------------
// Per-test setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  resetDataLayerMock();
  vi.mocked(ToastMessage.success).mockClear();
  vi.mocked(ToastMessage.error).mockClear();
});

// ---------------------------------------------------------------------------
// Interaction helpers
//
// Helpers navigate the UI to a specific state. No assertions live here —
// failures surface in the test body, not buried inside a shared function.
// The findBy* calls act as synchronization points, not meaningful checks.
// ---------------------------------------------------------------------------

const setup = () => {
  const user = userEvent.setup();
  render(<SalesModule />);
  return user;
};

const openAddSaleDialog = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(
    screen.getByRole("button", { name: /add sale \(invoice\)/i })
  );
  // Synchronization: wait for dialog to mount before proceeding.
  await screen.findByRole("heading", { name: "Add Sale (Invoice)" });
};

const addItemToCart = async (user: ReturnType<typeof userEvent.setup>) => {
  const addItemStep = screen.getByRole("dialog", {
    name: /add sale \(invoice\)/i,
  });

  await user.click(within(addItemStep).getByRole("combobox", { name: "Item" }));
  await user.click(await screen.findByText(MOCK_KRA_SALE_ITEM_NAME));

  const quantityInput =
    within(addItemStep).getByPlaceholderText("Enter quantity");
  await user.clear(quantityInput);
  await user.type(quantityInput, "1");

  await user.click(
    within(addItemStep).getByRole("button", { name: /\+ add item to cart/i })
  );

  // Synchronization: wait for cart to update.
  await screen.findByText(/LLM masterclass/i);

  // NOTE: This input should have aria-label="Cart item quantity" on the
  // component so it can be queried unambiguously.
  const cartQuantityInput = within(addItemStep).getByRole("spinbutton", {
    name: /cart item quantity/i,
  });
  await user.clear(cartQuantityInput);
  await user.type(cartQuantityInput, "4");

  await user.click(
    within(addItemStep).getByRole("button", { name: /^continue$/i })
  );
};

const fillOtherDetails = async (user: ReturnType<typeof userEvent.setup>) => {
  // Scope to the current step to avoid positional button indexing.
  const otherDetailsStep = screen.getByRole("dialog", {
    name: /other details/i,
  });

  await user.click(
    within(otherDetailsStep).getByRole("combobox", {
      name: /customer pin \/ name/i,
    })
  );
  await user.click(await screen.findByText("A009105523T - John Doe"));

  await user.type(
    within(otherDetailsStep).getByPlaceholderText("Enter rate (0-100)%"),
    "1"
  );
  await user.type(
    within(otherDetailsStep).getByPlaceholderText(
      "Enter a unique trader invoice no."
    ),
    "001"
  );
  await user.type(
    within(otherDetailsStep).getByRole("textbox", {
      name: /general invoice details \(optional\)/i,
    }),
    "Hello world"
  );

  await user.click(
    within(otherDetailsStep).getByRole("button", { name: /^continue$/i })
  );
};

const openReviewDialog = () =>
  screen.findByRole("dialog", { name: /review sale \(invoice\)/i });

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("SalesModule", () => {
  // Verifies that the full flow completes and the mutation fires with the
  // right load-bearing fields. Presentation details live in their own test.
  test("saves a Kenyan sale through the full Add Sale flow", async () => {
    const user = setup();

    await openAddSaleDialog(user);
    await addItemToCart(user);
    await fillOtherDetails(user);

    const reviewDialog = await openReviewDialog();
    await user.click(
      within(reviewDialog).getByRole("button", { name: /^save$/i })
    );

    await waitFor(() => expect(createSaleMutate).toHaveBeenCalledTimes(1));
    expect(createSaleMutate).toHaveBeenCalledWith({
      input: expect.objectContaining({
        customerID: MOCK_KRA_SALE_CUSTOMER_ID,
        customerType: mockKraSaleCustomer.taxPayerType,
        traderInvoiceNumber: "001",
        serviceChargeRate: 0.01,
        items: [
          expect.objectContaining({
            itemID: MOCK_KRA_SALE_ITEM_ID,
            quantity: 4,
          }),
        ],
      }),
    });

    expect(ToastMessage.success).toHaveBeenCalledWith(
      "Sale",
      "Sale added successfully"
    );
  });

  // Verifies that the review dialog accurately reflects what the user entered.
  // Kept separate from the save test so presentation failures don't obscure
  // mutation-level failures and vice versa.
  test("shows entered sale details in the review dialog", async () => {
    const user = setup();

    await openAddSaleDialog(user);
    await addItemToCart(user);
    await fillOtherDetails(user);

    const reviewDialog = await openReviewDialog();

    expect(
      within(reviewDialog).getByRole("heading", {
        name: /review sale \(invoice\)/i,
      })
    ).toBeInTheDocument();
    expect(
      within(reviewDialog).getByText(new RegExp(MOCK_KRA_SALE_ITEM_NAME, "i"))
    ).toBeInTheDocument();
    expect(
      within(reviewDialog).getByText(mockKraSaleCustomer.email)
    ).toBeInTheDocument();
    expect(within(reviewDialog).getByText("Hello world")).toBeInTheDocument();
  });

  test("shows validation errors when item details are missing", async () => {
    const user = setup();

    await openAddSaleDialog(user);
    await user.click(
      screen.getByRole("button", { name: /\+ add item to cart/i })
    );

    expect(
      await screen.findByText("Please enter or select an item")
    ).toBeInTheDocument();
    expect(
      await screen.findByText("Please enter unit price")
    ).toBeInTheDocument();
    expect(
      await screen.findByText("Please enter quantity")
    ).toBeInTheDocument();
  });

  test("shows an error toast when sale creation fails", async () => {
    useKraCreateSaleMutationMock.mockImplementationOnce(
      ({ onError, onSettled }: any = {}) => ({
        mutate: (args: any) => {
          createSaleMutate(args);
          onError?.("Mutation failed");
          onSettled?.();
        },
        isPending: false,
      })
    );

    const user = setup();

    await openAddSaleDialog(user);
    await addItemToCart(user);
    await fillOtherDetails(user);

    const reviewDialog = await openReviewDialog();
    await user.click(
      within(reviewDialog).getByRole("button", { name: /^save$/i })
    );

    await waitFor(() => expect(createSaleMutate).toHaveBeenCalledTimes(1));
    expect(ToastMessage.error).toHaveBeenCalledWith(
      "Sale",
      "An error occurred while adding a sale"
    );
  });

  test("disables the Save button while the mutation is pending", async () => {
    // mockImplementationOnce: the hook is called once per render; this is
    // sufficient and avoids a permanent override that could affect re-renders.
    useKraCreateSaleMutationMock.mockImplementationOnce(() => ({
      mutate: vi.fn(),
      isPending: true,
    }));

    const user = setup();

    await openAddSaleDialog(user);
    await addItemToCart(user);
    await fillOtherDetails(user);

    const reviewDialog = await openReviewDialog();
    expect(
      within(reviewDialog).getByRole("button", { name: /^save$/i })
    ).toBeDisabled();
  });
});
