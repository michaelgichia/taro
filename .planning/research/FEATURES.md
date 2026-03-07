# Feature Research

**Domain:** installer-first distribution for AI coding runtimes
**Researched:** 2026-03-07
**Confidence:** HIGH

## Feature Landscape

### Table Stakes (Users Expect These)

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Interactive install flow | Users should not need to memorize runtime directories | MEDIUM | Prompt for runtime target(s) and install location |
| Non-interactive flags | CI, scripts, and power users expect deterministic installs | MEDIUM | Support `--claude`, `--opencode`, `--gemini`, `--codex`, `--all`, `--global`, `--local` |
| Runtime-specific assets | Each runtime has a different way to surface prompts or skills | HIGH | Claude/OpenCode/Gemini rely on command/prompt files; Codex is skills-first |
| Verification commands | Users need a quick success check after install | LOW | Docs and install summary must include runtime-native help commands |
| Idempotent re-run/update | Installer packages are often rerun instead of manually upgraded | MEDIUM | Reapplying should repair or refresh assets safely |

### Differentiators (Competitive Advantage)

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| One package for all runtimes | Users can install Taro once and target the runtime they actually use | HIGH | The runtime registry becomes the core distribution abstraction |
| Preserve existing generator payload | Installer adoption should not regress direct `taro generate` usage | MEDIUM | Keeps current value while expanding distribution |
| Codex skills-first support | Codex differs from prompt-based runtimes and often gets ignored | HIGH | Installing `skills/@tayo-dev/rtl-*/SKILL.md` is a meaningful differentiator |

### Anti-Features (Commonly Requested, Often Problematic)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Full product rebrand in the same milestone | Feels related to runtime distribution | Couples naming churn to installer architecture and slows delivery | Keep package scope fixed in v1.2, defer broad rename work |
| Hosted template registry | Seems flexible for future runtime assets | Adds network dependency, auth questions, and release drift | Ship versioned templates in the package |
| Auto-install every runtime by default | Sounds convenient | Writes into runtimes the user may not want and makes failures noisier | Prompt for a specific runtime or explicit `--all` |

## Feature Dependencies

```text
Interactive installer
    └──requires──> runtime registry
                         └──requires──> asset templates

Verification commands ──enhances──> runtime installation

Idempotent update flow ──requires──> install manifest / overwrite strategy

Broad product rebrand ──conflicts──> installer-first milestone scope
```

### Dependency Notes

- **Interactive installer requires runtime registry:** prompts are only useful once each target runtime has a clear install contract
- **Runtime registry requires asset templates:** each runtime needs a concrete payload to copy or render
- **Idempotent update flow requires overwrite strategy:** reruns must know what they own so they can refresh safely
- **Broad rebrand conflicts with installer-first scope:** it multiplies docs, commands, and migration concerns without unlocking the installer itself

## MVP Definition

### Launch With (v1.2)

- [ ] Interactive installer entrypoint — core adoption path
- [ ] Runtime and install-location selection — defines where Taro lands
- [ ] Claude, OpenCode, Gemini, and Codex install targets — complete the promised runtime matrix
- [ ] Non-interactive flags — support CI, scripts, and reproducible setups
- [ ] Verification + update docs — keep install success observable and repeatable

### Add After Validation (v1.x)

- [ ] Uninstall command — add once install ownership is stable
- [ ] Richer install doctor / diagnostics — add after the first round of runtime support reveals common failures

### Future Consideration (v2+)

- [ ] Broad `Taro`/`taro` product renaming — defer until installer behavior is proven
- [ ] Additional runtimes beyond the current four — defer until the runtime registry is stable
- [ ] Remote prompt/template updates — defer until local distribution patterns are solid

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Interactive installer | HIGH | MEDIUM | P1 |
| Runtime asset installation | HIGH | HIGH | P1 |
| Non-interactive flags | HIGH | MEDIUM | P1 |
| Verification commands | HIGH | LOW | P1 |
| Idempotent rerun/update | HIGH | MEDIUM | P1 |
| `--all` runtime install | MEDIUM | MEDIUM | P2 |
| Uninstall flow | MEDIUM | MEDIUM | P3 |

**Priority key:**
- P1: Must have for launch
- P2: Should have, add when possible
- P3: Nice to have, future consideration

## Competitor Feature Analysis

| Feature | GSD-style target | Current Taro | Our Approach |
|---------|------------------|--------------|--------------|
| Guided install | Yes | No | Add interactive runtime + location prompts |
| Multi-runtime support | Yes | No | Introduce a runtime registry and asset pack model |
| Codex skills support | Yes | No | Treat Codex as a dedicated skills target |
| Direct generator CLI | Not the focus | Yes | Preserve it while shifting onboarding to installer-first |

## Sources

- Current Taro package and README — baseline for what exists today
- User-provided GSD onboarding flow — benchmark for the desired installer experience

---
*Feature research for: installer-first runtime distribution*
*Researched: 2026-03-07*
