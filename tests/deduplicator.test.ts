import { describe, it, expect, beforeEach } from "vitest";
import { deduplicateSteps } from "./src/parser/steps/deduplicator.js";
import type { RecordingStep } from "./src/types/recording.js";

describe("deduplicateSteps", () => {
  beforeEach(() => {
    // Reset if needed
  });

  it("should return empty array for empty input", () => {
    const result = deduplicateSteps([]);
    expect(result).toEqual([]);
  });

  it("should return same steps when no duplicates", () => {
    const steps: RecordingStep[] = [
      {
        id: "step_1",
        type: "click",
        action: "click",
        target: "#btn1",
        selector: "#btn1",
        timestamp: 1000,
      },
      {
        id: "step_2",
        type: "click",
        action: "click",
        target: "#btn2",
        selector: "#btn2",
        timestamp: 2000,
      },
    ];
    const result = deduplicateSteps(steps);
    expect(result).toHaveLength(2);
  });

  it("should consolidate rapid clicks on same element", () => {
    const steps: RecordingStep[] = [
      {
        id: "step_1",
        type: "click",
        action: "click",
        target: "#submit",
        selector: "#submit",
        timestamp: 1000,
      },
      {
        id: "step_2",
        type: "click",
        action: "click",
        target: "#submit",
        selector: "#submit",
        timestamp: 1200,
      },
      {
        id: "step_3",
        type: "click",
        action: "click",
        target: "#submit",
        selector: "#submit",
        timestamp: 1400,
      },
    ];
    const result = deduplicateSteps(steps);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("step_1");
  });

  it("should NOT deduplicate clicks on different elements", () => {
    const steps: RecordingStep[] = [
      {
        id: "step_1",
        type: "click",
        action: "click",
        target: "#btn1",
        selector: "#btn1",
        timestamp: 1000,
      },
      {
        id: "step_2",
        type: "click",
        action: "click",
        target: "#btn2",
        selector: "#btn2",
        timestamp: 1200,
      },
    ];
    const result = deduplicateSteps(steps);
    expect(result).toHaveLength(2);
  });

  it("should handle clicks beyond threshold separately", () => {
    const steps: RecordingStep[] = [
      {
        id: "step_1",
        type: "click",
        action: "click",
        target: "#submit",
        selector: "#submit",
        timestamp: 1000,
      },
      {
        id: "step_2",
        type: "click",
        action: "click",
        target: "#submit",
        selector: "#submit",
        timestamp: 2000,
      }, // > 500ms apart
    ];
    const result = deduplicateSteps(steps);
    expect(result).toHaveLength(2);
  });

  it("should preserve order of non-duplicate clicks", () => {
    const steps: RecordingStep[] = [
      {
        id: "step_1",
        type: "click",
        action: "click",
        target: "#btn1",
        selector: "#btn1",
        timestamp: 1000,
      },
      {
        id: "step_2",
        type: "click",
        action: "click",
        target: "#btn1",
        selector: "#btn1",
        timestamp: 1200,
      }, // duplicate
      {
        id: "step_3",
        type: "click",
        action: "click",
        target: "#btn2",
        selector: "#btn2",
        timestamp: 1400,
      },
    ];
    const result = deduplicateSteps(steps);
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe("step_1");
    expect(result[1].id).toBe("step_3");
  });
});
