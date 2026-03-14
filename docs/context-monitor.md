# Context Monitor

Taro keeps its generation context local to each project. The primary state lives in:

- `.taro/state.json` for learned package profiles, boundary profiles, boundary exemplars, render helpers, runner preference, fixture roots, and generated-test history
- `.taro/summary.md` for a human-readable snapshot of learned boundary strategy, collaborator categories, confidence, and low-confidence scaffolds
- `.taro/overrides.json` for manual package-level policy overrides such as runner, render helper, boundary policies, and preferred boundary implementations
- `.taro/visual/` for optional screenshots or visual debugging artifacts

The repository includes lightweight helpers for checking that state:

- `node hooks/taro-context-monitor.js` prints a small summary of available convention and visual context
- `node hooks/taro-statusline.js` prints a single-line status that can be embedded in terminal tooling
- `node hooks/taro-check-update.js` reminds users that updates happen through the installer package

These hooks are intentionally small and local. They do not contact external services.
