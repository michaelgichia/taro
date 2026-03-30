import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { stripVTControlCharacters } from "node:util";

import { afterEach, describe, expect, it, vi } from "vitest";

import { createTargetCommand } from "#cli/commands/target.ts";

const sandboxes: string[] = [];

afterEach(async () => {
  await Promise.all(
    sandboxes
      .splice(0)
      .map((root) => rm(root, { recursive: true, force: true }))
  );
});

class ProcessExitSignal {
  constructor(public readonly code: number) {}
}

async function createSandbox(label: string) {
  const root = await mkdtemp(join(tmpdir(), `taro-target-${label}-`));
  sandboxes.push(root);
  await mkdir(root, { recursive: true });
  return root;
}

async function readDirectoryTracker(logs: string) {
  const trackerPathMatch = logs.match(/Directory loop tracker: (.+)/u);
  if (!trackerPathMatch) {
    throw new Error(`Could not find tracker path in logs:\n${logs}`);
  }

  return readFile(trackerPathMatch[1].trim(), "utf-8");
}

async function runTarget(
  args: string[],
  cwdPath: string,
  context?: Parameters<typeof createTargetCommand>[0]
) {
  const effectiveContext = {
    ...context,
    runDirectoryLoopComponent:
      context?.runDirectoryLoopComponent ??
      (async ({ componentPath }: { componentPath: string }) => {
        try {
          await createTargetCommand({
            input: context?.input,
            output: context?.output,
          }).parseAsync([componentPath], { from: "user" });
          return { exitCode: 0 };
        } catch (error) {
          if (error instanceof ProcessExitSignal) {
            return { exitCode: error.code };
          }

          throw error;
        }
      }),
  };
  const command = createTargetCommand(effectiveContext);
  const stderrChunks: string[] = [];
  const stdoutChunks: string[] = [];
  const stderrSpy = vi
    .spyOn(process.stderr, "write")
    .mockImplementation((chunk) => {
      stderrChunks.push(String(chunk));
      return true;
    });
  const stdoutSpy = vi
    .spyOn(process.stdout, "write")
    .mockImplementation((chunk) => {
      stdoutChunks.push(String(chunk));
      return true;
    });
  const exitSpy = vi
    .spyOn(process, "exit")
    .mockImplementation((code?: number) => {
      throw new ProcessExitSignal(code ?? 0);
    });
  const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
  const errorSpy = vi
    .spyOn(console, "error")
    .mockImplementation(() => undefined);
  const originalCwd = process.cwd();
  let thrown: unknown;
  let exitCode: number | undefined;

  process.chdir(cwdPath);

  try {
    await command.parseAsync(args, { from: "user" });
  } catch (error) {
    if (error instanceof ProcessExitSignal) {
      exitCode = error.code;
    } else {
      thrown = error;
    }
  } finally {
    process.chdir(originalCwd);
    stderrSpy.mockRestore();
    stdoutSpy.mockRestore();
    exitSpy.mockRestore();
    warnSpy.mockRestore();
    errorSpy.mockRestore();
  }

  return {
    errors: stripVTControlCharacters(errorSpy.mock.calls.flat().join("\n")),
    exitCode,
    logs: stripVTControlCharacters(stderrChunks.join("")),
    stdout: stripVTControlCharacters(stdoutChunks.join("")),
    thrown,
    warnings: stripVTControlCharacters(warnSpy.mock.calls.flat().join("\n")),
  };
}

