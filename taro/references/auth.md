# Authentication Checkpoint (Provider-Agnostic)

Purpose:
Enable optional browser-based screenshot capture on authenticated routes.

Important:
Authentication must never block test generation.
Secrets are never stored in state.
Only environment variable NAMES are stored.

Current v1 status:
Persistent auth recipes are not implemented in `.taro/state.json` yet.
Authentication handling is transient and manual when screenshot capture hits a protected route.

---

## Current Behavior

- If Taro can generate without browser auth, it continues normally.
- If optional browser inspection lands on a login page, Taro should treat that as an inspection limitation, not a generation blocker.
- If a manual auth checkpoint is needed, the user completes it in-browser for that session only.
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
