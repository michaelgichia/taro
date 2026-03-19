import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { inferComponentTargetPlan } from '#core/component-targeting.ts'

const tempRoots: string[] = []

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

async function createWorkspace(label: string) {
  const root = await mkdtemp(join(tmpdir(), `taro-component-target-${label}-`))
  tempRoots.push(root)
  return root
}

describe('inferComponentTargetPlan', () => {
  it('infers accessible assertions from a default-export component', async () => {
    const root = await createWorkspace('default')
    const componentPath = join(root, 'src', 'CheckoutForm.tsx')
    const outputPath = join(root, 'src', 'CheckoutForm.test.tsx')
    await mkdir(dirname(componentPath), { recursive: true })
    await writeFile(
      componentPath,
      [
        'export default function CheckoutForm() {',
        '  return (',
        '    <section>',
        "      <h1>Checkout</h1>",
        "      <p>Review your order before payment.</p>",
        "      <label htmlFor='email'>Email</label>",
        "      <input id='email' type='email' />",
        "      <button>Submit order</button>",
        '    </section>',
        '  )',
        '}',
        '',
      ].join('\n'),
      'utf-8'
    )

    const plan = await inferComponentTargetPlan({
      componentPath,
      outputPath,
      projectRoot: root,
    })

    expect(plan.findings.some((finding) => finding.severity === 'BLOCKING')).toBe(false)
    expect(plan.renderTarget.symbol).toBe('CheckoutForm')
    expect(plan.renderTarget.importKind).toBe('default')
    expect(plan.analyzedRecording.intentGroups.map((group) => group.name)).toEqual(
      expect.arrayContaining([
        'renders "Checkout"',
        'renders "Review your order before payment."',
        'renders textbox "Email"',
        'renders button "Submit order"',
      ])
    )
    expect(plan.queryResults.map((query) => query.query)).toContain(
      "screen.getByRole('heading', { name: 'Checkout' })"
    )
    expect(plan.queryResults.map((query) => query.query)).toContain("screen.getByLabelText('Email')")
  })

  it('resolves named-export components and preserves named import semantics', async () => {
    const root = await createWorkspace('named')
    const componentPath = join(root, 'src', 'CheckoutPanel.tsx')
    const outputPath = join(root, 'src', 'CheckoutPanel.test.tsx')
    await mkdir(dirname(componentPath), { recursive: true })
    await writeFile(
      componentPath,
      [
        'export const CheckoutPanel = () => (',
        '  <div>',
        "    <h2>Checkout</h2>",
        "    <button>Continue</button>",
        '  </div>',
        ')',
        '',
      ].join('\n'),
      'utf-8'
    )

    const plan = await inferComponentTargetPlan({
      componentPath,
      outputPath,
      projectRoot: root,
    })

    expect(plan.renderTarget.symbol).toBe('CheckoutPanel')
    expect(plan.renderTarget.importKind).toBe('named')
    expect(plan.queryResults.map((query) => query.query)).toContain(
      "screen.getByRole('button', { name: 'Continue' })"
    )
  })

  it('builds prop-backed scenarios for conditional text and fallback expressions', async () => {
    const root = await createWorkspace('props-and-variants')
    const componentPath = join(root, 'src', 'ProfileCard.tsx')
    const outputPath = join(root, 'src', 'tests', 'ProfileCard.test.tsx')
    await mkdir(dirname(componentPath), { recursive: true })
    await writeFile(
      componentPath,
      [
        "import Link from 'next/link'",
        "import { OrganisationType } from '@repo/data-layer'",
        '',
        'export default function ProfileCard({ id, displayName, organisationType, businessCount }) {',
        '  return (',
        "    <Link href={`/profiles/${id}`}>",
        '      <div>',
        '        <p>{displayName}</p>',
        "        <p>{organisationType === OrganisationType.Individual ? 'Personal' : 'Business'}</p>",
        '        <p>{businessCount ?? 0}</p>',
        '      </div>',
        '    </Link>',
        '  )',
        '}',
        '',
      ].join('\n'),
      'utf-8'
    )

    const plan = await inferComponentTargetPlan({
      componentPath,
      outputPath,
      projectRoot: root,
    })

    expect(plan.moduleStatements).toEqual(
      expect.arrayContaining([expect.stringContaining('const BASE_PROPS = {')])
    )
    expect(plan.additionalImports).toContain(
      "import { OrganisationType } from '@repo/data-layer'"
    )
    expect(plan.renderExpression).toBe('<ProfileCard {...BASE_PROPS} {...overrides} />')
    expect(plan.queryResults.map((query) => query.query)).toEqual(
      expect.arrayContaining([
        "screen.getByRole('link')",
        "screen.getByText('Profile Card Example')",
        "screen.getByText('Business')",
        "screen.getByText('Personal')",
        "screen.getByText('0')",
      ])
    )
    expect(plan.scenarios).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'renders "Personal" when organisation type is OrganisationType.Individual',
          renderOverrides: '{ organisationType: OrganisationType.Individual }',
        }),
        expect.objectContaining({
          name: 'renders "0" when business count is missing',
          renderOverrides: '{ businessCount: undefined }',
        }),
      ])
    )
  })

  it('emits a blocking finding for opaque wrapper components', async () => {
    const root = await createWorkspace('opaque')
    const componentPath = join(root, 'src', 'Wrapper.tsx')
    const outputPath = join(root, 'src', 'Wrapper.test.tsx')
    await mkdir(dirname(componentPath), { recursive: true })
    await writeFile(
      componentPath,
      [
        'import { Shell } from "./Shell"',
        '',
        'export default function Wrapper() {',
        '  return <Shell />',
        '}',
        '',
      ].join('\n'),
      'utf-8'
    )

    const plan = await inferComponentTargetPlan({
      componentPath,
      outputPath,
      projectRoot: root,
    })

    expect(plan.findings.some((finding) => finding.severity === 'BLOCKING')).toBe(true)
    expect(plan.analyzedRecording.intentGroups).toHaveLength(0)
  })
})
