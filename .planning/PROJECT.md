# Tayo

## What This Is

Tayo is a local-first package that installs runtime-native `@tayo-dev/rtl` commands and Codex skills, then generates codebase-aware React Testing Library tests from recorder input. The shipped product is installer-first: users start with `npx @tayo-dev/rtl@latest`, choose Claude Code, OpenCode, Gemini CLI, or Codex, and then use namespaced commands inside those runtimes while `tayo generate` remains available for direct CLI use.

## Current State

- Latest shipped milestone: `v1.4 Assertion Marker` on 2026-03-10
- Active planning milestone: none
- Package surface: installer-first `@tayo-dev/rtl` with preserved direct `tayo generate` support
- Supported runtime targets: Claude Code, OpenCode, Gemini CLI, and Codex
- Shipped marker baseline: semantic marker intake, truthful marker assertion emission, marker coverage gate reporting, and unresolved-marker traceability are now part of generated-output quality controls
- Release proof: build + focused suites passed, milestone audit recorded `tech_debt` with no blockers

## Core Value

Put high-quality RTL test generation inside Claude Code, OpenCode, Gemini CLI, and Codex with near-zero setup friction.

## Next Milestone Goals

- Expand marker authoring beyond `dblClick` while keeping truthfulness guardrails and deterministic output.
- Add user-editable marker conversion review before final test write.
- Tighten recorder import workflows so marker intent survives with less manual handling.
- Add remediation guidance that points users to source accessibility gaps when marker conversion is blocked.

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
- ✓ Semantic recorder `dblClick` steps become assertion intents when the target resolves to role/name, visible text, or labeled input evidence — v1.4
- ✓ Generated tests place marker-derived assertions in the nearest relevant scenario block instead of treating marker clicks as user actions — v1.4
- ✓ Coverage auditing counts semantic marker events versus generated marker assertions and fails the quality gate when conversion collapses to zero — v1.4
- ✓ Ambiguous markers stay unresolved with warnings that point to the original recording line rather than degrading into weak CSS-selector assertions — v1.4

### Active

- [ ] Alternative lightweight marker gestures beyond `dblClick`
- [ ] Interactive marker conversion review/edit before final file write
- [ ] Tighter recorder import flow with preserved marker intent
- [ ] Accessibility remediation guidance when truthful marker conversion fails

### Out of Scope

- [Direct execution of extension exports as finished tests] — recorder JS remains a baseline artifact that Tayo must interpret and improve before writing a project test
- [Dropping Chrome Recorder JSON support] — JSON remains a supported path and must not regress while JS quality improves
- [Non-React frameworks or browser E2E generation] — Tayo still targets React Testing Library workflows only
- [Hosted service or remote registry] — installation and generation remain filesystem-based and local-first
- [Playwright screenshot-driven assertions] — marker conversion must rely on recorder evidence, not visual heuristics
- [Internal implementation assertions or hidden-state inference] — generated expectations must stay tied to visible user-facing proof

## Context

- **Current package shape:** `@tayo-dev/rtl` ships both installer-first runtime delivery and direct generation workflow.
- **Current input reality:** recorder `.js` and `.json` are both supported, with repo-aware generation strongest on JS and explicit draft messaging for weaker outputs.
- **Marker assertion baseline:** marker conversion is additive, evidence-ranked, and guarded against CSS-only/generic/icon-only fabrication.
- **Marker quality baseline:** coverage totals (detected/emitted/unresolved) and explicit QUAL-02 outcomes are reported at generation time.
- **Unresolved repair baseline:** unresolved markers surface MKR-03 warnings with stable fields and recorder-line traceability.
- **Runtime installer state:** Claude Code, OpenCode, Gemini CLI, and Codex all have packaged assets, manifest ownership, verification commands, and rerun protection.
- **Current codebase:** TypeScript + Commander CLI with generator pipeline, input parsers under `src/core/`, recorder intelligence and mock analysis in `src/core/` and `src/analyzer/`, installer modules under `src/install/`, and packaged runtime assets under `assets/`.

## Constraints

- **Package ownership:** `@tayo-dev/rtl` remains the installer package.
- **Compatibility:** Support Claude Code, OpenCode, Gemini CLI, and Codex while preserving direct `tayo generate`.
- **Local-first:** Installer writes files into runtime config locations only; no hosted backend.
- **Backward compatibility:** Preserve existing JSON generation path while improving JS baseline and marker conversion fidelity.
- **Input model:** Testing Library Recorder JS remains a baseline transcript, not a finished test.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Keep generator logic local-first | Existing pipeline already proves value without service dependency | ✓ Good |
| Publish under `@tayo-dev/rtl` | Package scope aligns public distribution with Tayo branding | ✓ Good |
| Use `@tayo-dev/rtl` as installer package owner | Avoid splitting product packaging too early | ✓ Good |
| Focus v1.2 on installer behavior first | Largest adoption gap was runtime setup | ✓ Good |
| Treat Codex as skills-first | Codex installation differs from prompt-based runtimes | ✓ Good |
| Preserve `tayo generate` during installer pivot | Existing generation flows should keep working | ✓ Good |
| Protect manual edits on rerun | Installer updates must not silently overwrite user customization | ✓ Good |
| Treat recorder JS as a baseline artifact | Extension exports need transformation into maintainable RTL tests | ✓ Good |
| Preserve Chrome Recorder JSON while improving JS fidelity | Dual input support is a public contract | ✓ Good |
| Make low-confidence output advisory and explainable | Tayo must remain writable while being truthful about weak evidence | ✓ Good |
| Use semantic `dblClick` as assertion-marker convention | Provides lightweight user intent capture without advanced config | ✓ Good |
| Keep marker conversion additive and user-facing only | Prevent hidden implementation assertions and preserve scenario coverage | ✓ Good |
| Fail QUAL-02 when detected markers emit zero assertions | Prevent false “strong” output when marker conversion collapses | ✓ Good |
| Emit unresolved markers as deterministic MKR-03 warning lines | Keep repair guidance readable and stable in terminal/CI output | ✓ Good |

## Previous Planning Snapshot

<details>
<summary>v1.4 milestone framing before shipment</summary>

The active v1.4 planning goal was to turn recorder-side assertion markers into explicit, truthful RTL assertions without forcing non-technical users through advanced recorder configuration.

Target features were:

- Convert semantic recorder `dblClick` steps into assertion intents using the strongest available evidence.
- Track marker coverage and fail quality gates when semantic markers are present but no marker-derived assertions are produced.
- Surface unresolved or ambiguous markers with original recording line context for manual repair.
- Preserve strict guardrails so marker conversion stays additive and never invents hidden implementation assertions.

</details>

<details>
<summary>v1.3 milestone framing before shipment</summary>

The active v1.3 planning goal was to make Testing Library Recorder JS exports a first-class baseline input that Tayo could transform into structured, codebase-aware RTL tests instead of shallow executable transcripts.

</details>

---
*Last updated: 2026-03-10 after shipping milestone v1.4 Assertion Marker*
