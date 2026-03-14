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
- Never use mutable shared objects to steer mock behavior across tests.
  Do not split behavior across a hoisted control object, a `beforeEach`
  reset block, and per-test field mutations. That pattern hides the real
  scenario, couples the object shape to manual reset logic, and lets fields
  leak between tests when reset lines drift.
- Hoist plain `vi.fn()` handles only. Keep the `vi.mock(...)` factory
  responsible for module shape only. Set the default happy-path
  `mockImplementation` in `beforeEach`, and let each non-happy-path test
  replace it with a complete inline `mockImplementation` that describes the
  scenario in one place.

Example:

export const ORG_001 = {
  id: "ORG_001",
  name: "Test Organisation",
  active: true
};

Shared module support shape:

```ts
const defaultCreateSaleMutationImpl = () => ({
  mutateAsync: vi.fn(),
  isPending: false,
})

export const createSaleMutate = vi.fn();
export const useCreateSaleMutationMock = vi.fn();

export function createDataLayerMock() {
  return {
    useCreateSaleMutation: useCreateSaleMutationMock,
  };
}

export function resetDataLayerMock() {
  createSaleMutate.mockReset();
  useCreateSaleMutationMock.mockReset();
  useCreateSaleMutationMock.mockImplementation(defaultCreateSaleMutationImpl);
}
```

Taro treats these locations as payload sources for learned boundary profiles. When no learned support exists, `generate` can scaffold a low-confidence central support module instead of emitting repo-local query-hook implementations inline in the test file.
