import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { harvestComponentCallSites } from "#core/component-call-sites.ts";

const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempRoots
      .splice(0)
      .map((root) => rm(root, { recursive: true, force: true }))
  );
});

async function createWorkspace(label: string) {
  const root = await mkdtemp(join(tmpdir(), `taro-callsites-${label}-`));
  tempRoots.push(root);
  return root;
}

async function writeSource(root: string, relativePath: string, source: string) {
  const fullPath = join(root, relativePath);
  await mkdir(dirname(fullPath), { recursive: true });
  await writeFile(fullPath, source, "utf-8");
  return fullPath;
}

describe("harvestComponentCallSites", () => {
  it("returns an empty array when no JSX usage is found", async () => {
    const root = await createWorkspace("none");
    const componentPath = await writeSource(
      root,
      "src/Widget.tsx",
      [
        "export function Widget({ disabled }: { disabled: boolean }) {",
        "  return <button disabled={disabled}>Go</button>;",
        "}",
      ].join("\n")
    );

    const { evidence } = await harvestComponentCallSites({
      projectRoot: root,
      componentPath,
      componentName: "Widget",
      propNames: ["disabled"],
    });

    expect(evidence).toEqual([]);
  });

  it("ignores same-named JSX imported from a different component file", async () => {
    const root = await createWorkspace("wrong-module");
    const componentPath = await writeSource(
      root,
      "src/modules/uae/items/EditItemForm.tsx",
      [
        "export function EditItemForm({ item }: { item: string }) {",
        "  return <div>{item}</div>;",
        "}",
      ].join("\n")
    );
    await writeSource(
      root,
      "src/modules/kenya/items/EditItemForm.tsx",
      [
        "export function EditItemForm({ item }: { item: string }) {",
        "  return <div>{item}</div>;",
        "}",
      ].join("\n")
    );
    await writeSource(
      root,
      "src/modules/kenya/items/ItemsModule.tsx",
      [
        "import { EditItemForm } from './EditItemForm';",
        "export function ItemsModule() {",
        "  return <EditItemForm item='kenya' />;",
        "}",
      ].join("\n")
    );

    const { diagnostics, evidence } = await harvestComponentCallSites({
      projectRoot: root,
      componentPath,
      componentName: "EditItemForm",
      propNames: ["item"],
    });

    expect(evidence).toEqual([]);
    expect(diagnostics.rejectedSameNameCallSites).toEqual([
      expect.objectContaining({
        filePath: "src/modules/kenya/items/ItemsModule.tsx",
        importPath: "./EditItemForm",
        reason: "different-component",
        resolvedImportPath: "src/modules/kenya/items/EditItemForm.tsx",
      }),
    ]);
  });

  it("matches default import aliases that resolve to the target file", async () => {
    const root = await createWorkspace("default-alias");
    const componentPath = await writeSource(
      root,
      "src/EditItemForm.tsx",
      [
        "export default function EditItemForm({ label }: { label: string }) {",
        "  return <button>{label}</button>;",
        "}",
      ].join("\n")
    );
    await writeSource(
      root,
      "src/Host.tsx",
      [
        "import UaeEdit from './EditItemForm';",
        "export function Host() {",
        "  return <UaeEdit label='UAE item' />;",
        "}",
      ].join("\n")
    );

    const { evidence } = await harvestComponentCallSites({
      projectRoot: root,
      componentPath,
      componentName: "EditItemForm",
      propNames: ["label"],
    });

    expect(evidence).toHaveLength(1);
    expect(evidence[0]).toMatchObject({
      filePath: "src/Host.tsx",
      localName: "UaeEdit",
      importKind: "default",
      importedName: "default",
      resolvedImportPath: "src/EditItemForm.tsx",
      confidence: "import-resolved",
    });
  });

  it("matches aliased named imports that resolve to the target file", async () => {
    const root = await createWorkspace("named-alias");
    const componentPath = await writeSource(
      root,
      "src/EditItemForm.tsx",
      [
        "export function EditItemForm({ item }: { item: string }) {",
        "  return <div>{item}</div>;",
        "}",
      ].join("\n")
    );
    await writeSource(
      root,
      "src/Host.tsx",
      [
        "import { EditItemForm as UaeEditItemForm } from './EditItemForm';",
        "export function Host() {",
        "  return <UaeEditItemForm item='uae' />;",
        "}",
      ].join("\n")
    );

    const { evidence } = await harvestComponentCallSites({
      projectRoot: root,
      componentPath,
      componentName: "EditItemForm",
      propNames: ["item"],
    });

    expect(evidence).toHaveLength(1);
    expect(evidence[0]).toMatchObject({
      filePath: "src/Host.tsx",
      localName: "UaeEditItemForm",
      importKind: "named",
      importedName: "EditItemForm",
    });
    expect(evidence[0].props[0]?.expression).toBe("'uae'");
  });

  it("matches @/ and ~/ imports using project-root conventions", async () => {
    const root = await createWorkspace("repo-aliases");
    const atComponentPath = await writeSource(
      root,
      "src/modules/uae/items/EditItemForm.tsx",
      [
        "export function EditItemForm({ item }: { item: string }) {",
        "  return <div>{item}</div>;",
        "}",
      ].join("\n")
    );
    const tildeComponentPath = await writeSource(
      root,
      "components/UaeDialog.tsx",
      [
        "export function UaeDialog({ title }: { title: string }) {",
        "  return <h1>{title}</h1>;",
        "}",
      ].join("\n")
    );
    await writeSource(
      root,
      "src/AtHost.tsx",
      [
        "import { EditItemForm } from '@/modules/uae/items/EditItemForm';",
        "export function AtHost() {",
        "  return <EditItemForm item='uae' />;",
        "}",
      ].join("\n")
    );
    await writeSource(
      root,
      "src/TildeHost.tsx",
      [
        "import { UaeDialog } from '~/components/UaeDialog';",
        "export function TildeHost() {",
        "  return <UaeDialog title='Dialog' />;",
        "}",
      ].join("\n")
    );

    const { evidence: atEvidence } = await harvestComponentCallSites({
      projectRoot: root,
      componentPath: atComponentPath,
      componentName: "EditItemForm",
      propNames: ["item"],
    });
    const { evidence: tildeEvidence } = await harvestComponentCallSites({
      projectRoot: root,
      componentPath: tildeComponentPath,
      componentName: "UaeDialog",
      propNames: ["title"],
    });

    expect(atEvidence.map((entry) => entry.filePath)).toEqual([
      "src/AtHost.tsx",
    ]);
    expect(tildeEvidence.map((entry) => entry.filePath)).toEqual([
      "src/TildeHost.tsx",
    ]);
  });

  it("ignores barrel imports instead of guessing through re-exports", async () => {
    const root = await createWorkspace("barrel");
    const componentPath = await writeSource(
      root,
      "src/items/EditItemForm.tsx",
      [
        "export function EditItemForm({ item }: { item: string }) {",
        "  return <div>{item}</div>;",
        "}",
      ].join("\n")
    );
    await writeSource(
      root,
      "src/items/index.ts",
      "export { EditItemForm } from './EditItemForm';"
    );
    await writeSource(
      root,
      "src/Host.tsx",
      [
        "import { EditItemForm } from './items';",
        "export function Host() {",
        "  return <EditItemForm item='barrel' />;",
        "}",
      ].join("\n")
    );

    const { diagnostics, evidence } = await harvestComponentCallSites({
      projectRoot: root,
      componentPath,
      componentName: "EditItemForm",
      propNames: ["item"],
    });

    expect(evidence).toEqual([]);
    expect(diagnostics.rejectedSameNameCallSites).toEqual([
      expect.objectContaining({
        importPath: "./items",
        reason: "different-component",
        resolvedImportPath: "src/items/index.ts",
      }),
    ]);
  });

  it("harvests string literals, booleans, and handler identifiers from a call site", async () => {
    const root = await createWorkspace("evidence");
    const componentPath = await writeSource(
      root,
      "src/DeployDeviceDialog.tsx",
      [
        "export interface Props {",
        "  onSubmit: (values: { id: string }) => void;",
        "  isPending: boolean;",
        "  disabled: boolean;",
        "  label: string;",
        "}",
        "export function DeployDeviceDialog({ onSubmit, isPending, disabled, label }: Props) {",
        "  return <button disabled={disabled || isPending} onClick={() => onSubmit({ id: '' })}>{label}</button>;",
        "}",
      ].join("\n")
    );

    await writeSource(
      root,
      "src/business-detail/index.tsx",
      [
        "import { DeployDeviceDialog } from '../DeployDeviceDialog';",
        "export function BusinessDetail() {",
        "  const handleDeploy = () => {};",
        "  return (",
        "    <DeployDeviceDialog",
        "      onSubmit={handleDeploy}",
        "      isPending={false}",
        "      disabled={true}",
        "      label='Deploy device'",
        "    />",
        "  );",
        "}",
      ].join("\n")
    );

    const { evidence } = await harvestComponentCallSites({
      projectRoot: root,
      componentPath,
      componentName: "DeployDeviceDialog",
      propNames: ["onSubmit", "isPending", "disabled", "label"],
    });

    expect(evidence).toHaveLength(1);
    const [callSite] = evidence;
    expect(callSite.filePath.replace(/\\/g, "/")).toBe(
      "src/business-detail/index.tsx"
    );
    const byName = new Map(callSite.props.map((prop) => [prop.name, prop]));
    expect(byName.get("onSubmit")?.expression).toBe("() => {}");
    expect(byName.get("onSubmit")?.origin).toBe("handler");
    expect(byName.get("isPending")?.expression).toBe("false");
    expect(byName.get("isPending")?.origin).toBe("boolean");
    expect(byName.get("disabled")?.expression).toBe("true");
    expect(byName.get("disabled")?.origin).toBe("boolean");
    expect(byName.get("label")?.expression).toBe("'Deploy device'");
    expect(byName.get("label")?.origin).toBe("literal");
  });

  it("ignores the component file itself even if it self-renders", async () => {
    const root = await createWorkspace("self");
    const componentPath = await writeSource(
      root,
      "src/SelfRef.tsx",
      [
        "export function SelfRef({ count }: { count: number }) {",
        "  if (count <= 0) return null;",
        "  return <SelfRef count={count - 1} />;",
        "}",
      ].join("\n")
    );

    const { evidence } = await harvestComponentCallSites({
      projectRoot: root,
      componentPath,
      componentName: "SelfRef",
      propNames: ["count"],
    });

    expect(evidence).toEqual([]);
  });

  it("skips test files and node_modules", async () => {
    const root = await createWorkspace("skip");
    const componentPath = await writeSource(
      root,
      "src/Card.tsx",
      [
        "export function Card({ title }: { title: string }) {",
        "  return <h2>{title}</h2>;",
        "}",
      ].join("\n")
    );

    await writeSource(
      root,
      "src/Card.test.tsx",
      [
        "import { Card } from './Card';",
        "test('renders', () => { return <Card title='hi' />; });",
      ].join("\n")
    );

    await writeSource(
      root,
      "node_modules/some-lib/usage.tsx",
      [
        "import { Card } from 'some-other-lib';",
        "export const Demo = () => <Card title='ignored' />;",
      ].join("\n")
    );

    const { evidence } = await harvestComponentCallSites({
      projectRoot: root,
      componentPath,
      componentName: "Card",
      propNames: ["title"],
    });

    expect(evidence).toEqual([]);
  });

  it("captures numeric literals and falls back to boolean default for unknown identifiers", async () => {
    const root = await createWorkspace("mixed");
    const componentPath = await writeSource(
      root,
      "src/Counter.tsx",
      [
        "export function Counter({ initial, isActive }: { initial: number; isActive: boolean }) {",
        "  return <span>{initial}{isActive ? '*' : ''}</span>;",
        "}",
      ].join("\n")
    );

    await writeSource(
      root,
      "src/host.tsx",
      [
        "import { Counter } from './Counter';",
        "export function Host() {",
        "  return <Counter initial={42} isActive={someUnknown} />;",
        "}",
      ].join("\n")
    );

    const { evidence } = await harvestComponentCallSites({
      projectRoot: root,
      componentPath,
      componentName: "Counter",
      propNames: ["initial", "isActive"],
    });

    expect(evidence).toHaveLength(1);
    const props = new Map(evidence[0].props.map((p) => [p.name, p]));
    expect(props.get("initial")?.expression).toBe("42");
    expect(props.get("initial")?.origin).toBe("literal");
    expect(props.get("isActive")?.expression).toBe("false");
    expect(props.get("isActive")?.origin).toBe("boolean");
  });

  it("returns multiple evidence entries when the component is used in several files", async () => {
    const root = await createWorkspace("multi");
    const componentPath = await writeSource(
      root,
      "src/Banner.tsx",
      [
        "export function Banner({ message }: { message: string }) {",
        "  return <div>{message}</div>;",
        "}",
      ].join("\n")
    );

    await writeSource(
      root,
      "src/pages/home.tsx",
      [
        "import { Banner } from '../Banner';",
        "export const Home = () => <Banner message='home' />;",
      ].join("\n")
    );

    await writeSource(
      root,
      "src/pages/about.tsx",
      [
        "import { Banner } from '../Banner';",
        "export const About = () => <Banner message='about' />;",
      ].join("\n")
    );

    const { evidence } = await harvestComponentCallSites({
      projectRoot: root,
      componentPath,
      componentName: "Banner",
      propNames: ["message"],
    });

    expect(evidence).toHaveLength(2);
    expect(
      evidence
        .map((entry) => entry.filePath.replace(/\\/g, "/"))
        .sort()
    ).toEqual(["src/pages/about.tsx", "src/pages/home.tsx"]);
  });

  it("orders verified call sites by path proximity, concrete props, then file path", async () => {
    const root = await createWorkspace("ranking");
    const componentPath = await writeSource(
      root,
      "src/modules/uae/items/EditItemForm.tsx",
      [
        "export function EditItemForm({ item, isOpen }: { item: string; isOpen: boolean }) {",
        "  return <div>{item}{isOpen ? 'open' : 'closed'}</div>;",
        "}",
      ].join("\n")
    );
    await writeSource(
      root,
      "src/modules/uae/items/ZHost.tsx",
      [
        "import { EditItemForm } from './EditItemForm';",
        "export function ZHost() {",
        "  return <EditItemForm item={item} isOpen={isOpen} />;",
        "}",
      ].join("\n")
    );
    await writeSource(
      root,
      "src/pages/AHost.tsx",
      [
        "import { EditItemForm } from '../modules/uae/items/EditItemForm';",
        "export function AHost() {",
        "  return <EditItemForm item='page' isOpen={true} />;",
        "}",
      ].join("\n")
    );
    await writeSource(
      root,
      "src/modules/uae/other/AHost.tsx",
      [
        "import { EditItemForm } from '../items/EditItemForm';",
        "export function AHost() {",
        "  return <EditItemForm item='near' isOpen={false} />;",
        "}",
      ].join("\n")
    );

    const { evidence } = await harvestComponentCallSites({
      projectRoot: root,
      componentPath,
      componentName: "EditItemForm",
      propNames: ["item", "isOpen"],
    });

    expect(evidence.map((entry) => entry.filePath)).toEqual([
      "src/modules/uae/items/ZHost.tsx",
      "src/modules/uae/other/AHost.tsx",
      "src/pages/AHost.tsx",
    ]);
  });
});
