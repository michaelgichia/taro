# JSDoc Template for Coding Agents

Use this template when writing JSDoc for any non-trivial function. Fill in each section according to the rules below. Omit optional sections only when they genuinely don't apply.

---

```js
/**
 * [SUMMARY] One sentence. Start with a verb. Describe what the function returns or does,
 * not how it does it. If the return value has a non-obvious shape or format, say so here.
 *
 * [BODY - optional, use when any of these apply]
 * - The return value has a special format, encoding, or structure that isn't captured by the type alone.
 * - There is a dominant early-exit or bypass condition that changes the entire behaviour.
 * - A parameter combination produces a result that would surprise a caller.
 * - A real usage example makes the contract clearer than prose alone.
 *   e.g. `path.join(homeDir, <return value>)`
 *
 * [SIDE EFFECTS / CONSTRAINTS - optional]
 * Note any mutations, I/O, throws, or invariants a caller must know about.
 *
 * @param {<type>} <name> - [One sentence. State the behavioural contract, not just what it is.
 *   If a value of false/null/0 triggers a bypass or special path, say so explicitly.
 *   For string unions, list every accepted value: {'a'|'b'|'c'}]
 *
 * @param {<type>} [<name>=<default>] - [Bracket the name when optional. State the default's effect.]
 *
 * @returns {<type>} [What the return value represents AND its format if non-obvious.
 *   Include a concrete example when the shape is unusual:
 *   e.g. `"'.config', 'opencode'"` or `{ id: string, createdAt: Date }`]
 *
 * @throws {<ErrorType>} [When and why this is thrown - optional]
 */
```

---

## Rules

### Summary line

- **Start with a verb**: _Returns_, _Builds_, _Resolves_, _Formats_, _Checks_
- **Describe the output**, not the implementation
- If the return value has a non-obvious format, call it out immediately rather than deferring to `@returns`

### Body (the paragraph block)

- Include it when the summary alone would leave a careful caller with open questions
- Lead with the most surprising or constraining fact
- Use inline code for literals, function names, and examples
- **Do not paraphrase the summary** — every sentence must add new information

### `@param`

- Write the **behavioural contract**, not a restatement of the name
  - ❌ `isGlobal - Whether this is a global install`
  - ✅ `isGlobal - When false, bypasses all runtime-specific logic and delegates to getDirName(runtime)`
- For string unions, enumerate **every valid value** including any that are missing from the obvious list
- For booleans, spell out what `false` (or `true`) does, not just what the flag means

### `@returns`

- **Never omit this.** If the function returns anything, document it.
- State both the type and what the value represents
- When the format is non-obvious (pre-quoted strings, comma-separated segments, encoded values), include a concrete example on the next line, indented two spaces

### What to omit

| Section              | Omit when                                       |
| -------------------- | ----------------------------------------------- |
| Body paragraph       | Summary + tags fully capture the contract       |
| `@throws`            | Function doesn't throw                          |
| `@param` description | Name + type are truly self-evident (rare)       |
| `@returns`           | Function is `void` / always returns `undefined` |
