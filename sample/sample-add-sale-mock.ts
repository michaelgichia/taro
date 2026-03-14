/**
 * Shared mock factory for @digitax/data-layer.
 *
 * Usage in a test file:
 *
 *   import {
 *     createDataLayerMock,
 *     createSaleMutate,
 *     useKraCreateSaleMutationMock,
 *     resetDataLayerMock,
 *   } from "@/tests/mocks/digitax-data-layer";
 *
 *   vi.mock("@digitax/data-layer", async (importOriginal) => {
 *     const actual = await importOriginal<typeof import("@digitax/data-layer")>();
 *     return { ...actual, ...createDataLayerMock() };
 *   });
 *
 *   beforeEach(resetDataLayerMock);
 *
 * To override a single hook for one test:
 *
 *   useKraCreateSaleMutationMock.mockImplementationOnce(() => ({
 *     mutate: vi.fn(),
 *     isPending: true,
 *   }));
 */

import type {
  UseInfiniteKraSalesQueryResult,
  UseKraCustomersQueryResult,
  UseKraItemsQueryResult,
} from "@digitax/data-layer";
import { vi } from "vitest";

import {
  MOCK_KRA_SALE_BUSINESS_ID,
  mockKraSaleCustomer,
  mockKraSaleItem,
} from "@/tests/mocks/kenya/sales/add-sale.mock";

// ---------------------------------------------------------------------------
// Hoisted spies — exported so tests can assert on them directly.
// ---------------------------------------------------------------------------

export const createSaleMutate = vi.fn();
export const createSaleReportMutate = vi.fn();

// ---------------------------------------------------------------------------
// Stable mock reference for useKraCreateSaleMutation.
//
// Hoisted outside createDataLayerMock() so every call to the factory returns
// the same function instance. This is what makes vi.mocked(...).mockImplementationOnce
// work reliably in tests — you are always operating on the same reference.
// ---------------------------------------------------------------------------

const defaultCreateSaleMutationImpl = ({ onSuccess, onSettled }: any = {}) => ({
  mutate: (args: any) => {
    createSaleMutate(args);
    onSuccess?.({ kraCreateSale: { id: "kra_sale_001" } });
    onSettled?.();
  },
  isPending: false,
});

export const useKraCreateSaleMutationMock = vi.fn(defaultCreateSaleMutationImpl);

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createDataLayerMock() {
  return {
    useBusinessQuery: (
      _args: unknown,
      options?: { select?: (data: { business: { id: string; logoUrl: string; features: unknown[] } }) => unknown }
    ) => {
      const response = {
        business: { id: MOCK_KRA_SALE_BUSINESS_ID, logoUrl: "", features: [] },
      };
      return {
        data: options?.select ? options.select(response) : response.business,
      };
    },

    useInfiniteKraSalesQuery: (): Partial<UseInfiniteKraSalesQueryResult> => ({
      data: undefined,
      fetchNextPage: vi.fn(),
      hasNextPage: false,
      isLoading: false,
      isFetchingNextPage: false,
      refetch: vi.fn().mockResolvedValue(undefined),
      isFetching: false,
    }),

    useKraSaleQuery: () => ({ data: undefined, isLoading: false }),

    useKraCreateSaleReportMutation: () => ({
      mutate: createSaleReportMutate,
      isPending: false,
    }),

    useBatchDefinitionsQuery: () => ({
      data: [],
      isLoading: false,
      isFetching: false,
      error: undefined,
    }),

    useKraItemsQuery: (
      _args: unknown,
      options?: { select?: (data: { kraItems: { edges: UseKraItemsQueryResult[] } }) => unknown }
    ) => {
      const response = { kraItems: { edges: [mockKraSaleItem] } };
      return {
        data: options?.select ? options.select(response) : response.kraItems.edges,
        isFetching: false,
      };
    },

    useKraCustomersQuery: (
      _args: unknown,
      options?: { select?: (data: { kraCustomers: { edges: UseKraCustomersQueryResult[] } }) => unknown }
    ) => {
      const response = { kraCustomers: { edges: [mockKraSaleCustomer] } };
      return {
        data: options?.select ? options.select(response) : response.kraCustomers.edges,
      };
    },

    useKraCreateCustomerMutation: () => ({ mutate: vi.fn(), isPending: false }),
    useUploadBusinessLogoMutation: () => ({ mutate: vi.fn(), isPending: false }),
    useRemoveBusinessLogoMutation: () => ({ mutate: vi.fn(), isPending: false }),

    useKraCreateSaleMutation: useKraCreateSaleMutationMock,

    useEtimsTaxationTypeCodes: () => [{ code: "B", name: "Tax B" }],
    useEtimsQuantityUnitCodes: () => [{ code: "NMB", name: "Number" }],
  };
}

// ---------------------------------------------------------------------------
// Reset helper — call this in beforeEach.
//
// mockReset() is used instead of mockClear() because it clears both call
// history and any mock implementation state set by a previous test's
// mockImplementationOnce call. The default implementation is then restored
// explicitly so the happy path works without per-test configuration.
// ---------------------------------------------------------------------------

export function resetDataLayerMock() {
  createSaleMutate.mockReset();
  createSaleReportMutate.mockReset();
  useKraCreateSaleMutationMock.mockReset();
  useKraCreateSaleMutationMock.mockImplementation(defaultCreateSaleMutationImpl);
}