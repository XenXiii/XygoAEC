# Xygo AI AEC Operating System

Staged, non-production repository foundation for the Xygo AI AEC Operating System.

Current status:
- staged core complete
- read-only staged API foundation added
- local mock-only development
- no production credentials
- no live external providers

## Repository Intent

This monorepo will grow section-by-section and phase-by-phase. The current foundation exists to:
- document the architecture
- enforce staged-mode policy
- define governance and security gates
- seed synthetic demo fixtures
- establish the initial repository shape

## Current Working Code

- `packages/staged-mode`
  - centralized staged-mode safeguards
  - production-target blocking
  - live-credential pattern rejection
  - policy-violation audit capture
- `apps/api`
  - staged tenant-scoped workflow endpoints
  - sqlite-backed staged persistence by default
  - staged SSE event stream
  - tenant-scoped header enforcement
  - OpenAPI seed file in `docs/api/openapi.v1.json`
- `apps/web`
  - local staged browser runtime
  - responsive control-room UI over the staged API

## Commands

```bash
npm test
npm run test:api
npm run verify:audit
```

## Key Docs

- [Corporate architecture brief](./projects/xygo-aec-corporate-os-architecture.md)
- [Source ledger](./docs/research/source-ledger.md)
- [Architecture ADR](./docs/adr/0001-modular-monolith-baseline.md)
- [Domain map](./docs/architecture/domain-map.md)
- [Staged-mode policy](./docs/security/staged-mode-policy.md)
