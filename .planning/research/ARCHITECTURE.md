# Milestone Research: Architecture

**Date:** 2026-03-31
**Milestone:** v1.0 Regrade a test directory

## Likely Integration Path

- reuse the existing directory-loop tracker utility as the canonical tracker writer/reader
- extract or formalize a reusable single-test regrade implementation that batch mode can call
- keep tracker metadata focused on operator visibility while `.taro/state.json` remains the source of truth for stored score history
- preserve current exit-code and resume semantics from `target --directory-loop`

## Architectural Tension

The repo currently has clear CLI batch logic for `target` but `regrade` is primarily described through runtime skills/docs. The milestone should create a shared seam so single-file and directory-loop regrade behavior cannot drift.
