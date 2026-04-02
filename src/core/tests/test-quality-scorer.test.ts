import { describe, expect, it } from "vitest";

import { gradeExistingTest } from "#core/existing-test-grader.ts";
import { scoreGeneratedTest } from "#core/scorer.ts";
import { scoreTestQuality } from "#core/test-quality-scorer.ts";

const accessibleSuite = `
describe('PaymentBanner', () => {
  it('renders the saved status', () => {
    render(<PaymentBanner />)
    expect(screen.getByRole('status')).toHaveTextContent('Saved')
  })
})
`;

describe("scoreTestQuality", () => {
  it("merges generation and grading families into one canonical overall", () => {
    const generation = scoreGeneratedTest(accessibleSuite, [
      {
        method: "getByRole",
        query: "screen.getByRole('status')",
        quality: "excellent",
      },
    ]);
    const grading = gradeExistingTest(accessibleSuite);
    const score = scoreTestQuality(accessibleSuite, [
      {
        method: "getByRole",
        query: "screen.getByRole('status')",
        quality: "excellent",
      },
    ]);

    expect(score.families.generation.total).toBe(generation.total);
    expect(score.families.grading.total).toBe(grading.total);
    expect(score.overall).toBe(
      Math.round((generation.total + grading.total) / 2)
    );
  });

  it("uses conservative code-only query scoring when recorder evidence is absent", () => {
    const recordingAware = scoreGeneratedTest(accessibleSuite, []);
    const hybrid = scoreTestQuality(accessibleSuite, {
      queryResults: [],
      queryEvidencePolicy: "code-only",
    });

    expect(recordingAware.dimensions.queryQuality).toBe(100);
    expect(hybrid.families.generation.dimensions.queryQuality).toBe(75);
    expect(hybrid.families.generation.reasons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "code-only-query-scoring" }),
      ])
    );
  });
});
