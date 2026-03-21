# Boundary Patterns

Use this reference when deciding whether a collaborator should stay real, reuse support, or tolerate a lightweight inline mock. These patterns are abstract on purpose: infer the principle first, then map it to the repo-local artifact.

## Core Rule

Do not start from package names or helper names. Start from the role the boundary plays in the test:

- Is it part of the render surface?
- Is it a collaborator with stable test support?
- Is it a shared package that should remain mostly real?
- Is it a simple setup boundary like router or environment state?

## Pattern: Partial Support Import

Use when a shared boundary should remain mostly real, but one unstable slice needs test support.

Example shape:

```ts
import "@/tests/support/shared-ui";

// support file keeps most exports real and overrides only the unstable part
```

Interpretation:

- keep the shared boundary mostly real
- reuse the repo support import if it exists
- do not recreate the package inline in every generated test

## Pattern: Keep Real

Use when a collaborator is part of the render boundary itself, especially local wrappers that define layout, portal ownership, or composition.

Interpretation:

- keep the wrapper real
- solve environment, portal, animation, or cleanup issues at the render boundary
- do not hide the problem by mocking through the wrapper

## Pattern: Factory Support

Use when the repo exposes stable factory/reset/override handles for a collaborator.

Example shape:

```ts
import { createOrdersMock, resetOrdersMock } from "@/tests/mocks/orders";

vi.mock("@/features/orders", () => ({ ...createOrdersMock() }));

beforeEach(resetOrdersMock);
```

Interpretation:

- reuse the learned support module
- configure behavior per test
- avoid rebuilding collaborator state ad hoc in each suite

## Pattern: Provider Wrapper

Use when the collaborator is best satisfied by rendering through an existing provider or shared render helper.

Interpretation:

- prefer rendering through the wrapper
- do not replace provider behavior with a fake implementation when a real wrapper exists

## Pattern: Inline Safe

Use only when the collaborator is simple and setup-oriented, and no stronger local pattern exists.

Typical examples:

- router or navigation helpers
- environment or browser feature gaps
- small platform seams

Interpretation:

- lightweight inline mocks are acceptable
- prefer the smallest mock surface possible
- if a stronger local pattern exists, use that instead

## Decision Order

When multiple patterns seem plausible, prefer them in this order:

1. keep-real
2. partial-support-import
3. factory-support
4. provider-wrapper
5. inline-safe

This is not a strict runtime rule. It is a reasoning aid for generation under ambiguity.
