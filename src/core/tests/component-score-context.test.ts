import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { loadComponentScoreContext } from "#core/component-score-context.ts";

const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempRoots
      .splice(0)
      .map((root) => rm(root, { recursive: true, force: true }))
  );
});

async function createWorkspace(label: string) {
  const root = await mkdtemp(join(tmpdir(), `taro-component-score-${label}-`));
  tempRoots.push(root);
  return root;
}

describe("loadComponentScoreContext", () => {
  it("collects conditional counts, handler counts, import references, and exported utilities", async () => {
    const root = await createWorkspace("context");
    const componentPath = join(root, "src", "ProfileCard.tsx");
    await mkdir(dirname(componentPath), { recursive: true });
    await writeFile(
      componentPath,
      [
        "import Link from 'next/link'",
        "import dynamic from 'next/dynamic'",
        "import { useProfileQuery } from '@/hooks/useProfileQuery'",
        "import { formatStatus } from '@/lib/formatStatus'",
        "import Flag from 'public/images/kenya-flag.svg'",
        "import { PortalShell } from '@/ui/PortalShell'",
        "",
        "export function formatCurrency(cents: number) {",
        "  return `$${(cents / 100).toFixed(2)}`",
        "}",
        "",
        "export default function ProfileCard({ href, isBusiness, count, open, onOpen, displayName, legalName, role, isLoadingProfile, isLoadingMembers }) {",
        '  const LazyBody = dynamic(() => import("./ProfileBody"))',
        "  const profile = useProfileQuery()",
        "  const statusLabels = { idle: 'Idle' }",
        "  const isBusy = isLoadingProfile || isLoadingMembers",
        "  return (",
        "    <Link href={href}>",
        "      <section onClick={onOpen} onMouseEnter={onOpen}>",
        "        <p>{isBusiness ? 'Business' : 'Personal'}</p>",
        "        <p>{count ?? 0}</p>",
        "        <p>{displayName ?? legalName}</p>",
        "        {open && <PortalShell><Flag /></PortalShell>}",
        "        {isBusy ? <p>Loading</p> : null}",
        "        <p>{statusLabels[profile.data?.status ?? 'idle'] ?? null}</p>",
        "        {role === 'admin' && <LazyBody />}",
        "      </section>",
        "    </Link>",
        "  )",
        "}",
        "",
      ].join("\n"),
      "utf-8"
    );

    const context = await loadComponentScoreContext(componentPath);

    expect(context).toEqual(
      expect.objectContaining({
        componentDisplayName: "ProfileCard",
        componentConditionalCount: 8,
        componentEventHandlerCount: 2,
        dynamicImportTargets: ["./ProfileBody"],
        exportedUtilityNames: ["formatCurrency"],
      })
    );
    expect(context?.highSignalBranchHints).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          family: "display-name-fallback",
          coverageTokens: expect.arrayContaining(["displayName", "legalName"]),
        }),
        expect.objectContaining({ family: "null-or-missing-mapped-values" }),
        expect.objectContaining({
          family: "split-loading-flags",
          coverageTokens: expect.arrayContaining([
            "isLoadingMembers",
            "isLoadingProfile",
          ]),
        }),
        expect.objectContaining({
          family: "role-gated-prop-propagation",
          coverageTokens: expect.arrayContaining(["role"]),
        }),
      ])
    );
    expect(context?.componentImportReferences).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ target: "next/link" }),
        expect.objectContaining({ target: "next/dynamic" }),
        expect.objectContaining({
          target: "@/hooks/useProfileQuery",
          kind: "hook",
        }),
        expect.objectContaining({
          target: "@/lib/formatStatus",
          kind: "helper",
        }),
        expect.objectContaining({
          target: "public/images/kenya-flag.svg",
          kind: "asset",
        }),
        expect.objectContaining({
          target: "@/ui/PortalShell",
          guardrailReason: "repo-owned-ui-wrapper",
        }),
      ])
    );
  });

  it("returns null when the file is not a resolvable component module", async () => {
    const root = await createWorkspace("invalid");
    const componentPath = join(root, "src", "not-a-component.ts");
    await mkdir(dirname(componentPath), { recursive: true });
    await writeFile(
      componentPath,
      ["export const meaningOfLife = 42", ""].join("\n"),
      "utf-8"
    );

    await expect(loadComponentScoreContext(componentPath)).resolves.toBeNull();
  });
});
