# Release Notes: v1.3.0-alpha.0

## Summary

`v1.3.0-alpha.0` is the first prerelease for the JS-baseline milestone. It makes Testing Library Recorder `.js` exports first-class inputs in the shared `tayo generate` flow, preserves baseline query/assertion evidence recovered from recorder JS, and adds regression proof that the legacy JSON path still works while the JS path improves.

This is an alpha release. The wider `v1.3` roadmap is not complete yet, so selector strengthening, structured suite planning, and final scoring/docs parity are still scheduled follow-up work.

## Highlights

- Shared parsed-input contract and loader for recorder `.js` and legacy JSON inputs
- AST recovery for nested `userEvent(...)`, Testing Library queries, selectors, and URL/title assertions
- Shared CLI flow for recorder JS through normalization instead of transcript replay
- Regression coverage for CLI parity, intent grouping, JSON non-regression, and selector-boundary behavior
- Release-facing package metadata, CLI help, and runtime assets aligned around generic Recorder exports

## Verification

- `npm run build`
- `npm run test:run -- src/cli/commands/generate.test.ts src/core/input-loader.test.ts src/core/recording-intelligence.test.ts src/core/js-parser.test.ts src/core/parser.test.ts`
- `node dist/index.js --version`
- `env NPM_CONFIG_CACHE=/tmp/tayo-npm-cache npm pack --json --dry-run`

## GitHub Release Title

`v1.3.0-alpha.0`

## NPM Publish Command

```bash
env NPM_CONFIG_CACHE=/tmp/tayo-npm-cache npm publish --tag alpha --access public
```

## Git Commands

```bash
git push origin from-json-to-rtl
git tag -a v1.3.0-alpha.0 -m "release: v1.3.0-alpha.0"
git push origin v1.3.0-alpha.0
```
