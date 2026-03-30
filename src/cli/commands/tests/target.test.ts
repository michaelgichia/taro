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
          }).parseAsync([componentPath], {
            from: "user",
          });
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
    expect(result.exitCode).toBe(0);
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
    expect(result.exitCode).toBe(0);
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
    expect(result.exitCode).toBe(0);
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

    const result = await runTarget([srcDir, "--directory-loop"], root);
    const tracker = await readDirectoryTracker(result.logs);

    expect(result.thrown).toBeUndefined();
    expect(result.exitCode).toBe(0);
    expect(result.logs).toContain("Directory loop mode enabled");
    expect(result.logs).toContain("Directory loop tracker:");
    expect(tracker).toContain("| completed | src/Footer.tsx |");
    expect(tracker).toContain("| completed | src/Header.tsx |");

    const headerTest = await readFile(join(srcDir, "Header.test.tsx"), "utf-8");
    expect(headerTest).toContain("import Header from './Header'");
    expect(headerTest).toContain("render(<Header />)");

    const footerTest = await readFile(join(srcDir, "Footer.test.tsx"), "utf-8");
    expect(footerTest).toContain("import Footer from './Footer'");
    expect(footerTest).toContain("render(<Footer />)");
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

    const result = await runTarget([srcDir, "--directory-loop"], root);

    expect(result.thrown).toBeUndefined();
    expect(result.exitCode).toBe(0);
    expect(result.logs).toContain("Processing 1 pending component file");
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

    const result = await runTarget([srcDir, "--directory-loop"], root);
    const tracker = await readDirectoryTracker(result.logs);

    expect(result.exitCode).toBe(0);
    expect(result.logs).toContain("Processing 1 pending component file");
    expect(tracker).toContain("| completed | src/Header.tsx | src/Header.test.tsx |");
    expect(tracker).toContain("| completed | src/Footer.tsx | src/Footer.test.tsx |");
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
    expect(tracker).toContain("| in-progress | src/Alpha.tsx | src/Alpha.test.tsx |");
    expect(tracker).toContain("| pending | src/Beta.tsx | src/Beta.test.tsx |");
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
    expect(tracker).toContain("| completed | src/Alpha.tsx | src/Alpha.test.tsx |");
    expect(tracker).toContain("| completed | src/Beta.tsx | src/Beta.test.tsx |");
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
    expect(result.logs).toContain("No component source files found");
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
