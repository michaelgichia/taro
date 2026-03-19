import { beforeEach, describe, expect, it } from "vitest";

import { deduplicateSteps } from "#parser/steps/deduplicator.ts";
import type { RecordingStep } from "#types/recording.ts";

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

  it("treats untimestamped duplicate clicks as rapid duplicates and falls back to target matching", () => {
    const steps: RecordingStep[] = [
      {
        id: "step_1",
        type: "doubleClick",
        action: "doubleClick",
        target: "#submit",
      },
      { id: "step_2", type: "click", action: "click", target: "#submit" },
    ];

    expect(deduplicateSteps(steps)).toEqual([steps[0]]);
  });

  it("stops scanning once a later click is outside the threshold window", () => {
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
        timestamp: 1700,
      },
      {
        id: "step_3",
        type: "click",
        action: "click",
        target: "#submit",
        selector: "#submit",
        timestamp: 1750,
      },
    ];

    const result = deduplicateSteps(steps);

    expect(result).toEqual([steps[0], steps[1]]);
  });

  it("skips non-click steps while continuing to deduplicate later click clusters", () => {
    const steps: RecordingStep[] = [
      {
        id: "step_0",
        type: "change",
        action: "fill",
        target: "#name",
        selector: "#name",
        timestamp: 900,
      },
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
    ];

    expect(deduplicateSteps(steps)).toEqual([steps[0], steps[1]]);
  });
});
