# Phase 11: Runtime Targets & Asset Delivery - Context

**Gathered:** 2026-03-07
**Status:** Ready for planning

<domain>
## Phase Boundary

Install the actual runtime-native assets for Claude Code, OpenCode, Gemini CLI, and Codex. This phase covers what gets written into each runtime, how those assets are grouped and namespaced on disk, and how the installer behaves when it encounters existing Tayo-owned files. Broader rerun/update repair semantics remain Phase 12.

</domain>

<decisions>
## Implementation Decisions

### Prompt-based runtime asset surface
- Claude Code, Gemini CLI, and OpenCode should get a minimal installed surface: a help entrypoint plus the core runtime command(s) needed to use Tayo
- The prompt-based runtimes should keep a mostly shared command vocabulary where their runtimes allow it; syntax differences are acceptable, but the surface should feel aligned
- Installed prompt-based assets should be fully namespaced to `@tayo-dev/rtl`; do not depend on plain `tayo`-named runtime files in this phase

### Codex skill surface
- Codex should get a broader skill suite than the prompt-based runtimes, not just a single help skill
- The Codex payload should be organized as one folder per skill under `skills/@tayo-dev/rtl-*`
- The expected Codex help entry remains `$@tayo-dev/rtl-help`

### File ownership and conflict behavior
- Prefer isolated namespaced asset files over editing shared runtime config files whenever possible
- If `@tayo-dev/rtl` assets already exist, ask before replacing them during the Phase 11 delivery flow
- Do not silently overwrite user-customized `@tayo-dev/rtl` assets
- Write a visible namespaced ownership marker or manifest alongside installed assets so later repair/update work can identify what the installer owns

### Runtime layout
- Project-local installs should mirror per-runtime hidden directories at the repo root rather than introducing one shared local install root
- OpenCode local installs should use `./.opencode`
- Group Tayo assets under a dedicated `@tayo-dev/rtl` package folder or equivalent namespaced container where the runtime allows it
- For Codex, the on-disk layout should stay one folder per skill rather than bundling all skills into one directory

### Claude's Discretion
- Exact command names beyond the locked help entrypoints and the requirement that the prompt-based runtimes stay mostly aligned
- Exact contents of the prompt-based "core runtime command(s)" as long as the installed surface stays minimal
- Exact filename and schema of the ownership marker/manifest
- Runtime-specific fallbacks when a target runtime cannot support the preferred package-folder grouping literally

</decisions>

<specifics>
## Specific Ideas

- The prompt-based runtimes should feel like the same product with syntax differences, not four unrelated integrations
- Codex is intentionally different: it should feel richer and skills-first rather than being treated as a prompt runtime copy
- The installer should behave conservatively around existing files in Phase 11; aggressive update/repair flows belong later

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/install/types.ts`: already defines supported runtimes, current global/local target roots, and verification command strings
- `src/install/resolver.ts`: already resolves current destination directories and should become the handoff point for runtime-specific asset delivery
- `src/install/planner.ts`: already builds a deterministic prewrite install plan that Phase 11 can extend with concrete asset write steps
- `src/install/summary.ts`: already provides the prewrite summary and confirmation checkpoint; Phase 11 can add post-write reporting on top of it

### Established Patterns
- The installer surface is already installer-first and runtime-first from Phase 10; Phase 11 should plug into that flow rather than redesigning it
- The package is still a single published CLI with `dist` as the shipped payload, so runtime assets must be bundled into the package tarball rather than fetched remotely
- No runtime asset directories or templates exist in the repo yet, so Phase 11 will be defining the first reusable packaging pattern for prompts/commands/skills

### Integration Points
- `src/cli/commands/install.ts`: current orchestrator for selection, planning, confirmation, and future write execution
- `src/install/types.ts`: current source of runtime metadata, including the now-confirmed `./.opencode` local target
- `package.json`: current publish whitelist will need to include any new runtime asset files that Phase 11 introduces
- Future runtime asset directories under the source tree will need to compile or copy cleanly into `dist` for npm distribution

</code_context>

<deferred>
## Deferred Ideas

- Rerun/update repair semantics for existing installs — Phase 12
- README and release documentation for the shipped runtime assets — Phase 12
- Uninstall/doctor flows — future milestone
- Broad product-wide rename away from `tayo` — future milestone

</deferred>

---

*Phase: 11-runtime-targets-asset-delivery*
*Context gathered: 2026-03-07*
