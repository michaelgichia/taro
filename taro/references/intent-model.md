# Interaction Intent Model

Purpose:
Convert Puppeteer Replay `runStep` objects into semantic user-level intents that can drive:

- component discovery hints
- robust RTL query generation
- user-visible assertion extraction from marker actions
- screenshot milestone selection

This model must remain project-agnostic.
It stores intent + evidence + confidence.

---

## 1) ParsedStep Schema (input)

A ParsedStep is extracted deterministically from the recording using AST parsing.

```ts
type ParsedStep = {
  index: number;
  type: string; // e.g. "navigate" | "click" | "change" | ...
  url?: string;
  value?: string;
  keys?: string;
  selectors?: string[][];
  location?: { line: number; column: number };
};
```

Notes:

- `selectors` is an ordered list of selector chains from Puppeteer Replay.
- The parser must preserve selector order and grouping.

---

## 2) InteractionIntent Schema (output)

```ts
type QueryHint =
  | { kind: "role"; role: string; name?: string }
  | { kind: "label"; text: string }
  | { kind: "placeholder"; text: string }
  | { kind: "text"; text: string }
  | { kind: "css"; selector: string };

type Evidence = {
  kind: "selector" | "value" | "stepType";
  detail: string;
};

type InteractionIntent = {
  index: number;

  // Normalized action type
  type:
    | "navigate"
    | "click"
    | "type"
    | "select"
    | "assertExists"
    | "assertNotExists";

  // For navigation
  url?: string;

  // For typing/selecting
  value?: string;

  // For assertion intents
  assertionValue?: string;

  // Best guess of semantic target
  role?: string;
  name?: string;
  label?: string;

  // Query hints for RTL generation (ordered best → worst)
  queryHints: QueryHint[];

  // Raw selector chosen as best fallback (if any)
  rawSelector?: string;

  // Confidence score in [0..1]
  confidence: number;

  // Evidence used to derive the intent
  evidence: Evidence[];
};
```

Key principle:

- Downstream generation must prefer high-confidence intents and the earliest queryHints.
- Low-confidence intents must trigger conservative fallbacks and stronger verification.

---

## 3) Normalization Rules (ParsedStep → InteractionIntent)

### Step type mapping

- `navigate` → intent.type = "navigate", intent.url = step.url
- `click` → intent.type = "click"
- `change` (or typing-like step) → intent.type = "type", intent.value = step.value
- If step indicates option selection (if detectable) → intent.type = "select"
- Semantic `dblClick` marker on a visible proof target may emit
  `intent.type = "assertExists"` when marker rules match.

If the step type is unknown:

- map to the closest of click/type/select based on presence of value/selectors.
- set confidence low (<= 0.4).

---

## 3.1) Assertion Marker Detection (Non-Technical Flow)

Preferred marker pattern:

- user triggers a state change
- user double-clicks the visible target that proves the expected result

Deterministic interpretation rules:

1. Detect semantic `dblClick` steps that preserve marker metadata.
2. Look back to the nearest relevant state-changing anchor step.
3. If a semantic selector (`aria/` or `text/`) exists on that target, create:
   - `intent.type = "assertExists"`
   - query hint derived from that semantic selector
4. If the recorder only captured partial visible text, Taro may recover the
   canonical user-visible copy from nearby app source when the match is unique
   and confidence is high.
5. If no semantic selector exists, do not invent one:
   - fallback to conservative text query only when the recording includes visible text evidence
   - otherwise skip marker conversion and log low-confidence evidence

Notes:

- Marker conversion is additive and never blocks normal intent extraction.
- Marker gaps stay warning-only, but unresolved markers keep the result in
  draft/manual-review state.

---

## 4) Selector Resolution Ladder (deterministic)

Given `selectors: string[][]`, flatten into a prioritized list of individual selectors preserving order.

For each selector candidate:

1. If starts with `aria/`:
   - Extract accessible name text after `aria/`
   - Add queryHint:
     - `{ kind: "role", role: "button", name: <extracted> }` IF used in a click step
     - `{ kind: "role", role: "textbox", name: <extracted> }` IF used in a type step

   - Add evidence: selector
   - Increase confidence (+0.3)

2. If starts with `text/`:
   - Extract visible label after `text/`
   - Add queryHint: `{ kind: "text", text: <extracted> }`
   - Increase confidence (+0.2)

3. If selector looks like an input hint (heuristic, project-agnostic):
   - contains `input`, `textarea`, `[type=` or similar
   - Add queryHint: `{ kind: "placeholder", text: <unknown> }` only if placeholder is known later
   - Confidence unchanged unless label is discovered elsewhere

4. CSS fallback:
   - If selector is CSS and not aria/text, keep as `{ kind: "css", selector }`
   - Confidence +0.05 (tiny)
   - Set `rawSelector` if no better option exists

Important:

- Do not invent labels/placeholders from CSS selectors.
- Do not assume a role from CSS unless step context supports it (click → likely button/link; type → likely textbox).

---

## 5) Confidence Calculation

Start confidence at:

- 0.5 if step type is known
- 0.3 if step type is unknown

Then:

- +0.3 if aria/ exists
- +0.2 if text/ exists
- +0.1 if both aria/ and text/ corroborate similar name
- -0.2 if only CSS selectors exist
- Clamp to [0..1]

If multiple selector types exist, keep multiple queryHints in ranked order.

---

## 6) Output Requirements

For every ParsedStep (except setViewport):

- Emit an InteractionIntent with:
  - index
  - normalized type
  - confidence
  - evidence[]
  - queryHints[] (may include css as last resort)

Never emit an intent with empty queryHints for click/type/select.
For assertion intents (`assertExists`/`assertNotExists`), queryHints must include at least one non-css hint when possible.
If nothing is available, set:

- queryHints = [{ kind: "css", selector: "<unknown>" }]
- confidence = 0.1

---

## 7) How Downstream Modules Use This

- Component discovery:
  - prefer intents with confidence >= 0.6
  - use role/name hints to infer component context

- Screenshot milestones:
  - prefer click intents with confidence >= 0.6

- RTL generation:
  - use the first viable queryHint:
    - role → label → placeholder → text → css (only if allowed by conventions)
  - for marker assertion intents, emit explicit `expect(...)` assertions tied to user-visible outcomes.
