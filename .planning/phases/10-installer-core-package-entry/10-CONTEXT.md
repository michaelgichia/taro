# Phase 10: Installer Core & Package Entry - Context

**Gathered:** 2026-03-07
**Status:** Ready for planning

<domain>
## Phase Boundary

Turn `@tayo-dev/rtl` into an installer-first package entrypoint. This phase covers the root installer behavior, the interactive and non-interactive selection flow, and the installation plan/confirmation model. Runtime-specific payload delivery is Phase 11, and rerun/update safety plus release verification are Phase 12.

</domain>

<decisions>
## Implementation Decisions

### Installer entry behavior
- Running `npx @tayo-dev/rtl@latest` in a normal terminal should enter the installer flow immediately, with no help-first screen
- Runtime choice should be explicit; do not preselect a runtime silently
- If no interactive terminal is available and no runtime/location flags were provided, exit with a clear error telling the user to pass flags
- The package root should become installer-first in v1.2

### Interactive selection flow
- Ask for runtime selection before installation location
- Interactive runtime selection should support a true custom multi-select, not only one runtime or `all`
- After runtime selection, ask for location per selected runtime rather than forcing one location for all
- Per-runtime location prompts should happen one by one with the runtime name shown clearly

### CLI coexistence
- Keep `taro generate` available as the generator path during this phase
- Also add an explicit `install` command even though the package root becomes installer-first
- CLI help/output should emphasize installer/setup first, with generation as an existing capability
- A visible CLI onboarding shift is acceptable in Phase 10; backward compatibility is not a higher priority than making the installer-first model clear

### Install preview and confirmation
- Before writing, show a short summary of selected runtimes and chosen installation locations
- Require an explicit final confirmation before writing in the interactive flow
- After success, lead with runtime-specific verification commands rather than file lists or usage examples
- If the user declines confirmation, exit cleanly and state that nothing changed

### Claude's Discretion
- Exact wording, visual formatting, and branding tone of prompts and summaries
- Exact shape of the multi-select interaction as long as it remains runtime-first and supports custom subsets
- Whether help text shows generation examples inline or in a secondary section
- Exact command names and aliases beyond the locked installer-first root plus explicit `install` command

</decisions>

<specifics>
## Specific Ideas

- The target experience should feel like the GSD installer pattern: guided setup first, then runtime-native verification commands
- The installer package stays `@tayo-dev/rtl`; do not split ownership across a second umbrella package in this phase
- Codex support is distinct because it installs skills under `skills/@tayo-dev/rtl-*/SKILL.md`, even though the full payload delivery lands in Phase 11

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/index.ts`: existing Commander root entrypoint; this is the current place where installer-first behavior will need to take over or branch
- `src/cli/commands/generate.ts`: existing generator command that should remain reachable while installer behavior is added
- `package.json`: current `bin` and `files` fields define what the published package exposes and ships
- `README.md`: current onboarding assumes generator-first usage, so its install sections will need to align with the new entry model

### Established Patterns
- The codebase already uses TypeScript + Commander for CLI behavior
- Package behavior is local-first and filesystem-oriented; no hosted service assumptions are present
- The current published package is centered on one root command and one generation command, so Phase 10 is a product-surface pivot rather than an incremental subcommand addition only

### Integration Points
- Root CLI entrypoint in `src/index.ts`
- CLI command registration under `src/cli/commands/`
- Published package manifest in `package.json`
- User onboarding and verification copy in `README.md`

</code_context>

<deferred>
## Deferred Ideas

- Runtime-specific asset payload details for Claude Code, OpenCode, Gemini CLI, and Codex — Phase 11
- Rerun/update repair semantics and release verification — Phase 12
- Broad `Taro` / `taro` naming migration across the full product — future milestone
- Separate umbrella installer package — future milestone if needed

</deferred>

---

*Phase: 10-installer-core-package-entry*
*Context gathered: 2026-03-07*
