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
- Shared support modules should expose stable factory/reset/override exports when tests need per-test mutation-state control

Example:

export const ORG_001 = {
  id: "ORG_001",
  name: "Test Organisation",
  active: true
};

Shared module support shape:

```ts
export const createSaleMutate = vi.fn();
export const useCreateSaleMutationMock = vi.fn(defaultCreateSaleMutationImpl);

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
