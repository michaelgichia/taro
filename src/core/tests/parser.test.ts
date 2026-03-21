import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { normalizeStep, parseRecording } from "#core/parser.ts";

const tempDirs: string[] = [];

async function writeTempFile(name: string, content: string) {
  const root = await mkdtemp(join(tmpdir(), "taro-parser-"));
  tempDirs.push(root);
  const filePath = join(root, name);
  await writeFile(filePath, content, "utf8");
  return filePath;
}

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((root) => rm(root, { recursive: true, force: true }))
  );
});

describe("normalizeStep", () => {
  it("normalizes supported recorder step kinds", () => {
    expect(
      normalizeStep({ type: "navigate", url: "http://localhost:3000" } as never)
    ).toEqual(
      expect.objectContaining({
        action: "navigate",
        target: "http://localhost:3000",
        originalType: "navigate",
        source: "json",
      })
    );

    expect(normalizeStep({ type: "keyDown", key: "Enter" } as never)).toEqual(
      expect.objectContaining({
        action: "keyDown",
        value: "Enter",
        originalType: "keyDown",
      })
    );

    expect(
      normalizeStep({ type: "fill", target: "#name", value: "Acme" } as never)
    ).toEqual(
      expect.objectContaining({
        action: "fill",
        target: "#name",
        value: "Acme",
      })
    );
  });

  it("warns for known no-op and unknown step types", () => {
    const warnSpy = vi
      .spyOn(console, "warn")
      .mockImplementation(() => undefined);

    try {
      expect(
        normalizeStep({ type: "waitForSelector", target: "#name" } as never)
      ).toEqual(expect.objectContaining({ action: "unknown" }));

      expect(
        normalizeStep({ type: "mysteryStep", target: "#name" } as never)
      ).toEqual(expect.objectContaining({ action: "unknown" }));

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("not mapped to an RTL action")
      );
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("Unknown step type")
      );
    } finally {
      warnSpy.mockRestore();
    }
  });
});

describe("parseRecording", () => {
  it("throws when the file cannot be read", async () => {
    await expect(parseRecording("/missing/recording.json")).rejects.toThrow(
      "Failed to read recording file"
    );
  });

  it("throws for invalid JSON and invalid recorder shapes", async () => {
    const invalidJsonPath = await writeTempFile("invalid.json", "{");
    const invalidShapePath = await writeTempFile(
      "shape.json",
      JSON.stringify({ title: "Flow" })
    );
    const invalidStepsPath = await writeTempFile(
      "steps.json",
      JSON.stringify({ steps: "bad" })
    );

    await expect(parseRecording(invalidJsonPath)).rejects.toThrow(
      "Invalid JSON"
    );
    await expect(parseRecording(invalidShapePath)).rejects.toThrow(
      'missing required "steps" field'
    );
    await expect(parseRecording(invalidStepsPath)).rejects.toThrow(
      '"steps" must be an array'
    );
  });

  it("parses a valid Chrome Recorder export and attaches json step ids", async () => {
    const filePath = await writeTempFile(
      "recording.json",
      JSON.stringify({
        steps: [
          { type: "click", selectors: [["aria/Save"]] },
          { type: "navigate", url: "http://localhost:3000/orders" },
        ],
        settings: { url: "http://localhost:3000/orders" },
      })
    );

    await expect(parseRecording(filePath)).resolves.toEqual(
      expect.objectContaining({
        title: "Untitled Recording",
        rawStepCount: 2,
        url: "http://localhost:3000/orders",
        steps: [
          expect.objectContaining({
            id: "json-step-1",
            action: "click",
            target: "aria/Save",
            source: "json",
          }),
          expect.objectContaining({
            id: "json-step-2",
            action: "navigate",
            target: "http://localhost:3000/orders",
            source: "json",
          }),
        ],
      })
    );
  });
});
