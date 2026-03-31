# Requirements: Taro

**Defined:** 2026-03-31
**Core Value:** Taro should produce repo-aware, auditable RTL output and score history that make uncertainty explicit instead of hiding it.

## v1 Requirements

### Directory Selection

- [ ] **RGDIR-01**: User can run `regrade <test-directory> --directory-loop` and Taro discovers eligible `*.test.*` and `*.spec.*` files in that directory.
- [ ] **RGDIR-02**: Taro ignores non-test files when building the regrade directory loop.
- [ ] **RGDIR-03**: Taro rejects `--directory-loop` when the provided path is not a directory.

### Tracker Lifecycle

- [ ] **RGTRK-01**: Taro writes a canonical Markdown tracker under `.taro/directory-loop/` for the target regrade directory.
- [ ] **RGTRK-02**: Each tracker entry starts as `pending` and records the discovered test path plus the current stored score threshold when available.
- [ ] **RGTRK-03**: When Taro starts regrading a test, that entry becomes `in-progress` and any previously in-progress entry is reset according to the current single-active-entry semantics.
- [ ] **RGTRK-04**: When Taro finishes regrading a test, that entry becomes `completed` and records the new score threshold plus follow-up comments from the regrade result.

### Regrade Execution

- [ ] **RGEX-01**: Directory-loop regrade processes tests sequentially until every eligible test in the target directory is completed.
- [ ] **RGEX-02**: If a directory-loop run stops or fails mid-loop, the current test remains `in-progress` and all remaining tests stay `pending` so the next run can resume safely.
- [ ] **RGEX-03**: Resume behavior does not reprocess tests already marked `completed` unless the loop explicitly requeues them under a documented gating rule.

### State History

- [ ] **RGST-01**: Each successful directory-loop regrade appends a fresh `generatedTests` snapshot for that test file while preserving unrelated history.
- [ ] **RGST-02**: Directory-loop regrade reuses the latest matching stored snapshot when present and still initializes history cleanly when a test has no prior snapshot.
- [ ] **RGST-03**: Taro keeps only the latest 5 stored snapshots per regraded test file after directory-loop runs, matching single-file `regrade`.

### Runtime Guidance

- [ ] **RGUX-01**: Runtime-facing docs/help describe how to invoke `regrade --directory-loop` and where to find the tracker file.

## v2 Requirements

### Batch Enhancements

- **RGBT-01**: User can configure whether completed entries should be requeued below a custom score threshold.
- **RGBT-02**: User can export an aggregate summary of directory-loop regrade deltas after the run finishes.
- **RGBT-03**: Taro can distribute regrade work across multiple workers without corrupting tracker or state history.

## Out of Scope

| Feature | Reason |
|---------|--------|
| Parallel batch regrading | Increases coordination complexity and conflicts with the current single-in-progress tracker model |
| New scoring rubric or changed grade bands | The milestone is about orchestration and tracking, not changing quality policy |
| Non-Markdown tracker UI | Existing batch UX is already file-based and scriptable under `.taro/directory-loop/` |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| RGDIR-01 | Phase 5 | Pending |
| RGDIR-02 | Phase 5 | Pending |
| RGDIR-03 | Phase 5 | Pending |
| RGTRK-01 | Phase 5 | Pending |
| RGTRK-02 | Phase 5 | Pending |
| RGTRK-03 | Phase 5 | Pending |
| RGTRK-04 | Phase 6 | Pending |
| RGEX-01 | Phase 6 | Pending |
| RGST-01 | Phase 6 | Pending |
| RGST-02 | Phase 6 | Pending |
| RGST-03 | Phase 6 | Pending |
| RGEX-02 | Phase 7 | Pending |
| RGEX-03 | Phase 7 | Pending |
| RGUX-01 | Phase 8 | Pending |

**Coverage:**
- v1 requirements: 14 total
- Mapped to phases: 14
- Unmapped: 0

---
*Requirements defined: 2026-03-31*
*Last updated: 2026-03-31 after gap-closure phase planning*
