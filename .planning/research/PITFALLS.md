# Milestone Research: Pitfalls

**Date:** 2026-03-31 **Milestone:** v1.0 Regrade a test directory

## Risks

- tracker metadata could diverge from the actual appended `generatedTests` record if score writes and tracker writes are not ordered carefully
- batch regrade could accidentally rescore non-test files unless discovery rules are explicit
- resume logic could double-process completed tests if the tracker and state history use different gating assumptions
- runtime docs could mention directory-loop support before the underlying shared regrade implementation is actually in place

## Guardrails

- keep one in-progress entry at a time
- preserve the latest-5 history rule exactly
- write regression tests around resume, retry, and completed-entry skipping
- update runtime help only after the command behavior exists
