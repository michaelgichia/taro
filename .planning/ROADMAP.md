# Roadmap: Tayo

## Milestones

- ✅ **v1.0 Tayo v1.0** — shipped 2026-03-07. See [roadmap archive](./milestones/v1.0-ROADMAP.md), [requirements archive](./milestones/v1.0-REQUIREMENTS.md), and [audit](./milestones/v1.0-MILESTONE-AUDIT.md).
- ✅ **v1.1 Documentation & Deployment** — shipped 2026-03-07
- ✅ **v1.2 Runtime Installer Distribution** — shipped 2026-03-07. See [roadmap archive](./milestones/v1.2-ROADMAP.md) and [requirements archive](./milestones/v1.2-REQUIREMENTS.md).
- ✅ **v1.3 JS Baseline** — shipped 2026-03-10. See [roadmap archive](./milestones/v1.3-ROADMAP.md), [requirements archive](./milestones/v1.3-REQUIREMENTS.md), and [audit](./milestones/v1.3-MILESTONE-AUDIT.md).
- 🚧 **v1.4 Assertion Marker** — active planning milestone

## Current Status

Active milestone: **v1.4 Assertion Marker**

Next step:
- Run `$gsd-plan-phase 17` to plan the first v1.4 delivery slice.

## Phases

- [ ] **Phase 17: Semantic Marker Intake** - Detect recorder `dblClick` assertion markers and preserve the evidence needed to convert them later.
- [ ] **Phase 18: Truthful Marker Assertion Generation** - Turn resolved markers into explicit RTL assertions in the correct scenario block while enforcing user-facing guardrails.
- [ ] **Phase 19: Marker Coverage Audit & Reporting** - Make marker conversion coverage visible, fail zero-conversion runs, and report unresolved markers with recorder line context.

## Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 17. Semantic Marker Intake | 0/0 | Not started | - |
| 18. Truthful Marker Assertion Generation | 0/0 | Not started | - |
| 19. Marker Coverage Audit & Reporting | 0/0 | Not started | - |

## Phase Details

### Phase 17: Semantic Marker Intake
**Goal**: Recorder assertion markers are recognized as verification intent and stay attached to the user action they are meant to verify.  
**Depends on**: Phase 16  
**Requirements**: MARK-01, MARK-02  
**Success Criteria** (what must be TRUE):
1. When a recorder export uses `dblClick` on a visible, meaningful target as a verification gesture, Tayo treats that step as a semantic assertion marker instead of replaying it as a normal interaction.
2. The parsed marker retains the original recorder step context needed to attach later conversion back to the UI action the user intended to verify.
3. Ordinary interaction steps that do not meet the semantic-marker rules continue through generation as normal user actions instead of being mislabeled as assertions.
**Plans**: TBD

### Phase 18: Truthful Marker Assertion Generation
**Goal**: Semantic markers become explicit, user-facing RTL assertions placed in the correct generated scenario without fabricating hidden evidence.  
**Depends on**: Phase 17  
**Requirements**: ASSERT-01, ASSERT-02, ASSERT-03, ASSERT-04, SAFE-01, SAFE-02  
**Success Criteria** (what must be TRUE):
1. When accessible role and name evidence exists for a marker target, the generated test emits a role-and-name assertion instead of replaying the marker click.
2. When stronger accessible evidence is absent, marker conversion falls back truthfully to visible text, then to label-or-placeholder field context, without skipping the defined resolution order.
3. Marker-derived assertions appear in the nearest relevant generated scenario block, and the original marker gesture no longer appears as a user interaction step in that block.
4. Marker assertions strengthen the generated test additively and do not replace required happy-path, validation, or failure coverage already expected from the scenario.
5. Markers backed only by screenshots, hidden implementation details, generic containers, icon-only targets, or dynamic CSS-only selectors stay unresolved instead of producing fabricated assertions.
**Plans**: TBD

### Phase 19: Marker Coverage Audit & Reporting
**Goal**: Users can see whether semantic markers converted successfully and where unresolved markers still need manual repair.  
**Depends on**: Phase 18  
**Requirements**: QUAL-01, QUAL-02, QUAL-03  
**Success Criteria** (what must be TRUE):
1. Each generation run reports how many semantic markers were detected in the recording and how many marker-derived assertions were emitted in the final output.
2. When semantic markers are present but zero marker-derived assertions are produced, Tayo marks assertion strength as an explicit quality-gate failure instead of presenting the result as strong output.
3. Any marker that cannot be converted truthfully remains visible in warnings that cite the original recording line number so a developer can repair the source recording manually.
**Plans**: TBD
