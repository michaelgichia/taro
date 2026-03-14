import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  analyzeElementProperties,
  recommendQueryMethod,
} from "../src/analyzer/visual/element-analyzer.js";
import type { Page } from "playwright";

// Mock Playwright's Page type for testing
const mockPage = { $: vi.fn(), $eval: vi.fn() } as unknown as Page;

describe("element-analyzer", () => {
  describe("recommendQueryMethod", () => {
    it("should recommend query method for high priority strategy", () => {
      const properties = {
        preferredQuery: {
          method: "getByRole",
          args: ["button", { name: "Submit" }],
          priority: 1,
        },
        alternatives: [],
        hasAccessibleName: true,
        isInteractive: true,
      };

      const result = recommendQueryMethod(properties);
      expect(result).toBe('getByRole("button", {"name":"Submit"})');
    });

    it("should return warning for no good query strategy", () => {
      const properties = {
        preferredQuery: {
          method: "getByRole",
          args: ["generic"],
          priority: 99,
        },
        alternatives: [],
        hasAccessibleName: false,
        isInteractive: false,
      };

      const result = recommendQueryMethod(properties);
      expect(result).toContain("Warning");
      expect(result).toContain("data-testid");
    });

    it("should format regex args correctly", () => {
      const properties = {
        preferredQuery: { method: "getByText", args: [/clicked/], priority: 6 },
        alternatives: [],
        hasAccessibleName: true,
        isInteractive: false,
      };

      const result = recommendQueryMethod(properties);
      expect(result).toBe("getByText(/clicked/)");
    });

    it("should handle string args without options", () => {
      const properties = {
        preferredQuery: {
          method: "getByTestId",
          args: ["submit-button"],
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

  describe("analyzeElementProperties", () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it("should return null when element not found", async () => {
      vi.mocked(mockPage.$).mockResolvedValue(null);

      const result = await analyzeElementProperties(mockPage, "#nonexistent");
      expect(result).toBeNull();
    });
  });
});
