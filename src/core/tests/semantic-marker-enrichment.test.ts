import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { enrichCanonicalSemanticMarkers } from "#core/semantic-marker-enrichment.ts";
import type { NormalizedRecording } from "#types/recording.ts";

const tempDirs: string[] = [];

async function createProject(): Promise<string> {
  const projectRoot = await mkdtemp(join(tmpdir(), "taro-marker-recovery-"));
  tempDirs.push(projectRoot);
  return projectRoot;
}

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map(async (dir) => {
      const { rm } = await import("node:fs/promises");
      await rm(dir, { force: true, recursive: true });
    })
  );
});

function createRecording(target = "Please enter or"): NormalizedRecording {
  return {
    title: "Validation flow",
    rawStepCount: 2,
    steps: [
      {
        id: "js-step-1",
        action: "click",
        target: "+ Add Item to Cart",
        originalType: "click",
        source: "js",
      },
      {
        id: "js-step-2",
        action: "click",
        target,
        originalType: "dblClick",
        source: "js",
        semanticMarkerCandidate: {
          stepId: "js-step-2",
          status: "qualified",
          originalGesture: "dblClick",
          proofSubject: "visible-message",
          target,
          proofText: target,
          sourceContext: { originalType: "dblClick" },
          query: {
            stepId: "js-step-2",
            method: "getByText",
            queryRoot: "screen",
            raw: `screen.getByText('${target}')`,
            target,
          },
          anchor: { anchorStepId: "js-step-1", relation: "follows" },
        },
        metadata: {
          semanticMarkerCandidate: {
            stepId: "js-step-2",
            status: "qualified",
            originalGesture: "dblClick",
            proofSubject: "visible-message",
            target,
            proofText: target,
            sourceContext: { originalType: "dblClick" },
            query: {
              stepId: "js-step-2",
              method: "getByText",
              queryRoot: "screen",
              raw: `screen.getByText('${target}')`,
              target,
            },
            anchor: { anchorStepId: "js-step-1", relation: "follows" },
          },
        },
      },
    ],
  };
}