describe("createTargetCommand", () => {
  it("generates a colocated test from a default-export component file", async () => {
    const root = await createSandbox("component-only");
    const componentPath = join(root, "src", "CheckoutForm.tsx");
    await mkdir(dirname(componentPath), { recursive: true });
    await writeFile(
      componentPath,
      [
        "export default function CheckoutForm() {",
        "  return (",
        "    <form>",
        "      <h1>Checkout</h1>",
        "      <label htmlFor='email'>Email</label>",
        "      <input id='email' type='email' />",
        "      <button type='submit'>Submit order</button>",
        "    </form>",
        "  )",
        "}",
        "",
      ].join("\n"),
      "utf-8"
    );

    const result = await runTarget([componentPath], root);
    const outputPath = join(root, "src", "CheckoutForm.test.tsx");
    const written = await readFile(outputPath, "utf-8");

    expect(result.thrown).toBeUndefined();
    expect(result.exitCode).toBe(1);
    expect(written).toContain("import CheckoutForm from './CheckoutForm'");
    expect(written).toContain("render(<CheckoutForm />)");
    expect(written).toContain(
      "expect(screen.getByRole('heading', { name: 'Checkout' }))"
    );
    expect(written).toContain("expect(screen.getByLabelText('Email'))");
    expect(written).toContain(
      "expect(screen.getByRole('button', { name: 'Submit order' }))"
    );
  });

  it("prefers a sibling tests directory when local test evidence exists", async () => {
    const root = await createSandbox("local-tests-folder");
    const componentPath = join(root, "src", "widgets", "Button.tsx");
    const testsDir = join(root, "src", "widgets", "tests");
    await mkdir(testsDir, { recursive: true });
    await writeFile(
      componentPath,
      [
        "export default function Button() {",
        "  return <button>Click me</button>",
        "}",
        "",
      ].join("\n"),
      "utf-8"
    );
    await writeFile(
      join(testsDir, "Existing.test.tsx"),
      "describe('existing', () => {})\n",
      "utf-8"
    );

    const result = await runTarget([componentPath], root);
    const outputPath = join(testsDir, "Button.test.tsx");
    const written = await readFile(outputPath, "utf-8");

    expect(result.thrown).toBeUndefined();
    expect(result.exitCode).toBe(1);
    expect(written).toContain("import Button from '../Button'");
    expect(written).toContain("render(<Button />)");
  });

  it("generates prop-backed scenarios for component-only target inference", async () => {
    const root = await createSandbox("prop-backed-target");
    const componentPath = join(root, "src", "ProfileCard.tsx");
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

    const result = await runTarget([componentPath], root);
    const outputPath = join(root, "src", "ProfileCard.test.tsx");
    const written = await readFile(outputPath, "utf-8");

    expect(result.thrown).toBeUndefined();
    expect(result.exitCode).toBe(1);
    expect(written).not.toContain(
      "import { OrganisationType } from '@repo/data-layer'"
    );
    expect(written).toContain("UNRESOLVED_COMPONENT_PROPS");
    expect(written).toContain(
      "replace this placeholder with explicit repo-local props or a recording-backed render path"
    );
    expect(written).toContain(
      "render(<ProfileCard {...UNRESOLVED_COMPONENT_PROPS} />)"
    );
    expect(written).not.toContain("const BASE_PROPS = {");
    expect(written).not.toContain(
      "setup({ organisationType: OrganisationType.Individual })"
    );
    expect(result.logs + result.stdout).toContain(
      "could not find explicit repo-local defaults or fixtures to reuse"
    );
  });

  it("runs post-write health commands and blocks when one fails", async () => {
    const root = await createSandbox("health-gate");
    const componentPath = join(root, "src", "CheckoutForm.tsx");
    const failCommand = `${JSON.stringify(process.execPath)} -e "process.exit(1)"`;
    await mkdir(join(root, ".taro"), { recursive: true });
    await mkdir(dirname(componentPath), { recursive: true });
    await writeFile(
      join(root, ".taro", "overrides.json"),
      JSON.stringify({ healthCommands: [failCommand] }, null, 2) + "\n",
      "utf-8"
    );
    await writeFile(
      componentPath,
      [
        "export default function CheckoutForm() {",
        "  return (",
        "    <form>",
        "      <label htmlFor='email'>Email</label>",
        "      <input id='email' type='email' />",
        "      <button type='submit'>Submit order</button>",
        "    </form>",
        "  )",
        "}",
        "",
      ].join("\n"),
      "utf-8"
    );

    const result = await runTarget([componentPath], root);
    const outputPath = join(root, "src", "CheckoutForm.test.tsx");
    const written = await readFile(outputPath, "utf-8");

    expect(result.thrown).toBeUndefined();
    expect(result.exitCode).toBe(1);
    expect(written).toContain("render(<CheckoutForm />)");
    expect(result.logs).toContain("Running health checks...");
    expect(result.logs).toContain(`[taro:health] $ ${failCommand}`);
    expect(result.logs).toContain(`'${failCommand}' exited with code 1`);
    expect(result.stdout).toContain("[BLOCKING] health");
  });

  it("keeps existing low-confidence output blocked on rerun", async () => {
    const root = await createSandbox("rerun-low-confidence");
    const componentPath = join(root, "src", "CheckoutForm.tsx");
    await mkdir(dirname(componentPath), { recursive: true });
    await writeFile(
      componentPath,
      [
        "export default function CheckoutForm() {",
        "  return (",
        "    <form>",
        "      <label htmlFor='email'>Email</label>",
        "      <input id='email' type='email' />",
        "      <button type='submit'>Submit order</button>",
        "    </form>",
        "  )",
        "}",
        "",
      ].join("\n"),
      "utf-8"
    );

    const firstRun = await runTarget([componentPath], root);
    const secondRun = await runTarget([componentPath], root);

    expect(firstRun.exitCode).toBe(1);
    expect(secondRun.exitCode).toBe(1);
    expect(secondRun.stdout).toContain("[BLOCKING] quality");
    expect(secondRun.stdout).toContain("[BLOCKING] follow-up");
  });

  it("uses the provided component path as the output target even when a recording is supplied", async () => {
    const root = await createSandbox("recording-backed");
    const componentPath = join(root, "src", "CheckoutForm.tsx");
    const recordingPath = join(root, "checkout-flow.js");
    await mkdir(dirname(componentPath), { recursive: true });
    await writeFile(
      componentPath,
      [
        "export function CheckoutForm() {",
        "  return <h1>Checkout</h1>",
        "}",
        "",
      ].join("\n"),
      "utf-8"
    );
    await writeFile(
      recordingPath,
      [
        "const { screen } = require('@testing-library/dom')",
        "const { default: userEvent } = require('@testing-library/user-event')",
        "",
        "test('Checkout flow', async () => {",
        "  await userEvent.click(screen.getByText('Continue'))",
        "  expect(screen.getByText('Review order')).toBeInTheDocument()",
        "})",
        "",
      ].join("\n"),
      "utf-8"
    );

    const result = await runTarget(
      [componentPath, "--recording", recordingPath],
      root
    );
    const outputPath = join(root, "src", "CheckoutForm.test.tsx");
    const written = await readFile(outputPath, "utf-8");

    expect(result.thrown).toBeUndefined();
    expect(result.exitCode).toBe(1);
    expect(written).toContain("import { CheckoutForm } from './CheckoutForm'");
    expect(written).toContain("render(<CheckoutForm />)");
    expect(written).toContain("await user.click(screen.getByText('Continue'))");
    expect(written).not.toContain("render(<App />)");
  });

  it("emits blocking findings when the component surface is too opaque to infer safely", async () => {
    const root = await createSandbox("opaque-component");
    const componentPath = join(root, "src", "DashboardShell.tsx");
    await mkdir(dirname(componentPath), { recursive: true });
    await writeFile(
      componentPath,
      [
        'import { LayoutShell } from "./LayoutShell"',
        "",
        "export default function DashboardShell() {",
        "  return <LayoutShell />",
        "}",
        "",
      ].join("\n"),
      "utf-8"
    );

    const result = await runTarget([componentPath], root);

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain("=== taro:findings:start ===");
    expect(result.stdout).toContain("[BLOCKING] component-target");
    expect(result.stdout).toContain("opaque child components");
  });

  it("accepts an existing output when component inference is blocked but the current test is already valid", async () => {
    const root = await createSandbox("opaque-component-existing-output");
    const componentPath = join(root, "src", "DashboardShell.tsx");
    const outputPath = join(root, "src", "tests", "DashboardShell.test.tsx");
    await mkdir(dirname(componentPath), { recursive: true });
    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(
      componentPath,
      [
        'import { LayoutShell } from "./LayoutShell"',
        "",
        "export default function DashboardShell() {",
        "  return <LayoutShell />",
        "}",
        "",
      ].join("\n"),
      "utf-8"
    );
    await writeFile(
      join(root, "src", "LayoutShell.tsx"),
      [
        "export function LayoutShell() {",
        "  return <main aria-label='Dashboard layout'>Layout shell</main>",
        "}",
        "",
      ].join("\n"),
      "utf-8"
    );
    await writeFile(
      outputPath,
      [
        "import '@testing-library/jest-dom/vitest'",
        "",
        "import { render, screen } from '@testing-library/react'",
        "import { beforeEach, describe, expect, it, vi } from 'vitest'",
        "",
        "import DashboardShell from '../DashboardShell'",
        "",
        "const layoutShellSpy = vi.fn()",
        "",
        "vi.mock('../LayoutShell', () => ({",
        "  LayoutShell: () => {",
        "    layoutShellSpy()",
        "    return (",
        "      <main aria-label='Dashboard layout'>",
        "        <h1>Operations dashboard</h1>",
        "        <p>Layout shell</p>",
        "      </main>",
        "    )",
        "  },",
        "}));",
        "",
        "beforeEach(() => {",
        "  layoutShellSpy.mockClear()",
        "})",
        "",
        "describe('DashboardShell', () => {",
        "  it('renders the dashboard layout shell', () => {",
        "    render(<DashboardShell />)",
        "    const layout = screen.getByRole('main', { name: 'Dashboard layout' })",
        "",
        "    expect(layout).toHaveAttribute('aria-label', 'Dashboard layout')",
        "    expect(layout).toHaveTextContent('Layout shell')",
        "    expect(screen.getByRole('heading', { name: 'Operations dashboard' })).toBeInTheDocument()",
        "    expect(screen.getByRole('heading', { name: 'Operations dashboard' })).toHaveTextContent('Operations dashboard')",
        "    expect(layout).toHaveTextContent('Operations dashboard')",
        "    expect(layout).toHaveTextContent('Layout shell')",
        "  })",
        "",
        "  it('renders the layout shell exactly once per render', () => {",
        "    render(<DashboardShell />)",
        "",
        "    expect(layoutShellSpy).toHaveBeenCalledTimes(1)",
        "  })",
        "})",
        "",
      ].join("\n"),
      "utf-8"
    );

    const result = await runTarget([componentPath], root);

    expect(result.exitCode).toBe(0);
    expect(result.logs).toContain(
      "Reusing existing target output because component inference is blocked"
    );
    expect(result.stdout).not.toContain("[BLOCKING] component-target");
  });

  it("blocks single-file targets that do not export a JSX component", async () => {
    const root = await createSandbox("non-component-file");
    const modulePath = join(root, "src", "reviewTotals.ts");
    await mkdir(dirname(modulePath), { recursive: true });
    await writeFile(
      modulePath,
      [
        "export function reviewTotals(values: number[]) {",
        "  return values.reduce((total, value) => total + value, 0)",
        "}",
        "",
      ].join("\n"),
      "utf-8"
    );

    const result = await runTarget([modulePath], root);

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain("[BLOCKING] component-target");
    expect(result.stdout).toContain(
      "could not resolve an exported JSX component"
    );
  });

  it("rejects test files as target inputs", async () => {
    const root = await createSandbox("reject-test-file");
    const componentPath = join(root, "src", "CheckoutForm.test.tsx");
    await mkdir(dirname(componentPath), { recursive: true });
    await writeFile(
      componentPath,
      "export default function CheckoutFormTest() { return null }\n",
      "utf-8"
    );

    const result = await runTarget([componentPath], root);

    expect(result.exitCode).toBe(2);
    expect(result.logs).toContain("Target component must be a source module");
  });

  it("generates tests for all component files when a directory is passed", async () => {
    const root = await createSandbox("dir-multi");
    const srcDir = join(root, "src");
    await mkdir(srcDir, { recursive: true });

    await writeFile(
      join(srcDir, "Header.tsx"),
      [
        "export default function Header() {",
        "  return <h1>Site Header</h1>",
        "}",
        "",
      ].join("\n"),
      "utf-8"
    );
    await writeFile(
      join(srcDir, "Footer.tsx"),
      [
        "export default function Footer() {",
        "  return <p>Site Footer</p>",
        "}",
        "",
      ].join("\n"),
      "utf-8"
    );

    const result = await runTarget([srcDir, "--directory-loop"], root, {
      runDirectoryLoopComponent: async ({ componentPath }) => {
        const componentName = componentPath
          .replace(/^src\//u, "")
          .replace(/\.tsx$/u, "");
        await writeFile(
          join(srcDir, `${componentName}.test.tsx`),
          `describe('${componentName}', () => {})\n`,
          "utf-8"
        );
        return { exitCode: 0 };
      },
    });
    const tracker = await readDirectoryTracker(result.logs);

    expect(result.thrown).toBeUndefined();
    expect(result.exitCode).toBe(0);
    expect(result.logs).toContain("Directory loop mode enabled");
    expect(result.logs).toContain("Directory loop tracker:");
    expect(tracker).toContain("| completed | src/Footer.tsx |");
    expect(tracker).toContain("| completed | src/Header.tsx |");

    const headerTest = await readFile(join(srcDir, "Header.test.tsx"), "utf-8");
    expect(headerTest).toContain("describe('Header'");

    const footerTest = await readFile(join(srcDir, "Footer.test.tsx"), "utf-8");
    expect(footerTest).toContain("describe('Footer'");
  });

  it("skips test files when scanning a directory", async () => {
    const root = await createSandbox("dir-skip-tests");
    const srcDir = join(root, "src");
    await mkdir(srcDir, { recursive: true });

    await writeFile(
      join(srcDir, "Button.tsx"),
      [
        "export default function Button() {",
        "  return <button>Click me</button>",
        "}",
        "",
      ].join("\n"),
      "utf-8"
    );
    await writeFile(
      join(srcDir, "Existing.test.tsx"),
      "import { render } from '@testing-library/react'\n",
      "utf-8"
    );

    const result = await runTarget([srcDir, "--directory-loop"], root, {
      runDirectoryLoopComponent: async () => {
        await writeFile(
          join(srcDir, "Button.test.tsx"),
          "describe('Button', () => {})\n",
          "utf-8"
        );
        return { exitCode: 0 };
      },
    });

    expect(result.thrown).toBeUndefined();
    expect(result.exitCode).toBe(0);
    expect(result.logs).toContain("Processing 1 pending component file");
  });

  it("skips non-component source files when scanning a directory", async () => {
    const root = await createSandbox("dir-skip-non-components");
    const srcDir = join(root, "src");
    const calls: string[] = [];
    await mkdir(srcDir, { recursive: true });
    await writeFile(
      join(srcDir, "Button.tsx"),
      [
        "export default function Button() {",
        "  return <button>Click me</button>",
        "}",
        "",
      ].join("\n"),
      "utf-8"
    );
    await writeFile(
      join(srcDir, "constants.ts"),
      "export const TAX_RATE = 0.05\n",
      "utf-8"
    );

    const result = await runTarget([srcDir, "--directory-loop"], root, {
      runDirectoryLoopComponent: async ({ componentPath }) => {
        calls.push(componentPath);
        await writeFile(
          join(srcDir, "Button.test.tsx"),
          "describe('Button', () => {})\n",
          "utf-8"
        );
        return { exitCode: 0 };
      },
    });
    const tracker = await readDirectoryTracker(result.logs);

    expect(result.exitCode).toBe(0);
    expect(calls).toEqual(["src/Button.tsx"]);
    expect(result.logs).toContain("Skipping 1 non-component source file");
    expect(tracker).toContain(
      "| completed | src/Button.tsx | src/Button.test.tsx |"
    );
    expect(tracker).not.toContain("constants.ts");
  });

  it("skips already-tested components when building the directory loop tracker", async () => {
    const root = await createSandbox("dir-existing-test");
    const srcDir = join(root, "src");
    await mkdir(srcDir, { recursive: true });
    await writeFile(
      join(srcDir, "Header.tsx"),
      "export default function Header() { return <h1>Site Header</h1> }\n",
      "utf-8"
    );
    await writeFile(
      join(srcDir, "Header.test.tsx"),
      "describe('Header', () => {})\n",
      "utf-8"
    );
    await writeFile(
      join(srcDir, "Footer.tsx"),
      "export default function Footer() { return <p>Site Footer</p> }\n",
      "utf-8"
    );

    const result = await runTarget([srcDir, "--directory-loop"], root, {
      runDirectoryLoopComponent: async () => {
        await writeFile(
          join(srcDir, "Footer.test.tsx"),
          "describe('Footer', () => {})\n",
          "utf-8"
        );
        return { exitCode: 0 };
      },
    });
    const tracker = await readDirectoryTracker(result.logs);

    expect(result.exitCode).toBe(0);
    expect(result.logs).toContain("Processing 1 pending component file");
    expect(tracker).toContain(
      "| completed | src/Header.tsx | src/Header.test.tsx |"
    );
    expect(tracker).toContain(
      "| completed | src/Footer.tsx | src/Footer.test.tsx |"
    );
  });

  it("stops the directory loop on the current component when no test file is produced", async () => {
    const root = await createSandbox("dir-loop-stop");
    const srcDir = join(root, "src");
    const calls: string[] = [];
    await mkdir(srcDir, { recursive: true });
    await writeFile(
      join(srcDir, "Alpha.tsx"),
      "export default function Alpha() { return <h1>Alpha</h1> }\n",
      "utf-8"
    );
    await writeFile(
      join(srcDir, "Beta.tsx"),
      "export default function Beta() { return <h1>Beta</h1> }\n",
      "utf-8"
    );

    const result = await runTarget([srcDir, "--directory-loop"], root, {
      runDirectoryLoopComponent: async ({ componentPath }) => {
        calls.push(componentPath);
        return { exitCode: 1 };
      },
    });
    const tracker = await readDirectoryTracker(result.logs);

    expect(result.exitCode).toBe(1);
    expect(calls).toEqual(["src/Alpha.tsx"]);
    expect(tracker).toContain(
      "| in-progress | src/Alpha.tsx | src/Alpha.test.tsx |"
    );
    expect(tracker).toContain("| pending | src/Beta.tsx | src/Beta.test.tsx |");
  });

  it("retries the current directory-loop component when output exists but the run exits non-zero", async () => {
    const root = await createSandbox("dir-loop-retry-gated");
    const srcDir = join(root, "src");
    const calls: string[] = [];
    await mkdir(srcDir, { recursive: true });
    await writeFile(
      join(srcDir, "Alpha.tsx"),
      "export default function Alpha() { return <h1>Alpha</h1> }\n",
      "utf-8"
    );
    await writeFile(
      join(srcDir, "Beta.tsx"),
      "export default function Beta() { return <h1>Beta</h1> }\n",
      "utf-8"
    );

    const firstRun = await runTarget([srcDir, "--directory-loop"], root, {
      runDirectoryLoopComponent: async ({ componentPath }) => {
        calls.push(componentPath);
        await writeFile(
          join(srcDir, "Alpha.test.tsx"),
          "describe('Alpha', () => {})\n",
          "utf-8"
        );
        return { exitCode: 1 };
      },
    });
    const firstTracker = await readDirectoryTracker(firstRun.logs);

    expect(firstRun.exitCode).toBe(1);
    expect(calls).toEqual(["src/Alpha.tsx"]);
    expect(firstTracker).toContain(
      "| in-progress | src/Alpha.tsx | src/Alpha.test.tsx |"
    );
    expect(firstTracker).toContain(
      "| pending | src/Beta.tsx | src/Beta.test.tsx |"
    );

    calls.length = 0;

    const secondRun = await runTarget([srcDir, "--directory-loop"], root, {
      runDirectoryLoopComponent: async ({ componentPath }) => {
        calls.push(componentPath);
        return { exitCode: 1 };
      },
    });

    expect(secondRun.exitCode).toBe(1);
    expect(calls[0]).toBe("src/Alpha.tsx");
  });

  it("resumes directory-loop work from existing completed outputs", async () => {
    const root = await createSandbox("dir-loop-resume");
    const srcDir = join(root, "src");
    const calls: string[] = [];
    await mkdir(srcDir, { recursive: true });
    await writeFile(
      join(srcDir, "Alpha.tsx"),
      "export default function Alpha() { return <h1>Alpha</h1> }\n",
      "utf-8"
    );
    await writeFile(
      join(srcDir, "Alpha.test.tsx"),
      "describe('Alpha', () => {})\n",
      "utf-8"
    );
    await writeFile(
      join(srcDir, "Beta.tsx"),
      "export default function Beta() { return <h1>Beta</h1> }\n",
      "utf-8"
    );

    const result = await runTarget([srcDir, "--directory-loop"], root, {
      runDirectoryLoopComponent: async ({ componentPath }) => {
        calls.push(componentPath);
        await writeFile(
          join(srcDir, "Beta.test.tsx"),
          "describe('Beta', () => {})\n",
          "utf-8"
        );
        return { exitCode: 0 };
      },
    });
    const tracker = await readDirectoryTracker(result.logs);

    expect(result.exitCode).toBe(0);
    expect(calls).toEqual(["src/Beta.tsx"]);
    expect(tracker).toContain(
      "| completed | src/Alpha.tsx | src/Alpha.test.tsx |"
    );
    expect(tracker).toContain(
      "| completed | src/Beta.tsx | src/Beta.test.tsx |"
    );
  });

  it("reports no files found when the directory has no component source files", async () => {
    const root = await createSandbox("dir-empty");
    const srcDir = join(root, "src");
    await mkdir(srcDir, { recursive: true });
    await writeFile(
      join(srcDir, "styles.css"),
      ".foo { color: red; }\n",
      "utf-8"
    );

    const result = await runTarget([srcDir, "--directory-loop"], root);

    expect(result.exitCode).toBe(0);
    expect(result.logs).toContain("No JSX component source files found");
  });

  it("rejects directory input unless --directory-loop is passed", async () => {
    const root = await createSandbox("dir-requires-flag");
    const srcDir = join(root, "src");
    await mkdir(srcDir, { recursive: true });
    await writeFile(
      join(srcDir, "Header.tsx"),
      "export default function Header() { return <h1>Site Header</h1> }\n",
      "utf-8"
    );

    const result = await runTarget([srcDir], root);

    expect(result.exitCode).toBe(2);
    expect(result.logs).toContain("Directory input requires --directory-loop");
  });

  it("rejects --recording when a directory is passed", async () => {
    const root = await createSandbox("dir-recording-incompatible");
    const srcDir = join(root, "src");
    const recordingPath = join(root, "recording.js");
    await mkdir(srcDir, { recursive: true });
    await writeFile(recordingPath, "test('foo', () => {})\n", "utf-8");

    const result = await runTarget(
      [srcDir, "--directory-loop", "--recording", recordingPath],
      root
    );

    expect(result.exitCode).toBe(2);
    expect(result.logs).toContain(
      "--recording is not compatible with directory input"
    );
  });

  it("rejects --directory-loop when the target is a single file", async () => {
    const root = await createSandbox("file-rejects-dir-flag");
    const componentPath = join(root, "src", "Button.tsx");
    await mkdir(dirname(componentPath), { recursive: true });
    await writeFile(
      componentPath,
      "export default function Button() { return <button>Click me</button> }\n",
      "utf-8"
    );

    const result = await runTarget([componentPath, "--directory-loop"], root);

    expect(result.exitCode).toBe(2);
    expect(result.logs).toContain(
      "--directory-loop is only valid when the target path is a directory"
    );
  });
});
