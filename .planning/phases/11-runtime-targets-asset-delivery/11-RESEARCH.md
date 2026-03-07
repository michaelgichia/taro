# Phase 11: Runtime Targets & Asset Delivery - Research

**Researched:** 2026-03-07
**Domain:** packaged runtime asset delivery for Claude Code, OpenCode, Gemini CLI, and Codex
**Confidence:** HIGH

<user_constraints>
## User Constraints

### Locked Decisions

**Phase Goal**
- Deliver the real runtime-native assets behind the Phase 10 installer plan so each supported runtime exposes the promised `@tayo-dev/rtl` help entrypoint
- Keep prompt-based runtimes minimal and aligned, while making Codex distinctly skills-first

**Asset Surface**
- Claude Code, Gemini CLI, and OpenCode should get a minimal surface: help plus core runtime command(s)
- Prompt-based runtimes should feel mostly the same, with syntax differences only where the runtime requires them
- Installed assets should stay fully namespaced to `@tayo-dev/rtl`

**Ownership Rules**
- Prefer isolated namespaced files over modifying shared runtime config files
- Ask before replacing existing `@tayo-dev/rtl` assets
- Protect user-customized namespaced assets from silent overwrite
- Write a visible ownership marker/manifest for later repair/update work

**Layout Rules**
- Project-local installs should mirror hidden runtime directories at the repo root
- OpenCode local installs should use `./.opencode`
- Group Tayo assets under a dedicated namespaced container where the runtime allows it
- Codex should use one folder per skill under `skills/@tayo-dev/rtl-*`

### Claude's Discretion
- Exact core command set for prompt-based runtimes beyond the locked help entrypoint
- Exact manifest schema and filenames
- Runtime-specific fallback layout when a literal package folder is not supported by a target runtime

### Deferred Ideas
- Rerun/update repair semantics are Phase 12, not Phase 11
- README and release verification changes remain Phase 12
- Uninstall/doctor flows remain future work
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| RUNT-01 | Claude Code installation exposes `/@tayo-dev/rtl:help` | Requires Claude-specific packaged prompt/command assets and install write path |
| RUNT-02 | Gemini CLI installation exposes `/@tayo-dev/rtl:help` | Requires Gemini-specific packaged prompt/command assets and install write path |
| RUNT-03 | OpenCode installation exposes `/@tayo-dev/rtl-help` | Requires OpenCode-specific packaged prompt/command assets and the locked `./.opencode` local target |
| RUNT-04 | Codex installation writes `skills/@tayo-dev/rtl-*/SKILL.md` assets and exposes `$@tayo-dev/rtl-help` | Requires Codex-specific skill packaging, one folder per skill, and distinct writer logic |
| RUNT-05 | `--all` installs all supported runtimes in one run and reports what was written | Requires a shared write engine, per-runtime results collection, and final reporting across mixed asset types |
</phase_requirements>

---

## Summary

Phase 11 should be planned as **foundation -> runtime delivery -> shared execution/reporting**:

1. **Asset foundation**
   - introduce a runtime registry richer than the current directory-only metadata
   - add packaged runtime assets to the repo and make sure npm ships them
   - define install manifest / ownership record primitives before writes begin

2. **Runtime-specific delivery**
   - implement prompt-based runtime assets for Claude Code, Gemini CLI, and OpenCode
   - implement Codex as a separate skill-first runtime with one folder per skill

3. **Shared execution/reporting**
   - add the file writer, conflict detection, confirmation handoff, and install result reporting
   - integrate the actual write step into the existing Phase 10 install plan flow

This shape keeps file ownership and packaged asset handling stable before the runtime-specific write logic is layered on top.

---

## Current-State Findings

### Finding 1: The installer flow is ready for writes, but no packaged runtime assets exist yet

Phase 10 created:
- runtime selection and location choice
- destination resolution
- prewrite plan preview
- confirmation/cancel flow

What is still missing:
- any packaged prompt files, command files, or Codex skill directories
- a file writer that turns an install plan into filesystem operations
- install result reporting based on actual written assets

Phase 11 therefore needs both payload definitions and the write engine.

### Finding 2: `package.json` currently cannot ship non-`dist` runtime assets unless Phase 11 changes packaging

Current `files` whitelist:
- `dist`
- `README.md`
- `LICENSE`

If runtime assets live outside `dist`, they will not ship unless the whitelist changes.
If assets live under `src/`, `tsc` will not copy them into `dist`.

Two viable patterns exist:
- add a top-level `assets/` directory and include it in `package.json`
- add a build copy step that mirrors asset files into `dist/`

For this repo, the simplest Phase 11 path is likely:
- create repo-visible asset directories
- include them explicitly in the published package
- resolve them at runtime from the package root

This avoids introducing a separate asset build pipeline unless the planner sees a strong reason to keep everything inside `dist/`.

### Finding 3: The current runtime metadata model is too shallow for Phase 11

`src/install/types.ts` currently models:
- runtime id
- display name
- global directory segments
- local directory name
- verification command

Phase 11 needs richer runtime metadata, including at least:
- asset kind (`prompt`, `command`, `skill`, `manifest`)
- runtime-specific asset source paths
- namespaced install container names
- ownership marker locations
- optional runtime-specific fallback layout rules

This points toward a dedicated registry module rather than continuing to overload `types.ts`.

### Finding 4: Codex needs a separate runtime module, not a prompt-runtime variant

Research and user decisions align on one point: Codex cannot be treated as Claude/Gemini/OpenCode with renamed directories.

