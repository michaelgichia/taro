# Authentication Checkpoint (Provider-Agnostic)

Purpose: Enable optional browser-based screenshot capture on authenticated routes.

Important: Authentication must never block test generation. Secrets are never stored in state. Only non-secret identifiers such as relative file paths or environment variable NAMES are stored.

Current v1 status: Taro can persist non-secret Playwright auth metadata in `.taro/state.json`. Today this supports:

- detected Playwright `storageState` files from common repo patterns and Playwright config
- explicit `--auth <storageState.json>` paths provided during `gen`
- explicit `--instructions <auth.md>` references for manual auth runbooks

Stored metadata must stay non-secret:

- strategy
- relative file path
- discovery source
- discovery phase

---

## Current Behavior

- If Taro can generate without browser auth, it continues normally.
- If optional browser inspection lands on a login page, Taro classifies that as an auth interrupt rather than a generic timeout.
- If a reusable `storageState` file is known, Taro injects it automatically for optional screenshot capture.
- In interactive runs, Taro launches a local Playwright browser for optional screenshot capture and auth checkpoints.
- Completion is automatic: Taro resumes only after expected route/title checks pass and the target selector or expected landmarks appear.
- On successful manual auth, Taro saves `storageState`, persists the chosen non-secret path in `.taro/state.json`, and reuses it later.
- If a wrapper environment does not expose TTY stdio cleanly, pass `-i` / `--interactive-auth` to force interactive auth recovery for that run.
- If Playwright launch or navigation fails, screenshot capture is skipped with explicit guidance and core generation continues.
- In non-interactive runs, Taro does not attempt interactive auth recovery and should report remediation guidance instead of silently degrading.
- If manual auth times out, screenshot capture stops with a clear auth error, but optional browser work must not be mistaken for a generation failure.
- Secrets must never be written to `.taro/state.json`, `.taro/overrides.json`, or generated tests.

## Future-Compatible Guidance

If persistent auth support is added later, it still must follow these rules:

- store only environment variable names or other non-secret identifiers
- keep auth recipes optional and provider-agnostic
- never block core test generation on unavailable auth
- prefer manual, explicit checkpoints over hidden automation when confidence is low

---

## Security Rules

- Never store passwords in files.
- Never print credential values.
- Only read credentials from environment variables.
