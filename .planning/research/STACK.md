# Stack Research

**Domain:** multi-runtime installer package for AI coding tools
**Researched:** 2026-03-07
**Confidence:** MEDIUM

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| TypeScript | 5.7.x | Keep installer logic, runtime registries, and asset metadata typed | Already used in Taro and strong typing matters for per-runtime config objects |
| Node.js | >=18 | Filesystem, path, process, and interactive terminal support | Existing package already targets Node 18+, which is enough for local installer workflows |
| Commander | 12.x | Parse installer flags and expose subcommands cleanly | Already in the repo, stable for interactive and non-interactive CLI flows |
| Built-in `fs/promises`, `path`, `os` | Node core | Resolve install locations and write asset trees safely | Avoids unnecessary dependency growth for a filesystem-heavy installer |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `picocolors` | 1.x | Prompt/result formatting in the terminal | Use for install summaries, warnings, and verification output |
| Runtime asset templates | repo-local files | Ship prompts, commands, and skills as versioned payloads | Use for all runtime-specific install targets instead of generating long strings inline |
| `vitest` | 3.x | Validate path resolution, dry-run planning, and runtime output | Use for installer unit coverage and snapshotting emitted assets |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| `npm pack` / local smoke runs | Validate published package contents | Critical because installer assets must be included in the tarball |
| Fixture directories under `tmp` | Exercise local/global path resolution safely | Prefer isolated test roots over writing into real home directories |
| README-driven smoke checklist | Keep docs aligned with emitted commands | The installer UX is only trustworthy if the documented commands are tested verbatim |

## Installation

```bash
# Core (already present)
npm install commander picocolors

# Dev dependencies (already present)
npm install -D typescript vitest
```

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| Commander CLI with explicit install subcommands | Custom argument parser | Only worth it if the package becomes tiny enough that Commander overhead is a real concern |
| Node core filesystem APIs | `fs-extra` | Use only if copy/merge semantics become complex enough to justify another dependency |
| Repo-local runtime asset templates | Downloading prompts/skills at install time | Only if a future hosted registry exists, which is out of scope for this milestone |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| Hardcoded string writes for each runtime | Makes asset drift and quoting bugs likely | Versioned template files plus small substitutions |
| Separate installer package in v1.2 | Adds package-ownership and publishing complexity too early | Keep installer entrypoint inside `@tayo-dev/rtl` |
| Runtime-specific code paths mixed into generator pipeline | Blurs installation concerns with test generation logic | Isolate installer modules under their own namespace |

## Stack Patterns by Variant

**If running interactively:**
- Use Commander flags plus a prompt layer built from standard input/output
- Because the installer must guide users through runtime and location selection without extra shell knowledge

**If running non-interactively:**
- Use validated flag combinations and skip prompts entirely
- Because Docker, CI, and scripted setups need deterministic behavior

## Version Compatibility

| Package A | Compatible With | Notes |
|-----------|-----------------|-------|
| `commander@12.x` | `node>=18` | Matches the current repo and existing CLI implementation |
| `typescript@5.7.x` | current ESM build | Keeps installer code aligned with the existing build output |
| `vitest@3.x` | Node test environment | Sufficient for path- and template-focused tests |

## Sources

- Current repo state: `package.json`, `src/index.ts`, `README.md` — verified the existing package is a single Commander-based `taro` CLI
- User-provided target UX (2026-03-07 conversation) — defined desired interactive installer flow, runtime targets, and verification commands
- GSD installation pattern referenced by the user — high-confidence product benchmark for the target installer behavior

---
*Stack research for: multi-runtime installer package*
*Researched: 2026-03-07*
