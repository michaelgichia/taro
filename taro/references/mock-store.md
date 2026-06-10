# Boundary Support and Mock Store

Location:

- `packages/**/src/tests/mock-store/`
- `packages/**/src/tests/mocks/`
- `packages/**/src/tests/fixtures/`
- `packages/**/src/tests/factories/`

Rules:

- Deterministic IDs (ORG_001, INV_001)
- No random UUIDs
- Export seed objects
- Central index.ts exports all fixtures
- Prefer collaborator-oriented modules over component-specific inline mocks
- Shared support modules should expose stable factory/reset/override exports when tests need per-test scenario control
- Framework shims should stay minimal and mechanical. They may preserve render shape, but they must not invent semantic labels, sentinel test ids, prop serialization, or guessed loader behavior.
- Never use mutable shared objects to steer mock behavior across tests. Do not split behavior across a hoisted control object, a `beforeEach` reset block, and per-test field mutations. That pattern hides the real scenario, couples the object shape to manual reset logic, and lets fields leak between tests when reset lines drift.
- Hoist plain `vi.fn()` handles only. Keep the `vi.mock(...)` factory responsible for module shape only. Set the default happy-path `mockImplementation` in `beforeEach`, and let each non-happy-path test replace it with a complete inline `mockImplementation` that describes the scenario in one place.
- Low-confidence scaffolds may create empty seam modules with hoisted mock handles and reset wiring only. They must not invent query/mutation return shapes like `isLoading`, `isPending`, `data`, `mutate`, or `mutateAsync`.

Example:

export const ORG_001 = { id: "ORG_001", name: "Test Organisation", active: true };

Shared module support shape:

```ts
export const createSaleMutate = vi.fn();
export const useCreateSaleMutationMock = vi.fn();

export function createDataLayerMock() {
  return { useCreateSaleMutation: useCreateSaleMutationMock };
}

export function resetDataLayerMock() {
  createSaleMutate.mockReset();
  useCreateSaleMutationMock.mockReset();
}
```

Taro treats these locations as payload sources for learned boundary profiles. When no learned support exists, `gen` can scaffold a low-confidence central support module instead of emitting repo-local query-hook implementations inline in the test file.

## Framework Shims

Use framework shims only when the repo does not already expose a preferred support module.

### `next/link`

Bad:

```ts
vi.mock('next/link', () => ({
  default: ({ href, children, ...props }) => (
    <a data-testid="next-link" data-props={JSON.stringify(props)} href={href}>
      {children}
    </a>
  ),
}))
```

Good:

```ts
vi.mock('next/link', () => ({
  default: ({ href, children }) => <a href={href}>{children}</a>,
}))
```

### `next/dynamic`

Bad:

```ts
function createDynamicSentinel(loader: unknown) {
  const label = inferLabelFromLoader(loader)
  return (props: Record<string, unknown>) => (
    <div aria-label={label} data-prop-id={String(props.id ?? '')} />
  )
}
```

Good:

```ts
function __taroDynamicPlaceholder() {
  return null;
}

vi.mock("next/dynamic", () => ({ default: () => __taroDynamicPlaceholder }));
```

If the test depends on the loaded child's UI or props, stop using the generic shim and copy the shape from repo-local examples instead.

### SVG And Asset Components

Bad:

```ts
vi.mock('./flag.svg', () => ({
  default: () => <svg data-testid="kenya-flag" aria-label="Kenya flag" />,
}))
```

Good:

```ts
vi.mock('./flag.svg', () => ({
  default: (props) => <svg aria-hidden="true" {...props} />,
}))
```

## Low-Confidence Scaffolds

When Taro has no learned boundary support yet, keep the scaffold dumb.

Bad:

```ts
const defaultUseOrdersQueryImpl = () => ({
  data: undefined,
  isLoading: false,
  isFetching: false,
});

export const useOrdersQueryMock = vi.fn(defaultUseOrdersQueryImpl);
```

Good:

```ts
export const useOrdersQueryMock = vi.fn();

export function createOrdersMock() {
  return { useOrdersQuery: useOrdersQueryMock };
}

export function resetOrdersMock() {
  useOrdersQueryMock.mockReset();
}
```
