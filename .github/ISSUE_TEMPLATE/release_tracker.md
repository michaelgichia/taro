---
name: 🚀 Release Tracker
about: Track the progress and changelog for a new package version.
title: "release: v"
labels: release
assignees: ""
---

## Release Overview

**Version:** v*.*.\_ **Type:** (Patch | Minor | Major) **Primary Goal:** (e.g., Fixing auth bug, Adding telemetry, etc.)

## Pre-Release Checklist

- [ ] All PRs for this version are merged into `main`.
- [ ] Local tests pass (`pnpm test`).
- [ ] Documentation/README updated (if applicable).
- [ ] Version bumped via `pnpm version`.

## Deployment

- [ ] Tag pushed to GitHub (`git push origin main --tags`).
- [ ] GitHub Action "Publish to npm" completed successfully.
- [ ] Verified package is live on [npmjs.com](https://www.npmjs.com/).

## Changelog Summary

Use `pnpm run changelog` to generate a Markdown summary from commits since the last tag, then edit for final release notes.

### Added

-

### Fixed

-

### Changed

-

## References

- Related Issues: #
- PRs: #
