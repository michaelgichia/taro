# Persistent Mock Store

Location:
packages/**/src/tests/mock-store/

Rules:
- Deterministic IDs (ORG_001, INV_001)
- No random UUIDs
- Export seed objects
- Central index.ts exports all fixtures

Example:

export const ORG_001 = {
  id: "ORG_001",
  name: "Test Organisation",
  active: true
};