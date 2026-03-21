import { beforeEach, describe, expect, it } from "vitest";

import { filterNoiseSteps } from "#parser/steps/noise-filter.ts";
import type { RecordingStep } from "#types/recording.ts";

describe("filterNoiseSteps", () => {
  beforeEach(() => {
    // Reset if needed
  });

  it("should return empty array for empty input", () => {
    const result = filterNoiseSteps([]);
    expect(result).toEqual([]);
  });

  it("should return same steps when no noise", () => {
    const steps: RecordingStep[] = [
      {
        id: "step_1",
        type: "click",
        action: "click",
        target: "#btn",
        selector: "#btn",
      },
      {
        id: "step_2",
        type: "fill",
        action: "fill",
        target: "#input",
        selector: "#input",
        value: "test",
      },
    ];
    const result = filterNoiseSteps(steps);
    expect(result).toHaveLength(2);
  });

  it("should filter out doubleClick events", () => {
    const steps: RecordingStep[] = [
      {
        id: "step_1",
        type: "doubleClick",
        action: "doubleClick",
        target: "#btn",
        selector: "#btn",
      },
      {
        id: "step_2",
        type: "click",
        action: "click",
        target: "#btn",
        selector: "#btn",
      },
    ];
    const result = filterNoiseSteps(steps);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe("click");
  });

  it("should filter out mousemove events", () => {
    const steps: RecordingStep[] = [
      {
        id: "step_1",
        type: "click",
        action: "click",
        target: "#btn",
        selector: "#btn",
      },
      {
        id: "step_2",
        type: "click",
        action: "mousemove",
        target: "body",
        selector: "body",
      },
      {
        id: "step_3",
        type: "click",
        action: "click",
        target: "#other",
        selector: "#other",
      },
    ];
    const result = filterNoiseSteps(steps);
    expect(result).toHaveLength(2);
    expect(result[1].id).toBe("step_3");
  });

  it("should filter out accidental scroll (no action within 2s)", () => {
    const steps: RecordingStep[] = [
      {
        id: "step_1",
        type: "scroll",
        action: "scroll",
        target: "body",
        selector: "body",
        timestamp: 1000,
      },
      {
        id: "step_2",
        type: "scroll",
        action: "scroll",
        target: "body",
        selector: "body",
        timestamp: 5000,
      }, // > 2s after step_1, no action after
    ];
    const result = filterNoiseSteps(steps);
    expect(result).toHaveLength(0);
  });

  it("should keep scroll that has action within 2s", () => {
    const steps: RecordingStep[] = [
      {
        id: "step_1",
        type: "scroll",
        action: "scroll",
        target: "body",
        selector: "body",
        timestamp: 1000,
      },
      {
        id: "step_2",
        type: "click",
        action: "click",
        target: "#btn",
        selector: "#btn",
        timestamp: 2500,
      }, // within 2s of scroll
    ];
    const result = filterNoiseSteps(steps);
    expect(result).toHaveLength(2);
  });

  it("should preserve click, fill, select, assert, navigate", () => {
    const steps: RecordingStep[] = [
      {
        id: "step_1",
        type: "navigate",
        action: "navigate",
        target: "/page",
        selector: "",
      },
      {
        id: "step_2",
        type: "fill",
        action: "fill",
        target: "#input",
        selector: "#input",
        value: "test",
      },
      {
        id: "step_3",
        type: "select",
        action: "select",
        target: "#select",
        selector: "#select",
        value: "option1",
      },
      {
        id: "step_4",
        type: "assert",
        action: "assert",
        target: "#element",
        selector: "#element",
      },
      {
        id: "step_5",
        type: "keyDown",
        action: "keyDown",
        target: "#input",
        selector: "#input",
        value: "Enter",
      },
    ];
    const result = filterNoiseSteps(steps);
    expect(result).toHaveLength(5);
  });

  it("keeps scroll steps without timestamps because they cannot be classified safely", () => {
    const steps: RecordingStep[] = [
      {
        id: "step_1",
        type: "scroll",
        action: "scroll",
        target: "body",
        selector: "body",
      },
    ];

    expect(filterNoiseSteps(steps)).toEqual(steps);
  });

  it("marks filtered noise in metadata when debugging metadata already exists", () => {
    const steps: RecordingStep[] = [
      {
        id: "step_1",
        type: "doubleClick",
        action: "doubleClick",
        target: "#btn",
        selector: "#btn",
        metadata: {},
      },
      {
        id: "step_2",
        type: "click",
        action: "mouseenter",
        target: "body",
        selector: "body",
        metadata: {},
      },
    ];

    const result = filterNoiseSteps(steps);

    expect(result).toHaveLength(2);
    expect(result[0].metadata).toEqual(
      expect.objectContaining({
        isNoiseFiltered: true,
        noiseReason: "dblClick filtered",
      })
    );
    expect(result[1].metadata).toEqual(
      expect.objectContaining({
        isNoiseFiltered: true,
        noiseReason: "cursor movement filtered",
      })
    );
  });
});
