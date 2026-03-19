# Component Targeting

Target-mode generation must stay evidence-first.

## Rules

- Keep only user-visible assertions that are directly supported by static component source.
- Do not guess prop fixtures from prop names, enum names, ids, dates, counts, slugs, or comparison literals.
- Do not synthesize variant suites from conditional JSX unless the repo already provides an explicit fixture or default example to reuse.
- Do not add sentinel assertions for child components, assets, or dynamic imports.
- Do not serialize child props into `data-prop-*` attributes just to support downstream assertions.
- If the component requires props and Taro cannot find explicit repo-local defaults or fixtures, stop and mark the output as a draft with a blocking finding.

## What To Keep In Code

- export resolution
- render-target import shape
- accessible literal extraction from headings, text, labels, placeholders, and controls
- import collection and boundary detection

## What To Move Out Of Code

- guessed `BASE_PROPS`
- synthetic scenario names
- branch and fallback variant generation
- prop passthrough assertions
- child-component sentinel test ids

## Examples

Bad:

```ts
const BASE_PROPS = {
  id: "record_1",
  displayName: "Profile Card Example",
  organisationType: OrganisationType.Business,
  businessCount: 3,
};
```

Good:

```ts
const renderTargetGap =
  "Component props are required here, but Taro could not find repo-local defaults or fixtures to reuse.";
```

Bad:

```ts
it('renders "Personal" when organisation type is OrganisationType.Individual', () => {
  render(<ProfileCard {...BASE_PROPS} organisationType={OrganisationType.Individual} />)
  expect(screen.getByText('Personal')).toBeVisible()
})
```

Good:

```ts
it('shows the static heading', () => {
  render(<CheckoutForm />)
  expect(screen.getByRole('heading', { name: 'Checkout' })).toBeVisible()
})
```

When required props block a trustworthy render, leave the gap explicit instead of inventing semantics.
