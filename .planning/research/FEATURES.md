# Milestone Research: Features

**Date:** 2026-03-31
**Milestone:** v1.0 Regrade a test directory

## Existing Behaviors To Preserve

- single-file `regrade` compares the current test against the latest matching stored snapshot
- `generatedTests` history keeps only the latest 5 snapshots per `testFile`
- `target --directory-loop` already provides a resumable Markdown tracker with `pending`, `in-progress`, and `completed`

## New Behavior Needed

- directory-targeted `regrade` invocation
- per-entry prior score and updated score visibility in the tracker
- per-entry follow-up comments after each regrade
- sequential processing until all eligible tests are completed