Codex-specific needs:
- multiple skill directories
- one `SKILL.md` per installed skill
- a broader skill surface than the prompt-based runtimes
- help entry through `$@tayo-dev/rtl-help`

That makes Codex a natural separate plan or at least a separate module family inside `install/runtimes/`.

### Finding 5: Ownership and conflict behavior should be modeled as install operations, not ad hoc checks

Because Phase 11 is conservative around existing files, the writer layer should not be a naive "copy everything" loop.

The write engine needs to distinguish:
- missing files -> safe create
- existing Tayo-owned files -> prompt/confirm replace
- user-modified Tayo-owned files -> protect and stop or route to confirmation
- non-Tayo files in shared directories -> ignore unless they collide directly with a namespaced target

This supports Phase 11’s first-write behavior while leaving broader update/repair semantics to Phase 12.

### Finding 6: Prompt-based runtimes should share templates where possible, but filenames and layout still need runtime-specific mapping

The user wants a mostly shared command vocabulary, not necessarily byte-identical assets.

This suggests:
- shared asset content templates for common help/core commands
- runtime-specific filename/layout adapters

That avoids unnecessary duplication while keeping each runtime honest to its expected entrypoint style.

---

## Recommended Architecture

### Pattern 1: Package-visible asset source tree

Recommended structure:

```text
assets/
├── claude/
│   └── @tayo-dev/rtl/
├── gemini/
│   └── @tayo-dev/rtl/
├── opencode/
│   └── @tayo-dev/rtl/
└── codex/
    └── skills/
        ├── @tayo-dev/rtl-help/
        ├── @tayo-dev/rtl-generate/
        └── ...
```

Why:
- keeps payloads reviewable
- makes npm packaging explicit
- lets the install engine copy concrete files rather than synthesize large strings inline

### Pattern 2: Runtime registry + install operations

Recommended split:
- `registry.ts` or runtime modules define source assets, destination layout, and verification commands
- `writer.ts` turns an install plan into operations such as `mkdir`, `copy`, `skip`, `conflict`, `manifest-write`
- `manifest.ts` or equivalent records owned files

This preserves the existing Phase 10 plan-preview flow while making write execution testable in isolation.

### Pattern 3: Plan before write, then execute from immutable operations

Phase 10 already previews targets. Phase 11 should extend that plan to include:
- asset source file
- destination path
- ownership status
- action (`create`, `replace`, `skip`, `blocked`)

That makes summary output and conflict prompts deterministic, and it keeps the final reporting path aligned with the actual write decisions.

### Pattern 4: Separate prompt-runtime and Codex-runtime modules

Recommended module families:
- prompt runtimes: Claude Code, Gemini CLI, OpenCode
- skill runtime: Codex

This preserves shared behavior where appropriate without flattening fundamentally different asset kinds into one code path.

---

## Testing Strategy

### Automated

Phase 11 should lean on three layers of verification:

1. **Unit tests for planning/writing logic**
   - registry resolution
   - manifest ownership decisions
   - conflict classification
   - per-runtime destination mapping

2. **Filesystem integration tests in temp directories**
   - install into fake `~/.claude`, `~/.gemini`, `~/.config/opencode`, and `~/.codex`
   - install into fake project-local `.claude`, `.gemini`, `.opencode`, `.codex`
   - assert emitted files and manifest entries

3. **CLI smoke checks**
   - run installer against temp paths using flags
   - verify final summary includes expected runtime-specific help commands

Recommended commands after implementation:
- `npm run build`
- `npm run test:run -- [targeted installer test files]`
- `node dist/index.js --all --global` against temp home override if the implementation supports it

### Manual

Manual inspection should be minimal in Phase 11. The only manual-worthy checks are:
- confirming asset file contents are readable and branded correctly
- checking that the installed skill/prompt names feel coherent across runtimes

The behavior itself should be automatable with temp-directory installs.

---

## Risks and Mitigations

| Risk | Why it matters | Mitigation |
|------|----------------|------------|
| Assets are added but not published | `npx` installs work locally but fail from npm | Update `package.json` packaging and verify with tarball inspection in Phase 12 |
| Prompt-runtime layouts drift apart | Users see different command vocabularies by runtime | Define a shared minimal command inventory and adapt only syntax/filenames |
| Codex payload becomes a thin prompt clone | `$@tayo-dev/rtl-help` and skill ergonomics feel wrong | Implement Codex as its own runtime family with skill directories from the start |
| Ownership marker is bolted on late | Phase 12 update flow has no trustworthy ownership source | Introduce the marker/manifest in the first runtime-delivery pass |
| Conflict behavior is hidden inside copy code | Replacement prompts and summary output become inconsistent | Model file operations and conflict states before the writer executes |

---

## Validation Architecture

Phase 11 should be Nyquist-friendly with fast automated checks after each plan and a slightly broader integration sweep after each wave.

Recommended contract:

- **Foundation quick loop**
  - `npm run build`
  - targeted installer unit tests for registry / planning / manifest logic

- **Runtime delivery quick loop**
  - `npm run build`
  - targeted temp-directory filesystem tests for the runtime(s) touched in that plan

- **Wave-level integration loop**
  - `npm run build`
  - targeted installer test suite covering all supported runtimes
  - non-interactive CLI smoke command against temp destinations

Validation must explicitly cover:
- packaged prompt-runtime assets exist and are copied to the right paths
- Codex writes `skills/@tayo-dev/rtl-*/SKILL.md`
- local OpenCode path uses `./.opencode`
- `--all` produces writes/results for all supported runtimes
- ownership marker/manifest is written wherever the install owns files

---

*Phase: 11-runtime-targets-asset-delivery*
*Research completed: 2026-03-07*
