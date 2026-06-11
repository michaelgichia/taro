# Design: tr as a Heuristic Engine

tr is a heuristic engine for turning a recorded browser interaction into an RTL test. "Heuristic" is the framing because every decision — which query to use, what to mock, which file owns the test, what score to give — is made by a deterministic rule of thumb, not by inference. There is no LLM in the scoring or generation path. The same recording against the same repo state produces the same output every time.

Three properties follow from that choice.

## Cheap

Heuristics run in milliseconds. The generator can sit in a hot loop — `regrade` across a directory, repeated scoring during a mock-review repair pass, scoring every existing test on install — without budget concerns. This is what makes `.taro/state.json` viable as a living ledger: rescoring the whole history is free.

## Explainable

Every output is traceable to a rule. The score breaks into four weighted dimensions, each lost point is tied to a `reason` with a `dimension` and a `weight`, and a generator decision like "use `renderWithProviders`" points at a package profile entry with a list of evidence files. There is nothing inside tr you cannot open. When generation does something unexpected, the answer is in a specific stage and a specific source — see [`GENERATION.md`](./GENERATION.md) for the source-to-stage map.

## Self-tuning per repo

Heuristics start generic and refine through observation. tr ASTs every existing test in the repo, derives `TestConvention` records (import style, matcher preferences, query preferences, naming), grades each existing test using a richer regex+AST scorer, and stores the results in `.taro/state.json` and SQLite. On the next generation, those learned conventions outweigh tr's defaults. Two repos see different output from the same recording because their heuristics have learned different things. One repo gets `findByRole` because that's what dominates its existing tests; the other gets `getByRole` + `waitFor` for the same reason in reverse.

## The cost

Heuristics are approximate. They will occasionally reward a test that looks right but isn't, occasionally penalize an unusual but valid pattern, and occasionally pick the wrong render helper because the package profile is stale. That's why `requiresReview` exists and why scores under 80 always send the test back to a human. tr is not trying to be smart — it is trying to be _predictable_, so a human can stay in the loop without surprises.

## The pithy version

**tr is a deterministic, self-tuning, heuristic-driven RTL test author.** Recordings go in; explainable tests with explainable scores come out. The human stays the judge.

## Why this document exists

The companion docs explain _what_ tr does at each layer — [`PIPELINE.md`](./PIPELINE.md) for module order, [`GENERATION.md`](./GENERATION.md) for evidence sources, [`GRADING.md`](./GRADING.md) for scoring. None of them explain _why the tool is built this way at all_. Without that framing, three misreadings are common:

- A contributor proposes "let's add an LLM call here" to fix a heuristic miss, missing that the LLM call would forfeit determinism, cheapness, and explainability for one local win.
- A user expects tr to produce a perfect test from a single recording, missing that the design intentionally keeps the human as the final judge.
- A reviewer evaluates a score as a verdict rather than as triage, missing that an A grade still gates on `requiresReview` and blockers.

This document exists to make the design choice — heuristics over inference, predictability over intelligence — explicit, so the rest of the system can be read in that light.
