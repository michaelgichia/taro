# Architecture Research

**Domain:** local installer architecture for AI runtime integrations
**Researched:** 2026-03-07
**Confidence:** MEDIUM

## Standard Architecture

### System Overview

```text
┌─────────────────────────────────────────────────────────────┐
│                    CLI ENTRYPOINT LAYER                     │
├─────────────────────────────────────────────────────────────┤
│  install command   flags parser   interactive prompts       │
├─────────────────────────────────────────────────────────────┤
│                   INSTALL ORCHESTRATION                     │
├─────────────────────────────────────────────────────────────┤
│  runtime registry   location resolver   plan builder        │
│  asset renderer     file writer         summary reporter    │
├─────────────────────────────────────────────────────────────┤
│                     RUNTIME PAYLOADS                        │
├─────────────────────────────────────────────────────────────┤
│  claude assets   opencode assets   gemini assets   codex    │
│                                                     skills  │
└─────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Typical Implementation |
|-----------|----------------|------------------------|
| CLI entrypoint | Parse commands and decide interactive vs non-interactive flow | Commander command(s) and small prompt wrappers |
| Runtime registry | Describe each runtime's directories, asset types, and verification command | Typed config objects keyed by runtime id |
| Install engine | Build an install plan, write files, and handle overwrite/update behavior | Filesystem service operating on a dry-run-able plan |
| Asset layer | Store prompts, commands, skills, and helper files | Repo-local templates copied with small substitutions |
| Verification reporter | Tell the user what was installed and how to check it | Structured install summary plus help commands |

## Recommended Project Structure

```text
src/
├── cli/
│   └── commands/
│       ├── generate.ts      # existing generator command
│       └── install.ts       # new installer command / default entry
├── install/
│   ├── registry.ts          # runtime registry and metadata
│   ├── prompts.ts           # interactive selection flow
│   ├── resolver.ts          # global/local path resolution
│   ├── planner.ts           # install plan and overwrite decisions
│   ├── writer.ts            # file writes, updates, dry-run support
│   ├── verify.ts            # runtime-native verification output
│   └── runtimes/
│       ├── claude.ts
│       ├── opencode.ts
│       ├── gemini.ts
│       └── codex.ts
├── assets/
│   ├── claude/             # commands/prompts shipped in package
│   ├── opencode/
│   ├── gemini/
│   └── codex/
└── core/                   # existing generator pipeline
```

### Structure Rationale

- **`install/`** keeps runtime-distribution logic isolated from generator internals
- **`assets/`** makes emitted files reviewable, testable, and packable
- **`install/runtimes/`** lets each runtime encode only its own path and asset rules

## Architectural Patterns

### Pattern 1: Runtime Registry

**What:** one typed definition per runtime with directories, asset types, and verification commands
**When to use:** always, because the installer targets multiple runtimes with different conventions
**Trade-offs:** adds upfront modeling work but prevents path logic from spreading across the CLI

**Example:**
```typescript
type RuntimeTarget = 'claude' | 'opencode' | 'gemini' | 'codex'

interface RuntimeDefinition {
  id: RuntimeTarget
  globalDir: string
  localDir: string
  assetKind: 'prompt' | 'command' | 'skill'
  verifyCommand: string
}
```

### Pattern 2: Install Plan Before Write

**What:** resolve a complete file operation plan before touching the filesystem
**When to use:** whenever the installer may overwrite existing runtime assets
**Trade-offs:** slightly more code, but much easier dry-run, testing, and rollback reasoning

### Pattern 3: Packaged Asset Templates

**What:** store runtime payloads as repo-local template files instead of constructing them inline
**When to use:** for prompts, command files, and Codex skills
**Trade-offs:** package tarball gets larger, but emitted behavior stays auditable and documentation-friendly

## Data Flow

### Request Flow

```text
[User runs npx @tayo-dev/rtl@latest]
    ↓
[CLI entrypoint]
    ↓
[Prompt or flag parser]
    ↓
[Runtime registry + location resolver]
    ↓
[Install plan builder]
    ↓
[File writer]
    ↓
[Summary + verification commands]
```

### Key Data Flows

1. **Interactive install:** prompt for runtime and location, build plan, write assets, show verify commands
2. **Non-interactive install:** validate flags, build the same plan without prompts, write assets, show machine-readable summary if needed
3. **Rerun/update:** detect owned files, refresh payloads idempotently, and report what changed

## Anti-Patterns

### Anti-Pattern 1: CLI Switchyard

**What people do:** scatter runtime-specific conditionals across one large install command
**Why it's wrong:** every new runtime multiplies branching and makes verification fragile
**Do this instead:** centralize runtime differences in a registry plus per-runtime modules

### Anti-Pattern 2: Prompt-Only Installer

**What people do:** build a nice interactive flow but skip a deterministic flag path
**Why it's wrong:** automation users cannot install in CI or scripts
**Do this instead:** make prompts a thin wrapper around the same validated install plan

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| Claude Code filesystem | prompt/command asset copy | Needs global and local target resolution |
| OpenCode config dir | command asset copy | Path handling should not assume only one config root |
| Gemini config dir | prompt/command asset copy | Verification command should match installed asset name |
| Codex skill dir | skill directory copy | Must write `SKILL.md` payloads instead of prompts |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| `cli` ↔ `install` | direct function call | CLI stays thin; install engine owns behavior |
| `install` ↔ `assets` | file/template lookup | Asset names should be versioned and explicit |
| `install` ↔ existing `core` generator | none at install time | Keep install concerns decoupled from generation logic |

## Sources

- Current Taro source tree and entrypoint — established the existing CLI boundary
- User-provided runtime target behavior — established the required installer outcomes

---
*Architecture research for: local installer architecture*
*Researched: 2026-03-07*
