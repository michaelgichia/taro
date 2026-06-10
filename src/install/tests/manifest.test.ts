import { describe, expect, it } from "vitest";

import {
  classifyAssetConflict,
  createOwnedFile,
  createOwnershipManifest,
} from "#install/manifest.ts";

describe("createOwnershipManifest", () => {
  it("creates a Taro-owned manifest with hashed files", () => {
    const file = createOwnedFile({
      relativePath: "commands/@tr-rtl/cli/help.md",
      kind: "command",
      content: "help asset",
    });
    const manifest = createOwnershipManifest({
      runtime: "claude",
      location: "global",
      files: [file],
      generatedAt: "2026-03-07T16:20:00Z",
    });

    expect(manifest.packageName).toBe("@tr-rtl/cli");
    expect(manifest.files[0]?.checksum).toBeTruthy();
    expect(manifest.generatedAt).toBe("2026-03-07T16:20:00Z");
  });

  it("omits checksums for assets without rendered content and defaults generatedAt", () => {
    const file = createOwnedFile({
      relativePath: "commands/help.md",
      kind: "command",
    });
    const manifest = createOwnershipManifest({
      runtime: "claude",
      location: "global",
      files: [file],
    });

    expect(file.checksum).toBeUndefined();
    expect(manifest.generatedAt).toMatch(/T/);
  });
});

describe("classifyAssetConflict", () => {
  it("treats missing content as a safe create path", () => {
    const conflict = classifyAssetConflict({
      targetPath: "/tmp/help.md",
      existingContent: null,
      manifest: null,
      relativePath: "commands/help.md",
    });

    expect(conflict.kind).toBe("missing");
  });

  it("detects unchanged installer-owned assets from the manifest checksum", () => {
    const file = createOwnedFile({
      relativePath: "commands/help.md",
      kind: "command",
      content: "same-content",
    });
    const manifest = createOwnershipManifest({
      runtime: "claude",
      location: "global",
      files: [file],
    });

    const conflict = classifyAssetConflict({
      targetPath: "/tmp/help.md",
      existingContent: "same-content",
      manifest,
      relativePath: "commands/help.md",
    });

    expect(conflict.kind).toBe("installer-owned");
  });

  it("detects user-modified installer assets", () => {
    const file = createOwnedFile({
      relativePath: "commands/help.md",
      kind: "command",
      content: "original-content",
    });
    const manifest = createOwnershipManifest({
      runtime: "claude",
      location: "global",
      files: [file],
    });

    const conflict = classifyAssetConflict({
      targetPath: "/tmp/help.md",
      existingContent: "user-modified-content",
      manifest,
      relativePath: "commands/help.md",
    });

    expect(conflict.kind).toBe("installer-owned-modified");
  });

  it("treats unknown existing files as external collisions", () => {
    const conflict = classifyAssetConflict({
      targetPath: "/tmp/help.md",
      existingContent: "external-content",
      manifest: null,
      relativePath: "commands/help.md",
    });

    expect(conflict.kind).toBe("external-collision");
  });

  it("treats manifest-owned files without a checksum as installer-owned", () => {
    const manifest = createOwnershipManifest({
      runtime: "claude",
      location: "global",
      files: [{ relativePath: "commands/help.md", kind: "command" }],
    });

    const conflict = classifyAssetConflict({
      targetPath: "/tmp/help.md",
      existingContent: "existing-content",
      manifest,
      relativePath: "commands/help.md",
    });

    expect(conflict.kind).toBe("installer-owned");
  });
});
