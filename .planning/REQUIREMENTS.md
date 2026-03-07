# Requirements: Taro

**Defined:** 2026-03-07
**Core Value:** Reduce the effort to write and maintain tests by automatically generating high-quality, codebase-aware React Testing Library tests from browser recordings

## v1.1 Requirements

### Documentation

- [x] **DOCS-01**: Developer can read an introduction explaining what Taro is, who it's for, and the problem it solves
- [x] **DOCS-02**: Developer can follow a Quick Start to install Taro and generate their first test in under 5 minutes
- [x] **DOCS-03**: Developer can look up all CLI flags and options for `taro generate` in the README
- [x] **DOCS-04**: Developer can follow a worked example showing a Chrome recording in → generated RTL test out
- [x] **DOCS-05**: Developer can read a guide for invoking Taro as a Claude Code skill / agent tool

### Package

- [x] **PKG-01**: `package.json` has `name=@tayo/rtl`, `files`, `exports`, and `engines` fields correctly set
- [x] **PKG-02**: Package version is bumped to 1.0.0
- [ ] **PKG-03**: `tsc` build produces a working `dist/` verified by running `node dist/index.js --help`
- [ ] **PKG-04**: `npx @tayo/rtl generate ./recording.js` installs and runs correctly after publish

## Future Requirements

### Documentation

- **DOCS-06**: Configuration reference for `.taro/` state and convention learning settings
- **DOCS-07**: Troubleshooting guide for common generation issues

### Package

- **PKG-05**: CI/CD integration guide (GitHub Actions, GitLab CI)

## Out of Scope

| Feature | Reason |
|---------|--------|
| Separate docs site | README-first is sufficient for v1.1; docs site deferred |
| API / programmatic usage docs | CLI-first for v1.1 |
| Automated npm publish in CI | Manual publish sufficient for first release |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| DOCS-01 | Phase 8 | Complete |
| DOCS-02 | Phase 8 | Complete |
| DOCS-03 | Phase 8 | Complete |
| DOCS-04 | Phase 8 | Complete |
| DOCS-05 | Phase 8 | Complete |
| PKG-01 | Phase 9 | Complete |
| PKG-02 | Phase 9 | Complete |
| PKG-03 | Phase 9 | Pending |
| PKG-04 | Phase 9 | Pending |

**Coverage:**
- v1.1 requirements: 9 total
- Mapped to phases: 9
- Unmapped: 0 ✓

---
*Requirements defined: 2026-03-07*
*Last updated: 2026-03-07 after roadmap creation (traceability confirmed)*
