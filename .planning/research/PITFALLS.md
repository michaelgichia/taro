# Pitfalls Research

**Domain:** multi-runtime installer rollout
**Researched:** 2026-03-07
**Confidence:** MEDIUM

## Critical Pitfalls

### Pitfall 1: Package Entry Ambiguity

**What goes wrong:**
Users see one package name in installation docs and a different package in the `npx` command, so onboarding breaks before install even starts.

**Why it happens:**
Installer work often begins with copied competitor docs before package ownership is locked.

**How to avoid:**
Lock `@tayo-dev/rtl` as both the package owner and installer entrypoint in phase 10, then test the exact documented commands from the README.

**Warning signs:**
Docs mention multiple package names or example commands that do not exist in `package.json`.

**Phase to address:**
Phase 10

---

### Pitfall 2: Runtime Path Assumptions

**What goes wrong:**
Installer writes into the wrong directory, or only supports one of global/local installation paths correctly.

**Why it happens:**
Runtime filesystem conventions get hardcoded instead of modeled explicitly.

**How to avoid:**
Introduce a runtime registry with explicit global and local resolvers, then test each target path independently.

**Warning signs:**
Path code branches directly on environment strings or home-directory assumptions in multiple files.

**Phase to address:**
Phase 10

---

### Pitfall 3: Codex Treated Like Prompt-Based Runtimes

**What goes wrong:**
Codex installs prompt files instead of skills, leaving users without the `$@tayo-dev/rtl-help` entrypoint they expect.

**Why it happens:**
Most runtime support starts from prompt-centric assumptions and forgets that Codex uses a skills model.

**How to avoid:**
Give Codex its own runtime module and asset type from the start, with `SKILL.md` payloads under `skills/@tayo-dev/rtl-*`.

**Warning signs:**
Codex is implemented as a copy of the Claude/Gemini path with only directory names changed.

**Phase to address:**
Phase 11

---

### Pitfall 4: Installer Works Once but Not on Update

**What goes wrong:**
The first install succeeds, but rerunning the installer duplicates files, clobbers user edits, or leaves stale assets behind.

**Why it happens:**
Installers often skip explicit ownership rules and overwrite strategy until after initial launch.

**How to avoid:**
Track owned files, define overwrite policy, and test the rerun path before calling the flow "done."

**Warning signs:**
No install manifest, no dry-run preview, and no tests for second-run behavior.

**Phase to address:**
Phase 12

---

### Pitfall 5: Docs Drift from Emitted Commands

**What goes wrong:**
README examples and verification commands no longer match the installed asset names or package entrypoint.

**Why it happens:**
Installer payloads and docs evolve separately.

**How to avoid:**
Treat README examples as smoke-test inputs and verify the documented help commands in phase 12.

**Warning signs:**
Example commands only appear in markdown and never in automated or manual verification.

**Phase to address:**
Phase 12

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Hardcoding runtime paths inline | Faster first implementation | Very expensive to add or fix runtimes later | Never |
| Generating long prompt/skill text inline | Fewer files in repo | Diff noise and escaping bugs | Only for tiny placeholders, not real payloads |
| Treating rerun/update as "future" | Ships the first install sooner | Support burden rises immediately after launch | Only if milestone explicitly excludes update flow, which v1.2 does not |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Claude/Gemini/OpenCode assets | Assuming all prompt/command filenames follow one convention | Model emitted file names per runtime and verify the help command each runtime uses |
| Codex assets | Writing plain prompt files | Install skill directories with `SKILL.md` payloads |
| Published tarball | Forgetting to include runtime assets in `files` | Verify `npm pack` contents before release |

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Too many prompts before a useful default appears | Install feels slow and confusing | Ask runtime first, location second, then confirm only if needed |
| Hidden non-interactive flags | Automation users cannot adopt the tool | Surface flag equivalents in help text and README |
| Unclear success state | Users do not know whether install worked | Print runtime-specific verification commands at the end of every install |

## "Looks Done But Isn't" Checklist

- [ ] **Installer entrypoint:** documented `npx` command exists in the published package
- [ ] **Global/local install:** both locations are tested per runtime
- [ ] **Codex support:** writes `SKILL.md` assets, not only command files
- [ ] **Rerun flow:** second install updates or repairs without duplicate output
- [ ] **Docs:** verification commands in the README match emitted assets exactly

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Package entry ambiguity | Phase 10 | `package.json` bin/help output matches README examples |
| Runtime path assumptions | Phase 10 | path-resolution tests cover all runtime/location combinations |
| Codex treated like prompts | Phase 11 | Codex install writes skills and exposes the expected help command |
| Installer fails on update | Phase 12 | rerun tests confirm refresh/repair behavior |
| Docs drift from emitted commands | Phase 12 | README examples are exercised as smoke checks |

## Sources

- Current Taro package layout and README
- User-provided target installer behavior and runtime verification commands

---
*Pitfalls research for: multi-runtime installer rollout*
*Researched: 2026-03-07*
