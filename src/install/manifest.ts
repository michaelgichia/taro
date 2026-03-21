import { createHash } from "node:crypto";

import type {
  InstallAssetConflict,
  InstallAssetConflictKind,
  InstallAssetKind,
  InstallLocation,
  InstallOwnedFile,
  InstallOwnershipManifest,
  RuntimeTarget,
} from "#install/types.ts";

interface CreateOwnershipManifestParams {
  runtime: RuntimeTarget;
  location: InstallLocation;
  files: InstallOwnedFile[];
  generatedAt?: string;
}

interface ClassifyAssetConflictParams {
  targetPath: string;
  existingContent?: string | null;
  manifest?: InstallOwnershipManifest | null;
  relativePath: string;
}

export function createOwnedFile(params: {
  relativePath: string;
  kind: InstallAssetKind;
  content?: string;
}): InstallOwnedFile {
  const checksum = params.content
    ? createHash("sha256").update(params.content).digest("hex")
    : undefined;

  return { relativePath: params.relativePath, kind: params.kind, checksum };
}

export function createOwnershipManifest(
  params: CreateOwnershipManifestParams
): InstallOwnershipManifest {
  return {
    packageName: "@taro-test/rtl",
    runtime: params.runtime,
    location: params.location,
    manifestVersion: 1,
    generatedAt: params.generatedAt ?? new Date().toISOString(),
    files: params.files,
  };
}

function resolveConflictKind(
  params: ClassifyAssetConflictParams
): InstallAssetConflictKind {
  const { existingContent, manifest, relativePath } = params;

  if (existingContent == null) {
    return "missing";
  }

  const manifestFile = manifest?.files.find(
    (file) => file.relativePath === relativePath
  );

  if (!manifestFile) {
    return "external-collision";
  }

  if (!manifestFile.checksum) {
    return "installer-owned";
  }

  const existingChecksum = createHash("sha256")
    .update(existingContent)
    .digest("hex");
  return existingChecksum === manifestFile.checksum
    ? "installer-owned"
    : "installer-owned-modified";
}

export function classifyAssetConflict(
  params: ClassifyAssetConflictParams
): InstallAssetConflict {
  return { kind: resolveConflictKind(params), targetPath: params.targetPath };
}
