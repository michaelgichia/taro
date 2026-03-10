# Context Monitor

Tayo keeps its generation context local to each project. The primary state lives in:

- `.tayo/conventions.json` for learned import style, render helpers, mock shape, and file placement
- `.tayo/visual/` for optional screenshots or visual debugging artifacts

The repository includes lightweight helpers for checking that state:

- `node hooks/tayo-context-monitor.js` prints a small summary of available convention and visual context
- `node hooks/tayo-statusline.js` prints a single-line status that can be embedded in terminal tooling
- `node hooks/tayo-check-update.js` reminds users that updates happen through the installer package

These hooks are intentionally small and local. They do not contact external services.
