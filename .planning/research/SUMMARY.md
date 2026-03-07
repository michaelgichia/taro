# Project Research Summary

**Project:** Taro
**Domain:** installer-first distribution for AI coding runtimes
**Researched:** 2026-03-07
**Confidence:** MEDIUM

## Executive Summary

Taro's next milestone is not about improving the generator itself; it is about changing how users adopt it. The current package is a single Commander CLI named `taro`, while the target behavior is a GSD-style installer flow that lets users bootstrap Taro into Claude Code, OpenCode, Gemini CLI, and Codex from `@tayo-dev/rtl`.

Research points toward a straightforward architecture: keep the package owner fixed, add a dedicated installer flow, model each runtime in a registry, and ship runtime payloads as versioned assets in the npm tarball. The main risks are package-name ambiguity, per-runtime path drift, and under-specifying the rerun/update path.

## Key Findings

### Recommended Stack

Keep the installer inside the existing TypeScript + Commander + Node 18 stack. No hosted services or new package split are needed for v1.2. The important addition is not a new framework; it is a clearer module boundary for installer logic, runtime registry definitions, and packaged runtime assets.

**Core technologies:**
- TypeScript: typed runtime metadata and filesystem plans
- Commander: interactive/non-interactive CLI surface
- Node built-in filesystem/path APIs: install planning and file writes

### Expected Features

**Must have (table stakes):**
- Interactive installer entrypoint from `npx @tayo-dev/rtl@latest`
- Runtime selection plus global/local installation selection
- Runtime-specific assets for Claude Code, OpenCode, Gemini CLI, and Codex
- Verification commands and idempotent rerun/update flow

**Should have (competitive):**
- Single package that supports all runtimes
- Codex-specific skills-first installation
- Preserve direct generator usage while the installer becomes the new onboarding path

**Defer (v2+):**
- Broad product/CLI rebrand
- Uninstall flow
- Remote template delivery

### Architecture Approach

Use a dedicated installer subsystem with five major components: CLI entrypoint, runtime registry, location resolver, asset layer, and verification reporter. Keep these isolated from the existing generator pipeline so installer complexity does not leak into `generate`.

**Major components:**
1. Installer CLI — prompt/flag entrypoint
2. Runtime registry — directories, asset types, verify commands
3. Install engine — plan, write, rerun/update behavior
4. Asset payloads — prompts, commands, and Codex skills

### Critical Pitfalls

1. **Package entry ambiguity** — keep `@tayo-dev/rtl` as the only documented installer command
2. **Runtime path assumptions** — encode paths in a registry and test global/local variants explicitly
3. **Codex treated like prompts** — give Codex a dedicated skills-first module
4. **Installer fails on rerun** — design overwrite/update behavior before release
5. **Docs drift from emitted commands** — smoke-test README commands against the real package

## Implications for Roadmap

Based on research, suggested phase structure:

### Phase 10: Installer Core & Package Entry
**Rationale:** The installer needs a stable entrypoint, flag model, and path resolver before any runtime payloads can be installed.
**Delivers:** interactive/non-interactive install command and install planning
**Addresses:** installer table stakes
**Avoids:** package-name ambiguity and runtime path drift

### Phase 11: Runtime Targets & Asset Delivery
**Rationale:** Once the install engine exists, runtime modules and packaged assets can be added without mixing concerns.
**Delivers:** Claude, OpenCode, Gemini, and Codex payload installation
**Uses:** runtime registry and packaged assets
**Implements:** runtime-specific modules and verification commands

### Phase 12: Verification, Updates & Docs
**Rationale:** Update flow and docs must be validated against the real installed assets after runtime support exists.
**Delivers:** rerun/update behavior, smoke checks, and release-ready onboarding docs

### Phase Ordering Rationale

- Build the install engine before the payload matrix so runtime logic has a stable host
- Add runtime targets after path and asset abstractions are in place
- Leave update behavior and final docs until the emitted assets are real and testable

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 11:** runtime-specific filesystem conventions may still need closer inspection per target
- **Phase 12:** update/repair semantics may need extra validation once real payloads exist

Phases with standard patterns (skip research-phase):
- **Phase 10:** package entrypoint, flags, prompts, and path planning follow standard CLI patterns

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Existing repo already uses the recommended foundations |
| Features | HIGH | User provided the target behavior concretely |
| Architecture | MEDIUM | Runtime-specific install conventions still need per-phase validation |
| Pitfalls | MEDIUM | Risks are clear, but final mitigations depend on runtime asset details |

**Overall confidence:** MEDIUM

### Gaps to Address

- Exact asset naming and folder contracts for each runtime should be validated during phase planning
- The final install/update ownership model should be decided before phase 12 execution begins

## Sources

### Primary (HIGH confidence)
- Current repo state (`package.json`, `src/index.ts`, `README.md`) — verified existing package behavior
- User-provided milestone direction and target installer commands — defined required runtime behavior

### Secondary (MEDIUM confidence)
- GSD-style installer behavior referenced by the user — product benchmark for interactive setup and multi-runtime support

---
*Research completed: 2026-03-07*
*Ready for roadmap: yes*
