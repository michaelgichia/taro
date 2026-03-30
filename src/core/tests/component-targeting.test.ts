import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { inferComponentTargetPlan } from "#core/component-targeting.ts";

const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempRoots
      .splice(0)
      .map((root) => rm(root, { recursive: true, force: true }))
  );
});

async function createWorkspace(label: string) {
  const root = await mkdtemp(join(tmpdir(), `taro-component-target-${label}-`));
  tempRoots.push(root);
  return root;
}

describe("inferComponentTargetPlan", () => {
  it("infers accessible assertions from a default-export component", async () => {
    const root = await createWorkspace("default");
    const componentPath = join(root, "src", "CheckoutForm.tsx");
    const outputPath = join(root, "src", "CheckoutForm.test.tsx");
    await mkdir(dirname(componentPath), { recursive: true });
    await writeFile(
      componentPath,
      [
        "export default function CheckoutForm() {",
        "  return (",
        "    <section>",
        "      <h1>Checkout</h1>",
        "      <p>Review your order before payment.</p>",
        "      <label htmlFor='email'>Email</label>",
        "      <input id='email' type='email' />",
        "      <button>Submit order</button>",
        "    </section>",
        "  )",
        "}",
        "",
      ].join("\n"),
      "utf-8"
    );

    const plan = await inferComponentTargetPlan({
      componentPath,
      outputPath,
      projectRoot: root,
    });

    expect(
      plan.findings.some((finding) => finding.severity === "BLOCKING")
    ).toBe(false);
    expect(plan.renderTarget.symbol).toBe("CheckoutForm");
    expect(plan.renderTarget.importKind).toBe("default");
    expect(
      plan.analyzedRecording.intentGroups.map((group) => group.name)
    ).toEqual(
      expect.arrayContaining([
        'renders "Checkout"',
        'renders "Review your order before payment."',
        'renders textbox "Email"',
        'renders button "Submit order"',
      ])
    );
    expect(plan.queryResults.map((query) => query.query)).toContain(
      "screen.getByRole('heading', { name: 'Checkout' })"
    );
    expect(plan.queryResults.map((query) => query.query)).toContain(
      "screen.getByLabelText('Email')"
    );
  });

  it("resolves named-export components and preserves named import semantics", async () => {
    const root = await createWorkspace("named");
    const componentPath = join(root, "src", "CheckoutPanel.tsx");
    const outputPath = join(root, "src", "CheckoutPanel.test.tsx");
    await mkdir(dirname(componentPath), { recursive: true });
    await writeFile(
      componentPath,
      [
        "export const CheckoutPanel = () => (",
        "  <div>",
        "    <h2>Checkout</h2>",
        "    <button>Continue</button>",
        "  </div>",
        ")",
        "",
      ].join("\n"),
      "utf-8"
    );

    const plan = await inferComponentTargetPlan({
      componentPath,
      outputPath,
      projectRoot: root,
    });

    expect(plan.renderTarget.symbol).toBe("CheckoutPanel");
    expect(plan.renderTarget.importKind).toBe("named");
    expect(plan.queryResults.map((query) => query.query)).toContain(
      "screen.getByRole('button', { name: 'Continue' })"
    );
  });

  it("resolves memo-wrapped named exports without changing import semantics", async () => {
    const root = await createWorkspace("memo-named");
    const componentPath = join(root, "src", "CheckoutPanel.tsx");
    const outputPath = join(root, "src", "CheckoutPanel.test.tsx");
    await mkdir(dirname(componentPath), { recursive: true });
    await writeFile(
      componentPath,
      [
        "import { memo } from 'react'",
        "",
        "export const CheckoutPanel = memo(() => (",
        "  <div>",
        "    <h2>Checkout</h2>",
        "    <button>Continue</button>",
        "  </div>",
        "))",
        "",
      ].join("\n"),
      "utf-8"
    );

    const plan = await inferComponentTargetPlan({
      componentPath,
      outputPath,
      projectRoot: root,
    });

    expect(plan.renderTarget.symbol).toBe("CheckoutPanel");
    expect(plan.renderTarget.importKind).toBe("named");
    expect(plan.queryResults.map((query) => query.query)).toContain(
      "screen.getByRole('button', { name: 'Continue' })"
    );
  });

  it("propagates wrapper labels to fields and captures link assertions", async () => {
    const root = await createWorkspace("wrapper-label");
    const componentPath = join(root, "src", "ProfileSummary.tsx");
    const outputPath = join(root, "src", "ProfileSummary.test.tsx");
    await mkdir(dirname(componentPath), { recursive: true });
    await writeFile(
      componentPath,
      [
        "export default function ProfileSummary() {",
        "  return (",
        "    <section>",
        "      <label>",
        "        Email address",
        "        <input type='email' />",
        "      </label>",
        "      <a href='/profiles/primary'>Open profile</a>",
        "    </section>",
        "  )",
        "}",
        "",
      ].join("\n"),
      "utf-8"
    );

    const plan = await inferComponentTargetPlan({
      componentPath,
      outputPath,
      projectRoot: root,
    });

    expect(plan.queryResults).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          matcher: ".toBeVisible()",
          query: "screen.getByLabelText('Email address')",
        }),
        expect.objectContaining({
          matcher: ".toHaveAttribute('href', '/profiles/primary')",
          query: "screen.getByRole('link')",
        }),
      ])
    );
  });

  it("keeps prop-heavy targets as drafts instead of inventing prop-backed scenarios", async () => {
    const root = await createWorkspace("props-and-variants");
    const componentPath = join(root, "src", "ProfileCard.tsx");
    const outputPath = join(root, "src", "tests", "ProfileCard.test.tsx");
    await mkdir(dirname(componentPath), { recursive: true });
    await writeFile(
      componentPath,
      [
        "import Link from 'next/link'",
        "import { OrganisationType } from '@repo/data-layer'",
        "",
        "export default function ProfileCard({ id, displayName, organisationType, businessCount }) {",
        "  return (",
        "    <Link href={`/profiles/${id}`}>",
        "      <div>",
        "        <p>{displayName}</p>",
        "        <p>{organisationType === OrganisationType.Individual ? 'Personal' : 'Business'}</p>",
        "        <p>{businessCount ?? 0}</p>",
        "      </div>",
        "    </Link>",
        "  )",
        "}",
        "",
      ].join("\n"),
      "utf-8"
    );

    const plan = await inferComponentTargetPlan({
      componentPath,
      outputPath,
      projectRoot: root,
    });

    expect(plan.moduleStatements).toEqual(
      expect.arrayContaining([
        expect.stringContaining("UNRESOLVED_COMPONENT_PROPS"),
      ])
    );
    expect(plan.additionalImports ?? []).not.toContain(
      "import { OrganisationType } from '@repo/data-layer'"
    );
    expect(plan.renderExpression).toBe(
      "<ProfileCard {...UNRESOLVED_COMPONENT_PROPS} />"
    );
    expect(plan.queryResults).toEqual([]);
    expect(plan.scenarios).toEqual([]);
    expect(plan.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          severity: "BLOCKING",
          message: expect.stringContaining(
            "could not find explicit repo-local defaults or fixtures to reuse"
          ),
        }),
      ])
    );
  });

  it("emits a blocking finding for opaque wrapper components", async () => {
    const root = await createWorkspace("opaque");
    const componentPath = join(root, "src", "Wrapper.tsx");
    const outputPath = join(root, "src", "Wrapper.test.tsx");
    await mkdir(dirname(componentPath), { recursive: true });
    await writeFile(
      componentPath,
      [
        'import { Shell } from "./Shell"',
        "",
        "export default function Wrapper() {",
        "  return <Shell />",
        "}",
        "",
      ].join("\n"),
      "utf-8"
    );

    const plan = await inferComponentTargetPlan({
      componentPath,
      outputPath,
      projectRoot: root,
    });

    expect(
      plan.findings.some((finding) => finding.severity === "BLOCKING")
    ).toBe(true);
    expect(plan.analyzedRecording.intentGroups).toHaveLength(0);
  });
});
