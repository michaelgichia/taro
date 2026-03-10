# Tayo

## What This Is

Tayo is a local-first package that installs runtime-native `@tayo-dev/rtl` commands and Codex skills, then generates codebase-aware React Testing Library tests from recorder input. The shipped product is now installer-first: users start with `npx @tayo-dev/rtl@latest`, choose Claude Code, OpenCode, Gemini CLI, or Codex, and then use namespaced commands inside those runtimes while `tayo generate` remains available for direct CLI use.

## Current State

- Latest shipped milestone: `v1.3 JS Baseline` on 2026-03-10
- Active planning milestone: `v1.4 Assertion Marker`
- Package surface: installer-first `@tayo-dev/rtl` with preserved direct `tayo generate` support
- Supported runtime targets: Claude Code, OpenCode, Gemini CLI, and Codex
- Shipped JS baseline surface: recorder `.js` and `.json` share one input boundary, selector recovery is truthful, repo-aware generation is available for supported flows, and low-confidence output is now explainable
- Release proof: rerun/update safety, verified runtime help commands, tarball validation, JS/JSON built-CLI dry-runs, and milestone audit evidence are all shipped

## Core Value

Put high-quality RTL test generation inside Claude Code, OpenCode, Gemini CLI, and Codex with near-zero setup friction.

## Current Milestone: v1.4 Assertion Marker

**Goal:** Turn recorder-side assertion markers into explicit, truthful RTL assertions without forcing non-technical users through advanced recorder configuration.

**Target features:**
- Convert semantic recorder `dblClick` steps into assertion intents using the strongest available evidence
- Track marker coverage and fail quality gates when semantic markers are present but no marker-derived assertions are produced
- Surface unresolved or ambiguous markers with the original recording line context so developers can repair them manually
- Preserve strict guardrails so marker conversion stays additive and never invents hidden implementation assertions

## Next Milestone Goals

- Land assertion-marker support as the first recorder authoring signal built directly on top of the v1.3 JS baseline
- Keep conversion truthful by preferring role/name, visible text, then form context, while rejecting CSS-only ambiguity
- Make marker coverage visible in scoring so missing conversions cannot quietly ship as "strong" output

## Requirements

### Validated

- ✓ Core pipeline from recorder input to generated test file output — v1.0
- ✓ Codebase-aware query and test-design intelligence — v1.0
- ✓ Self-scoring, post-write verification, and convention learning — v1.0
- ✓ Recording, visual, and mock intelligence recovery — v1.0
- ✓ Public README onboarding for installation, CLI usage, and worked examples — v1.1
- ✓ npm publication and package verification for `@tayo-dev/rtl` — v1.1
- ✓ Installer-first `npx @tayo-dev/rtl@latest` flow with runtime and location selection — v1.2
- ✓ Runtime-native asset delivery for Claude Code, OpenCode, Gemini CLI, and Codex — v1.2
- ✓ Safe reruns, repair behavior, verified runtime commands, and installer-first release docs — v1.2
- ✓ Recorder JS and Chrome Recorder JSON now share a first-class parsed-input boundary with truthful baseline recovery — v1.3
- ✓ Truthful selector recovery keeps unresolved evidence explicit instead of inventing fallback queries — v1.3
- ✓ Repo-aware suite planning and render-target generation now produce structured module-aware output for supported flows — v1.3
- ✓ Low-confidence scoring, JSON parity proof, and product-surface docs now match the shipped CLI behavior — v1.3

### Active

- [ ] Semantic recorder `dblClick` steps become assertion intents when the target resolves to role/name, visible text, or labeled input evidence
- [ ] Generated tests place marker-derived assertions in the nearest relevant scenario block instead of treating marker clicks as user actions
- [ ] Coverage auditing counts semantic marker events versus generated marker assertions and fails the quality gate when conversion collapses to zero
- [ ] Ambiguous markers stay unresolved with warnings that point to the original recording line rather than degrading into weak CSS-selector assertions

### Out of Scope

- [Direct execution of extension exports as finished tests] — recorder JS remains a baseline artifact that Tayo must interpret and improve before writing a project test
- [Dropping Chrome Recorder JSON support] — JSON remains a supported path and must not regress while JS quality improves
- [Non-React frameworks or browser E2E generation] — Tayo still targets React Testing Library workflows only
- [Hosted service or remote registry] — installation and generation remain filesystem-based and local-first
- [Playwright screenshot-driven assertions] — marker conversion must rely on recorder evidence, not visual heuristics
- [Internal implementation assertions or hidden-state inference] — generated expectations must stay tied to visible user-facing proof
- [Broad authoring UX, setup-template, or import-flow work] — keep v1.4 focused on assertion markers before expanding adjacent authoring features

## Context