describe("enrichCanonicalSemanticMarkers", () => {
  it("upgrades partial visible text from a unique source-file match", async () => {
    const projectRoot = await createProject();
    await mkdir(join(projectRoot, "src", "modules"), { recursive: true });
    await writeFile(
      join(projectRoot, "src", "modules", "validators.ts"),
      `export const validationMessage = "Please enter or select an item"\n`,
      "utf-8"
    );

    const recording = createRecording();
    const enriched = await enrichCanonicalSemanticMarkers({
      contextMatches: [
        {
          filePath: "src/modules/validators.ts",
          kind: "source",
          matchedTerms: ["Please enter or"],
          score: 25,
        },
      ],
      projectRoot,
      recording,
    });

    const candidate = enriched.steps[1]?.semanticMarkerCandidate;
    expect(candidate?.proofText).toBe("Please enter or select an item");
    expect(candidate?.query?.target).toBe("Please enter or select an item");
    expect(candidate?.canonicalRecovery).toEqual({
      fromText: "Please enter or",
      sourceFile: "src/modules/validators.ts",
      toText: "Please enter or select an item",
    });
  });

  it("does not recover from test files or hidden implementation strings", async () => {
    const projectRoot = await createProject();
    await mkdir(join(projectRoot, "src", "modules"), { recursive: true });
    await mkdir(join(projectRoot, "src", "modules", "__tests__"), {
      recursive: true,
    });
    await writeFile(
      join(projectRoot, "src", "modules", "__tests__", "validation.test.tsx"),
      `expect(screen.getByText("Please enter or select an item")).toBeVisible()\n`,
      "utf-8"
    );
    await writeFile(
      join(projectRoot, "src", "modules", "selectors.ts"),
      `export const selector = "[data-testid='please-enter-or-select-an-item']"\n`,
      "utf-8"
    );

    const recording = createRecording();
    const enriched = await enrichCanonicalSemanticMarkers({
      contextMatches: [
        {
          filePath: "src/modules/__tests__/validation.test.tsx",
          kind: "test",
          matchedTerms: ["Please enter or"],
          score: 30,
        },
        {
          filePath: "src/modules/selectors.ts",
          kind: "source",
          matchedTerms: ["Please enter or"],
          score: 20,
        },
      ],
      projectRoot,
      recording,
    });

    expect(enriched.steps[1]?.semanticMarkerCandidate?.proofText).toBe(
      "Please enter or"
    );
    expect(
      enriched.steps[1]?.semanticMarkerCandidate?.canonicalRecovery
    ).toBeUndefined();
  });

  it("never rewrites concrete-value markers from source literals", async () => {
    const projectRoot = await createProject();
    await mkdir(join(projectRoot, "src"), { recursive: true });
    await writeFile(
      join(projectRoot, "src", "values.ts"),
      `export const savedValue = "USD 4,800.00"\n`,
      "utf-8"
    );

    const recording = createRecording("USD 4,800.");
    const valueStep = recording.steps[1]!;
    valueStep.semanticMarkerCandidate = {
      ...valueStep.semanticMarkerCandidate!,
      proofSubject: "concrete-value",
      target: "USD 4,800.",
      proofText: "USD 4,800.",
    };
    valueStep.metadata = {
      semanticMarkerCandidate: valueStep.semanticMarkerCandidate,
    };

    const enriched = await enrichCanonicalSemanticMarkers({
      contextMatches: [
        {
          filePath: "src/values.ts",
          kind: "source",
          matchedTerms: ["USD 4,800."],
          score: 25,
        },
      ],
      projectRoot,
      recording,
    });

    expect(enriched.steps[1]?.semanticMarkerCandidate?.proofText).toBe(
      "USD 4,800."
    );
    expect(
      enriched.steps[1]?.semanticMarkerCandidate?.canonicalRecovery
    ).toBeUndefined();
  });

  it("ignores weak or ambiguous source matches and keeps unresolved queries untouched", async () => {
    const projectRoot = await createProject();
    await mkdir(join(projectRoot, "src"), { recursive: true });
    await writeFile(
      join(projectRoot, "src", "messages.ts"),
      [
        `export const first = "Please enter or select an item"`,
        `export const second = "Please enter or select a customer"`,
      ].join("\n"),
      "utf-8"
    );

    const recording = createRecording("Please enter or");
    const enriched = await enrichCanonicalSemanticMarkers({
      contextMatches: [
        {
          filePath: "src/messages.ts",
          kind: "source",
          matchedTerms: ["Please enter or"],
          score: 1,
        },
      ],
      projectRoot,
      recording,
    });

    expect(enriched.steps[1]?.semanticMarkerCandidate?.proofText).toBe(
      "Please enter or"
    );
    expect(
      enriched.steps[1]?.semanticMarkerCandidate?.canonicalRecovery
    ).toBeUndefined();
  });

  it("returns the recording unchanged when there are no source context matches", async () => {
    const projectRoot = await createProject();
    const recording = createRecording("Please enter or");

    const enriched = await enrichCanonicalSemanticMarkers({
      contextMatches: [],
      projectRoot,
      recording,
    });

    expect(enriched).toBe(recording);
  });

  it("returns the recording unchanged when all context matches are test-kind only", async () => {
    const projectRoot = await createProject();
    const recording = createRecording("Please enter or");

    const enriched = await enrichCanonicalSemanticMarkers({
      contextMatches: [
        {
          filePath: "src/__tests__/validation.test.tsx",
          kind: "test",
          matchedTerms: ["Please enter or"],
          score: 30,
        },
      ],
      projectRoot,
      recording,
    });

    expect(enriched).toBe(recording);
  });

  it("returns recording unchanged when source file cannot be read", async () => {
    const projectRoot = await createProject();
    const recording = createRecording("Please enter or");

    const enriched = await enrichCanonicalSemanticMarkers({
      contextMatches: [
        {
          filePath: "src/nonexistent-file.ts",
          kind: "source",
          matchedTerms: ["Please enter or"],
          score: 25,
        },
      ],
      projectRoot,
      recording,
    });

    expect(enriched).toBe(recording);
  });

  it("returns recording unchanged when source file has no user-visible strings", async () => {
    const projectRoot = await createProject();
    await mkdir(join(projectRoot, "src"), { recursive: true });
    await writeFile(
      join(projectRoot, "src", "empty-strings.ts"),
      `// no string literals here\nexport const value = 42\n`,
      "utf-8"
    );

    const recording = createRecording("Please enter or");
    const enriched = await enrichCanonicalSemanticMarkers({
      contextMatches: [
        {
          filePath: "src/empty-strings.ts",
          kind: "source",
          matchedTerms: ["Please enter or"],
          score: 25,
        },
      ],
      projectRoot,
      recording,
    });

    expect(enriched).toBe(recording);
  });

  it("skips steps without a semanticMarkerCandidate", async () => {
    const projectRoot = await createProject();
    await mkdir(join(projectRoot, "src"), { recursive: true });
    await writeFile(
      join(projectRoot, "src", "messages.ts"),
      `export const msg = "Please enter or select an item"\n`,
      "utf-8"
    );

    const recording: import("#types/recording.ts").NormalizedRecording = {
      title: "No candidate flow",
      rawStepCount: 1,
      steps: [
        {
          id: "js-step-1",
          action: "click",
          target: "Submit",
          originalType: "click",
          source: "js",
        },
      ],
    };

    const enriched = await enrichCanonicalSemanticMarkers({
      contextMatches: [
        {
          filePath: "src/messages.ts",
          kind: "source",
          matchedTerms: ["Please enter or"],
          score: 25,
        },
      ],
      projectRoot,
      recording,
    });

    expect(enriched).toBe(recording);
  });

  it("skips candidates whose proofSubject is not heading, visible-message, or field-label", async () => {
    const projectRoot = await createProject();
    await mkdir(join(projectRoot, "src"), { recursive: true });
    await writeFile(
      join(projectRoot, "src", "selectors.ts"),
      `export const selector = "Please enter or select an item"\n`,
      "utf-8"
    );

    const recording = createRecording("Please enter or");
    const step = recording.steps[1]!;
    step.semanticMarkerCandidate = {
      ...step.semanticMarkerCandidate!,
      proofSubject: "selector-target",
    };
    step.metadata = { semanticMarkerCandidate: step.semanticMarkerCandidate };

    const enriched = await enrichCanonicalSemanticMarkers({
      contextMatches: [
        {
          filePath: "src/selectors.ts",
          kind: "source",
          matchedTerms: ["Please enter or"],
          score: 25,
        },
      ],
      projectRoot,
      recording,
    });

    expect(
      enriched.steps[1]?.semanticMarkerCandidate?.canonicalRecovery
    ).toBeUndefined();
  });

  it("skips candidates where buildRecoveredQuery returns undefined (document queryRoot)", async () => {
    const projectRoot = await createProject();
    await mkdir(join(projectRoot, "src"), { recursive: true });
    await writeFile(
      join(projectRoot, "src", "messages.ts"),
      `export const msg = "Please enter or select an item"\n`,
      "utf-8"
    );

    const recording = createRecording("Please enter or");
    const step = recording.steps[1]!;
    step.semanticMarkerCandidate = {
      ...step.semanticMarkerCandidate!,
      query: { ...step.semanticMarkerCandidate!.query!, queryRoot: "document" },
    };
    step.metadata = { semanticMarkerCandidate: step.semanticMarkerCandidate };

    const enriched = await enrichCanonicalSemanticMarkers({
      contextMatches: [
        {
          filePath: "src/messages.ts",
          kind: "source",
          matchedTerms: ["Please enter or"],
          score: 25,
        },
      ],
      projectRoot,
      recording,
    });

    expect(
      enriched.steps[1]?.semanticMarkerCandidate?.canonicalRecovery
    ).toBeUndefined();
  });

  it("skips candidates whose fragment is too short (< 4 chars)", async () => {
    const projectRoot = await createProject();
    await mkdir(join(projectRoot, "src"), { recursive: true });
    await writeFile(
      join(projectRoot, "src", "messages.ts"),
      `export const msg = "OK confirm"\n`,
      "utf-8"
    );

    const recording = createRecording("OK");
    const step = recording.steps[1]!;
    step.semanticMarkerCandidate = {
      ...step.semanticMarkerCandidate!,
      target: "OK",
      proofText: "OK",
      query: {
        ...step.semanticMarkerCandidate!.query!,
        target: "OK",
        raw: `screen.getByText('OK')`,
      },
    };
    step.metadata = { semanticMarkerCandidate: step.semanticMarkerCandidate };

    const enriched = await enrichCanonicalSemanticMarkers({
      contextMatches: [
        {
          filePath: "src/messages.ts",
          kind: "source",
          matchedTerms: ["OK"],
          score: 25,
        },
      ],
      projectRoot,
      recording,
    });

    expect(
      enriched.steps[1]?.semanticMarkerCandidate?.canonicalRecovery
    ).toBeUndefined();
  });

  it("skips candidates where best candidate text is not longer than the fragment", async () => {
    const projectRoot = await createProject();
    await mkdir(join(projectRoot, "src"), { recursive: true });
    await writeFile(
      join(projectRoot, "src", "messages.ts"),
      `export const msg = "Please enter"\n`,
      "utf-8"
    );

    // fragment "Please enter" is exactly 12 chars, candidate "Please enter" is the same length
    const recording = createRecording("Please enter");
    const enriched = await enrichCanonicalSemanticMarkers({
      contextMatches: [
        {
          filePath: "src/messages.ts",
          kind: "source",
          matchedTerms: ["Please enter"],
          score: 25,
        },
      ],
      projectRoot,
      recording,
    });

    expect(
      enriched.steps[1]?.semanticMarkerCandidate?.canonicalRecovery
    ).toBeUndefined();
  });

  it("enriches baseline semanticMarkerCandidates alongside steps", async () => {
    const projectRoot = await createProject();
    await mkdir(join(projectRoot, "src"), { recursive: true });
    await writeFile(
      join(projectRoot, "src", "messages.ts"),
      `export const msg = "Please enter or select an item"\n`,
      "utf-8"
    );

    const target = "Please enter or";
    const recording: import("#types/recording.ts").NormalizedRecording = {
      title: "Baseline flow",
      rawStepCount: 1,
      steps: [
        {
          id: "js-step-1",
          action: "click",
          target,
          originalType: "dblClick",
          source: "js",
          semanticMarkerCandidate: {
            stepId: "js-step-1",
            status: "qualified",
            originalGesture: "dblClick",
            proofSubject: "visible-message",
            target,
            proofText: target,
            sourceContext: { originalType: "dblClick" },
            query: {
              stepId: "js-step-1",
              method: "getByText",
              queryRoot: "screen",
              raw: `screen.getByText('${target}')`,
              target,
            },
          },
          metadata: {
            semanticMarkerCandidate: {
              stepId: "js-step-1",
              status: "qualified",
              originalGesture: "dblClick",
              proofSubject: "visible-message",
              target,
              proofText: target,
              sourceContext: { originalType: "dblClick" },
              query: {
                stepId: "js-step-1",
                method: "getByText",
                queryRoot: "screen",
                raw: `screen.getByText('${target}')`,
                target,
              },
            },
          },
        },
      ],
      baseline: {
        semanticMarkerCandidates: [
          {
            stepId: "js-step-1",
            status: "qualified",
            originalGesture: "dblClick",
            proofSubject: "visible-message",
            target,
            proofText: target,
            sourceContext: { originalType: "dblClick" },
            query: {
              stepId: "js-step-1",
              method: "getByText",
              queryRoot: "screen",
              raw: `screen.getByText('${target}')`,
              target,
            },
          },
        ],
        itGroups: [
          {
            name: "baseline group",
            steps: [
              {
                id: "js-step-1",
                action: "click",
                target,
                originalType: "dblClick",
                source: "js",
                semanticMarkerCandidate: {
                  stepId: "js-step-1",
                  status: "qualified",
                  originalGesture: "dblClick",
                  proofSubject: "visible-message",
                  target,
                  proofText: target,
                  sourceContext: { originalType: "dblClick" },
                  query: {
                    stepId: "js-step-1",
                    method: "getByText",
                    queryRoot: "screen",
                    raw: `screen.getByText('${target}')`,
                    target,
                  },
                },
              },
            ],
          },
        ],
      },
    };

    const enriched = await enrichCanonicalSemanticMarkers({
      contextMatches: [
        {
          filePath: "src/messages.ts",
          kind: "source",
          matchedTerms: ["Please enter or"],
          score: 25,
        },
      ],
      projectRoot,
      recording,
    });

    expect(enriched.steps[0]?.semanticMarkerCandidate?.proofText).toBe(
      "Please enter or select an item"
    );
    expect(enriched.baseline?.semanticMarkerCandidates?.[0]?.proofText).toBe(
      "Please enter or select an item"
    );
    expect(
      enriched.baseline?.itGroups[0]?.steps[0]?.semanticMarkerCandidate
        ?.proofText
    ).toBe("Please enter or select an item");
  });

  it("enriches with a role-based query method", async () => {
    const projectRoot = await createProject();
    await mkdir(join(projectRoot, "src"), { recursive: true });
    await writeFile(
      join(projectRoot, "src", "buttons.ts"),
      `export const label = "Submit order form"\n`,
      "utf-8"
    );

    const target = "Submit order";
    const recording: import("#types/recording.ts").NormalizedRecording = {
      title: "Role query flow",
      rawStepCount: 1,
      steps: [
        {
          id: "js-step-1",
          action: "click",
          target,
          originalType: "dblClick",
          source: "js",
          semanticMarkerCandidate: {
            stepId: "js-step-1",
            status: "qualified",
            originalGesture: "dblClick",
            proofSubject: "visible-message",
            target,
            proofText: target,
            sourceContext: { originalType: "dblClick" },
            query: {
              stepId: "js-step-1",
              method: "getByRole",
              queryRoot: "screen",
              role: "button",
              name: target,
              raw: `screen.getByRole('button', { name: '${target}' })`,
              target,
            },
          },
          metadata: {
            semanticMarkerCandidate: {
              stepId: "js-step-1",
              status: "qualified",
              originalGesture: "dblClick",
              proofSubject: "visible-message",
              target,
              proofText: target,
              sourceContext: { originalType: "dblClick" },
              query: {
                stepId: "js-step-1",
                method: "getByRole",
                queryRoot: "screen",
                role: "button",
                name: target,
                raw: `screen.getByRole('button', { name: '${target}' })`,
                target,
              },
            },
          },
        },
      ],
    };

    const enriched = await enrichCanonicalSemanticMarkers({
      contextMatches: [
        {
          filePath: "src/buttons.ts",
          kind: "source",
          matchedTerms: ["Submit order"],
          score: 25,
        },
      ],
      projectRoot,
      recording,
    });

    const candidate = enriched.steps[0]?.semanticMarkerCandidate;
    expect(candidate?.proofText).toBe("Submit order form");
    expect(candidate?.query?.method).toBe("getByRole");
    expect(candidate?.query?.raw).toContain("Submit order form");
  });

  it("returns recording unchanged when recoveriesByStepId map is empty after all filtering", async () => {
    const projectRoot = await createProject();
    await mkdir(join(projectRoot, "src"), { recursive: true });
    // File has only hidden-evidence strings so no strings pass the filter
    await writeFile(
      join(projectRoot, "src", "selectors.ts"),
      `export const sel = "data-testid='please-enter-or-select-an-item'"\n`,
      "utf-8"
    );

    const recording = createRecording("Please enter or");
    const enriched = await enrichCanonicalSemanticMarkers({
      contextMatches: [
        {
          filePath: "src/selectors.ts",
          kind: "source",
          matchedTerms: ["Please enter or"],
          score: 25,
        },
      ],
      projectRoot,
      recording,
    });

    expect(enriched).toBe(recording);
  });

  it("updates steps that only use metadata.semanticMarkerCandidate without top-level candidate", async () => {
    const projectRoot = await createProject();
    await mkdir(join(projectRoot, "src"), { recursive: true });
    await writeFile(
      join(projectRoot, "src", "messages.ts"),
      `export const msg = "Please enter or select an item"\n`,
      "utf-8"
    );

    const target = "Please enter or";
    const recording: import("#types/recording.ts").NormalizedRecording = {
      title: "Metadata only flow",
      rawStepCount: 1,
      steps: [
        {
          id: "js-step-1",
          action: "click",
          target,
          originalType: "dblClick",
          source: "js",
          metadata: {
            semanticMarkerCandidate: {
              stepId: "js-step-1",
              status: "qualified",
              originalGesture: "dblClick",
              proofSubject: "visible-message",
              target,
              proofText: target,
              sourceContext: { originalType: "dblClick" },
              query: {
                stepId: "js-step-1",
                method: "getByText",
                queryRoot: "screen",
                raw: `screen.getByText('${target}')`,
                target,
              },
            },
          },
        },
      ],
    };

    const enriched = await enrichCanonicalSemanticMarkers({
      contextMatches: [
        {
          filePath: "src/messages.ts",
          kind: "source",
          matchedTerms: ["Please enter or"],
          score: 25,
        },
      ],
      projectRoot,
      recording,
    });

    const candidate = enriched.steps[0]?.semanticMarkerCandidate;
    expect(candidate?.proofText).toBe("Please enter or select an item");
  });

  it("enriches with a getByLabelText query method", async () => {
    const projectRoot = await createProject();
    await mkdir(join(projectRoot, "src"), { recursive: true });
    await writeFile(
      join(projectRoot, "src", "form.ts"),
      `export const label = "Email address field"\n`,
      "utf-8"
    );

    const target = "Email address";
    const recording: import("#types/recording.ts").NormalizedRecording = {
      title: "Label text flow",
      rawStepCount: 1,
      steps: [
        {
          id: "js-step-1",
          action: "click",
          target,
          originalType: "dblClick",
          source: "js",
          semanticMarkerCandidate: {
            stepId: "js-step-1",
            status: "qualified",
            originalGesture: "dblClick",
            proofSubject: "field-label",
            target,
            proofText: target,
            sourceContext: { originalType: "dblClick" },
            query: {
              stepId: "js-step-1",
              method: "getByLabelText",
              queryRoot: "screen",
              raw: `screen.getByLabelText('${target}')`,
              target,
            },
          },
          metadata: {
            semanticMarkerCandidate: {
              stepId: "js-step-1",
              status: "qualified",
              originalGesture: "dblClick",
              proofSubject: "field-label",
              target,
              proofText: target,
              sourceContext: { originalType: "dblClick" },
              query: {
                stepId: "js-step-1",
                method: "getByLabelText",
                queryRoot: "screen",
                raw: `screen.getByLabelText('${target}')`,
                target,
              },
            },
          },
        },
      ],
    };

    const enriched = await enrichCanonicalSemanticMarkers({
      contextMatches: [
        {
          filePath: "src/form.ts",
          kind: "source",
          matchedTerms: ["Email address"],
          score: 25,
        },
      ],
      projectRoot,
      recording,
    });

    const candidate = enriched.steps[0]?.semanticMarkerCandidate;
    expect(candidate?.proofText).toBe("Email address field");
    expect(candidate?.query?.method).toBe("getByLabelText");
  });

  it("skips recoveries when token order cannot be matched inside candidate strings", async () => {
    const projectRoot = await createProject();
    await mkdir(join(projectRoot, "src"), { recursive: true });
    await writeFile(
      join(projectRoot, "src", "messages.ts"),
      `export const msg = "select item please enter"\n`,
      "utf-8"
    );

    const recording = createRecording("Please enter or");
    const enriched = await enrichCanonicalSemanticMarkers({
      contextMatches: [
        {
          filePath: "src/messages.ts",
          kind: "source",
          matchedTerms: ["Please enter or"],
          score: 25,
        },
      ],
      projectRoot,
      recording,
    });

    expect(
      enriched.steps[1]?.semanticMarkerCandidate?.canonicalRecovery
    ).toBeUndefined();
  });

  it("skips candidates whose role query is missing a role value", async () => {
    const projectRoot = await createProject();
    await mkdir(join(projectRoot, "src"), { recursive: true });
    await writeFile(
      join(projectRoot, "src", "buttons.ts"),
      `export const label = "Submit order form"\n`,
      "utf-8"
    );

    const recording = createRecording("Submit order");
    const step = recording.steps[1]!;
    step.semanticMarkerCandidate = {
      ...step.semanticMarkerCandidate!,
      proofSubject: "visible-message",
      query: {
        ...step.semanticMarkerCandidate!.query!,
        method: "getByRole",
        role: undefined,
        raw: `screen.getByRole(undefined, { name: 'Submit order' })`,
      },
    };
    step.metadata = { semanticMarkerCandidate: step.semanticMarkerCandidate };

    const enriched = await enrichCanonicalSemanticMarkers({
      contextMatches: [
        {
          filePath: "src/buttons.ts",
          kind: "source",
          matchedTerms: ["Submit order"],
          score: 25,
        },
      ],
      projectRoot,
      recording,
    });

    expect(
      enriched.steps[1]?.semanticMarkerCandidate?.canonicalRecovery
    ).toBeUndefined();
  });

  it("skips candidates with unsupported query methods even when source text matches", async () => {
    const projectRoot = await createProject();
    await mkdir(join(projectRoot, "src"), { recursive: true });
    await writeFile(
      join(projectRoot, "src", "messages.ts"),
      `export const msg = "Please enter or select an item"\n`,
      "utf-8"
    );

    const recording = createRecording("Please enter or");
    const step = recording.steps[1]!;
    step.semanticMarkerCandidate = {
      ...step.semanticMarkerCandidate!,
      query: {
        ...step.semanticMarkerCandidate!.query!,
        method: "getByTitle",
        raw: `screen.getByTitle('Please enter or')`,
      },
    };
    step.metadata = { semanticMarkerCandidate: step.semanticMarkerCandidate };

    const enriched = await enrichCanonicalSemanticMarkers({
      contextMatches: [
        {
          filePath: "src/messages.ts",
          kind: "source",
          matchedTerms: ["Please enter or"],
          score: 25,
        },
      ],
      projectRoot,
      recording,
    });

    expect(
      enriched.steps[1]?.semanticMarkerCandidate?.canonicalRecovery
    ).toBeUndefined();
  });

  it("skips candidates that are missing a query entirely", async () => {
    const projectRoot = await createProject();
    await mkdir(join(projectRoot, "src"), { recursive: true });
    await writeFile(
      join(projectRoot, "src", "messages.ts"),
      `export const msg = "Please enter or select an item"\n`,
      "utf-8"
    );

    const recording = createRecording("Please enter or");
    const step = recording.steps[1]!;
    step.semanticMarkerCandidate = {
      ...step.semanticMarkerCandidate!,
      query: undefined,
    };
    step.metadata = { semanticMarkerCandidate: step.semanticMarkerCandidate };

    const enriched = await enrichCanonicalSemanticMarkers({
      contextMatches: [
        {
          filePath: "src/messages.ts",
          kind: "source",
          matchedTerms: ["Please enter or"],
          score: 25,
        },
      ],
      projectRoot,
      recording,
    });

    expect(
      enriched.steps[1]?.semanticMarkerCandidate?.canonicalRecovery
    ).toBeUndefined();
  });

  it("uses query.name as the recovery fragment when proofText and target are absent", async () => {
    const projectRoot = await createProject();
    await mkdir(join(projectRoot, "src"), { recursive: true });
    await writeFile(
      join(projectRoot, "src", "buttons.ts"),
      `export const label = "Submit order form"\n`,
      "utf-8"
    );

    const recording = createRecording("ignored");
    const step = recording.steps[1]!;
    step.target = "";
    step.semanticMarkerCandidate = {
      ...step.semanticMarkerCandidate!,
      proofSubject: "visible-message",
      target: "",
      proofText: undefined,
      query: {
        stepId: "js-step-2",
        method: "getByRole",
        queryRoot: "screen",
        role: "button",
        name: "Submit order",
        raw: `screen.getByRole('button', { name: 'Submit order' })`,
        target: undefined,
      },
    };
    step.metadata = { semanticMarkerCandidate: step.semanticMarkerCandidate };

    const enriched = await enrichCanonicalSemanticMarkers({
      contextMatches: [
        {
          filePath: "src/buttons.ts",
          kind: "source",
          matchedTerms: ["Submit order"],
          score: 25,
        },
      ],
      projectRoot,
      recording,
    });

    const candidate = enriched.steps[1]?.semanticMarkerCandidate;
    expect(candidate?.proofText).toBe("Submit order form");
    expect(candidate?.query?.name).toBe("Submit order form");
  });

  it("uses candidate.target as the recovery fragment when query fields are absent", async () => {
    const projectRoot = await createProject();
    await mkdir(join(projectRoot, "src"), { recursive: true });
    await writeFile(
      join(projectRoot, "src", "messages.ts"),
      `export const msg = "Please enter or select an item"\n`,
      "utf-8"
    );

    const recording = createRecording("Please enter or");
    const step = recording.steps[1]!;
    step.semanticMarkerCandidate = {
      ...step.semanticMarkerCandidate!,
      proofText: undefined,
      query: {
        ...step.semanticMarkerCandidate!.query!,
        target: undefined,
        raw: `screen.getByText('fallback')`,
      },
    };
    step.metadata = { semanticMarkerCandidate: step.semanticMarkerCandidate };

    const enriched = await enrichCanonicalSemanticMarkers({
      contextMatches: [
        {
          filePath: "src/messages.ts",
          kind: "source",
          matchedTerms: ["Please enter or"],
          score: 25,
        },
      ],
      projectRoot,
      recording,
    });

    expect(enriched.steps[1]?.semanticMarkerCandidate?.proofText).toBe(
      "Please enter or select an item"
    );
  });

  it("leaves baseline candidates untouched when only the recovered step id is valid", async () => {
    const projectRoot = await createProject();
    await mkdir(join(projectRoot, "src"), { recursive: true });
    await writeFile(
      join(projectRoot, "src", "messages.ts"),
      `export const msg = "Please enter or select an item"\n`,
      "utf-8"
    );

    const target = "Please enter or";
    const recording: import("#types/recording.ts").NormalizedRecording = {
      title: "Baseline edge flow",
      rawStepCount: 2,
      steps: [
        {
          id: "js-step-1",
          action: "click",
          target,
          originalType: "dblClick",
          source: "js",
          semanticMarkerCandidate: {
            stepId: "js-step-1",
            status: "qualified",
            originalGesture: "dblClick",
            proofSubject: "visible-message",
            target,
            proofText: target,
            sourceContext: { originalType: "dblClick" },
            query: {
              stepId: "js-step-1",
              method: "getByText",
              queryRoot: "screen",
              raw: `screen.getByText('${target}')`,
              target,
            },
          },
          metadata: {
            semanticMarkerCandidate: {
              stepId: "js-step-1",
              status: "qualified",
              originalGesture: "dblClick",
              proofSubject: "visible-message",
              target,
              proofText: target,
              sourceContext: { originalType: "dblClick" },
              query: {
                stepId: "js-step-1",
                method: "getByText",
                queryRoot: "screen",
                raw: `screen.getByText('${target}')`,
                target,
              },
            },
          },
        },
        {
          id: "js-step-2",
          action: "click",
          target: "ignored",
          originalType: "click",
          source: "js",
          metadata: {
            semanticMarkerCandidate: {
              stepId: "js-step-2",
              status: "qualified",
              originalGesture: "click",
              proofSubject: "visible-message",
              target: "ignored",
              proofText: "ignored",
              sourceContext: { originalType: "click" },
              query: {
                stepId: "js-step-2",
                method: "getByText",
                queryRoot: "screen",
                raw: `screen.getByText('ignored')`,
                target: "ignored",
              },
            },
          },
        },
      ],
      baseline: {
        semanticMarkerCandidates: [
          {
            stepId: "js-step-1",
            status: "qualified",
            originalGesture: "dblClick",
            proofSubject: "visible-message",
            target,
            proofText: target,
            sourceContext: { originalType: "dblClick" },
            query: {
              stepId: "js-step-1",
              method: "getByText",
              queryRoot: "screen",
              raw: `screen.getByText('${target}')`,
              target,
            },
          },
          {
            stepId: "js-step-2",
            status: "qualified",
            originalGesture: "click",
            proofSubject: "visible-message",
            target: "ignored",
            proofText: "ignored",
            sourceContext: { originalType: "click" },
            query: {
              stepId: "js-step-2",
              method: "getByTestId",
              queryRoot: "screen",
              raw: `screen.getByTestId('ignored')`,
              target: "ignored",
            },
          },
        ],
        itGroups: [
          {
            name: "baseline group",
            steps: [
              {
                id: "js-step-2",
                action: "click",
                target: "ignored",
                originalType: "click",
                source: "js",
                metadata: {
                  semanticMarkerCandidate: {
                    stepId: "js-step-2",
                    status: "qualified",
                    originalGesture: "click",
                    proofSubject: "visible-message",
                    target: "ignored",
                    proofText: "ignored",
                    sourceContext: { originalType: "click" },
                    query: {
                      stepId: "js-step-2",
                      method: "getByTestId",
                      queryRoot: "screen",
                      raw: `screen.getByTestId('ignored')`,
                      target: "ignored",
                    },
                  },
                },
              },
            ],
          },
        ],
      },
    };

    const enriched = await enrichCanonicalSemanticMarkers({
      contextMatches: [
        {
          filePath: "src/messages.ts",
          kind: "source",
          matchedTerms: ["Please enter or"],
          score: 25,
        },
      ],
      projectRoot,
      recording,
    });

    expect(enriched.steps[0]?.semanticMarkerCandidate?.proofText).toBe(
      "Please enter or select an item"
    );
    expect(enriched.baseline?.semanticMarkerCandidates?.[1]?.proofText).toBe(
      "ignored"
    );
    expect(
      enriched.baseline?.itGroups[0]?.steps[0]?.metadata
        ?.semanticMarkerCandidate?.proofText
    ).toBe("ignored");
  });

  it("preserves baseline candidates when recovery cannot rebuild their query shape", async () => {
    const projectRoot = await createProject();
    await mkdir(join(projectRoot, "src"), { recursive: true });
    await writeFile(
      join(projectRoot, "src", "messages.ts"),
      `export const msg = "Please enter or select an item"\n`,
      "utf-8"
    );

    const target = "Please enter or";
    const recording: import("#types/recording.ts").NormalizedRecording = {
      title: "Baseline query preservation flow",
      rawStepCount: 1,
      steps: [
        {
          id: "js-step-1",
          action: "click",
          target,
          originalType: "dblClick",
          source: "js",
          semanticMarkerCandidate: {
            stepId: "js-step-1",
            status: "qualified",
            originalGesture: "dblClick",
            proofSubject: "visible-message",
            target,
            proofText: target,
            sourceContext: { originalType: "dblClick" },
            query: {
              stepId: "js-step-1",
              method: "getByText",
              queryRoot: "screen",
              raw: `screen.getByText('${target}')`,
              target,
            },
          },
          metadata: {
            semanticMarkerCandidate: {
              stepId: "js-step-1",
              status: "qualified",
              originalGesture: "dblClick",
              proofSubject: "visible-message",
              target,
              proofText: target,
              sourceContext: { originalType: "dblClick" },
              query: {
                stepId: "js-step-1",
                method: "getByText",
                queryRoot: "screen",
                raw: `screen.getByText('${target}')`,
                target,
              },
            },
          },
        },
      ],
      baseline: {
        semanticMarkerCandidates: [
          {
            stepId: "js-step-1",
            status: "qualified",
            originalGesture: "dblClick",
            proofSubject: "visible-message",
            target,
            proofText: target,
            sourceContext: { originalType: "dblClick" },
            query: {
              stepId: "js-step-1",
              method: "getByTestId",
              queryRoot: "screen",
              raw: `screen.getByTestId('item-error')`,
              target: "item-error",
            },
          },
        ],
        itGroups: [
          {
            name: "baseline group",
            steps: [
              {
                id: "js-step-1",
                action: "click",
                target,
                originalType: "dblClick",
                source: "js",
                semanticMarkerCandidate: {
                  stepId: "js-step-1",
                  status: "qualified",
                  originalGesture: "dblClick",
                  proofSubject: "visible-message",
                  target,
                  proofText: target,
                  sourceContext: { originalType: "dblClick" },
                  query: {
                    stepId: "js-step-1",
                    method: "getByTestId",
                    queryRoot: "screen",
                    raw: `screen.getByTestId('item-error')`,
                    target: "item-error",
                  },
                },
              },
            ],
          },
        ],
      },
    };

    const enriched = await enrichCanonicalSemanticMarkers({
      contextMatches: [
        {
          filePath: "src/messages.ts",
          kind: "source",
          matchedTerms: ["Please enter or"],
          score: 25,
        },
      ],
      projectRoot,
      recording,
    });

    expect(enriched.steps[0]?.semanticMarkerCandidate?.proofText).toBe(
      "Please enter or select an item"
    );
    expect(enriched.baseline?.semanticMarkerCandidates?.[0]?.proofText).toBe(
      "Please enter or"
    );
    expect(
      enriched.baseline?.semanticMarkerCandidates?.[0]?.query?.method
    ).toBe("getByTestId");
    expect(
      enriched.baseline?.itGroups[0]?.steps[0]?.semanticMarkerCandidate
        ?.proofText
    ).toBe("Please enter or");
  });
});
