import { describe, expect, it } from "vitest";
import { evaluateQualityGates } from "./quality-gates.js";

describe("evaluateQualityGates", () => {
  it("flags repo-disallowed matcher and fragility patterns", () => {
    const result = evaluateQualityGates(`
      import { render, screen, cleanup } from '@testing-library/react'
      import { beforeEach, afterEach, describe, expect, it, vi, waitFor } from 'vitest'

      const mockState = { shouldError: false }
      const save = vi.fn()

      const setup = async () => {
        render(<div>Saved</div>)
        expect(await screen.findByText('Saved')).toBeDefined()
      }

      beforeEach(() => {
        mockState.shouldError = false
      })

      afterEach(() => {
        cleanup()
        document.body.removeAttribute('style')
      })

      describe('Stock modal', () => {
        it('saves values', async () => {
          await setup()
          await waitFor(() => expect(save).toHaveBeenCalledTimes(1))
          expect(save).toHaveBeenCalledWith({ symbol: expect.any(String) })
          expect(screen.getByText(/saved/i)).toBeInTheDocument()
        })
      })
    `);

    expect(result.passed).toBe(true);
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "matchers",
          message: "RTL query results are wrapped in .toBeDefined()",
        }),
        expect.objectContaining({
          type: "matchers",
          message:
            "Mutation payload assertions use loose expect.any/expect.anything matchers",
        }),
        expect.objectContaining({
          type: "matchers",
          message:
            "Mock call count and payload assertions are split across an async boundary",
        }),
        expect.objectContaining({
          type: "fragility",
          message: "Setup helper contains assertions",
        }),
        expect.objectContaining({
          type: "fragility",
          message: "Shared mutable state is controlling mock behavior",
        }),
        expect.objectContaining({
          type: "fragility",
          message: "Teardown compensates for leaked document.body side effects",
        }),
      ])
    );
  });
});