- **Current package shape:** `@tayo-dev/rtl` now ships both the installer-first entrypoint and the existing generator pipeline
- **Current input reality:** recorder `.js` and `.json` are both supported, with repo-aware generation strongest on the JS path and explicit draft messaging for weaker outputs
- **Milestone anchor examples:** `sample/sample-rest-recordingextension-output.js` remains the canonical baseline artifact; `sample/sample-add-sale-test.ts` remains the quality bar for transformed output
- **New milestone brief:** non-technical recorder users need a lightweight "verify this" gesture, modeled as a semantic `dblClick` on the visible element that proves the previous action worked
- **Assertion resolution order:** role/name first, then visible text, then label/placeholder context; CSS-only evidence stays unresolved and warning-only
- **Quality gate intent:** marker coverage must be auditable, and zero successful conversions in the presence of semantic markers should reduce assertion-strength scoring explicitly
- **Runtime installer state:** Claude Code, OpenCode, Gemini CLI, and Codex all have packaged assets, manifest ownership, verification commands, and rerun protection
- **Current codebase:** TypeScript + Commander CLI with generator pipeline, input parsers under `src/core/`, recorder intelligence and mock analysis in `src/core/` and `src/analyzer/`, installer modules under `src/install/`, and packaged runtime assets under `assets/`
- **Verification baseline:** build, focused phase suites, real built-CLI JS/JSON smoke runs, and milestone audit evidence all passed on 2026-03-10
- **Codex note:** Codex remains skills-first via `skills/@tayo-dev/rtl-*/SKILL.md`

## Constraints

- **Package ownership**: `@tayo-dev/rtl` remains the installer package — no separate umbrella package in this milestone
- **Compatibility**: Support Claude Code, OpenCode, Gemini CLI, and Codex using their expected directory conventions while preserving direct `tayo generate`
- **Local-first**: Installer writes files into runtime config locations only; no hosted backend or account system
- **Backward compatibility**: Preserve the existing JSON generation path and avoid breaking direct `tayo generate` usage while improving JS baseline fidelity
- **Input model**: Testing Library Recorder JS must be treated as a baseline transcript, not as a finished component test that can be executed unchanged

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Keep generator logic local-first | Existing pipeline already proves value without any service dependency | ✓ Good |
| Publish under `@tayo-dev/rtl` | Package scope aligns public distribution with Tayo branding | ✓ Good |
| Use `@tayo-dev/rtl` as the installer package owner | Avoid splitting the product between an umbrella installer and a payload package too early | ✓ Good |
| Focus v1.2 on installer behavior first | The biggest gap is runtime setup and adoption, not more generator intelligence | ✓ Good |
| Treat Codex as skills-first | Codex installation differs from prompt-based runtimes and needs explicit support | ✓ Good |
| Preserve `tayo generate` during the installer pivot | Existing generation flows should keep working while onboarding changes | ✓ Good |
| Protect manual edits on rerun | Installer updates must not silently overwrite user-customized runtime assets | ✓ Good |
| Treat Testing Library Recorder JS as a baseline, not a finished test | Extension exports capture flow order but not the mocks, structure, assertions, or selector hardening needed for maintainable RTL output | ✓ Good |
| Preserve Chrome Recorder JSON while improving JS fidelity | Dual input support is part of the public contract and cannot regress while the JS path improves | ✓ Good |
| Make low-confidence output advisory and explainable | Tayo must stay writable while being honest about placeholder queries, unresolved selectors, and boundary drafts | ✓ Good |
| Use semantic `dblClick` as the assertion-marker convention | It gives recorder users a simple, visible "verify this" gesture without exposing advanced assertion configuration | — Pending |
| Keep marker conversion additive and user-facing only | Assertions should strengthen the generated test without replacing happy-path, validation, or failure coverage or inventing hidden implementation checks | — Pending |

## Previous Planning Snapshot

<details>
<summary>v1.3 milestone framing before shipment</summary>

The active v1.3 planning goal was to make Testing Library Recorder JS exports a first-class baseline input that Tayo could transform into structured, codebase-aware RTL tests instead of shallow executable transcripts.

Target features were:

- Accept recorder extension JS files as a supported primary baseline input alongside Chrome Recorder JSON
- Recover user intent, assertion markers, and stable query candidates from JS baseline code without executing it as a finished test
- Generate structured RTL output with helpers, assertions, mocks, and grouped test cases closer to `sample/sample-add-sale-test.ts`

</details>

<details>
<summary>v1.2 milestone framing before shipment</summary>

The active v1.2 planning goal was to make `@tayo-dev/rtl` behave like a GSD-style runtime installer that could bootstrap Tayo into Claude Code, OpenCode, Gemini CLI, and Codex from one package. That plan is now fully shipped and archived in [v1.2 roadmap archive](./milestones/v1.2-ROADMAP.md) and [v1.2 requirements archive](./milestones/v1.2-REQUIREMENTS.md).

</details>

---
*Last updated: 2026-03-10 after starting milestone v1.4 Assertion Marker*
