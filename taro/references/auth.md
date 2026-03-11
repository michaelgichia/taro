# Authentication Checkpoint (Provider-Agnostic)

Purpose:
Enable optional browser-based screenshot capture on authenticated routes.

Important:
Authentication must never block test generation.
Secrets are never stored in state.
Only environment variable NAMES are stored.

Auth recipes are stored inside:
.taro/state.json → auth.recipes[]

---

## Auth Recipe Structure (stored in state.json)

Each recipe looks like:

{
"id": "string",
"label": "string",
"scope": ["string"],
"strategy": "none | ui_email_password | ui_oauth_manual | cookie | header",
"detectAuthRequired": {
"urlIncludes": ["string"],
"pageTextIncludes": ["string"]
},
"detectAuthenticated": {
"urlExcludes": ["string"],
"pageTextExcludes": ["string"]
},
"ui": {
"emailSelectors": ["string"],
"passwordSelectors": ["string"],
"submitSelectors": ["string"],
"postLoginWait": {
"urlNotIncludes": ["string"],
"pageTextIncludes": ["string"],
"timeoutMs": 8000
}
},
"credentials": {
"emailEnv": "string | null",
"passwordEnv": "string | null",
"cookieEnv": "string | null",
"headerEnv": "string | null"
},
"confidence": 0.0,
"evidence": [],
"createdAt": "ISO-8601",
"updatedAt": "ISO-8601"
}

---

## First Run Behavior

If Taro detects a login page but no recipe exists:

- Create a recipe with:
  - strategy = "ui_oauth_manual"
  - scope = current site origin
  - detection fields filled from observed URL/text
  - low confidence (0.4)
- If browser tools are available, run a manual checkpoint:
  - navigate to the protected route
  - instruct the user to complete authentication in-browser
  - wait/poll `detectAuthenticated` until timeout
- If authenticated during checkpoint:
  - set auth status to `authenticated`
  - continue with screenshot capture
- If not authenticated by timeout:
  - keep auth status `unknown_recipe`
  - skip screenshots and continue test generation.

## Manual OAuth Checkpoint (ui_oauth_manual)

When `strategy` is `ui_oauth_manual`:

- Taro must open the browser and pause for user completion of login.
- Taro must poll `detectAuthenticated` conditions (URL/text) until timeout.
- Taro must not capture screenshots before authentication succeeds.
- On success, set auth status `authenticated`; on timeout, set `failed` (or `unknown_recipe` for first-run templates).

---

## Security Rules

- Never store passwords in files.
- Never print credential values.
- Only read credentials from environment variables.
