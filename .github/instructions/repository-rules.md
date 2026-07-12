# Xygo Repository Rules

## Engineering

- Default to staged mode.
- Do not add live provider credentials.
- Do not add outbound write operations to external systems.
- Do not bypass server-side authorization requirements.
- Default to deny for permission decisions.
- Every sensitive change must include tests and audit implications.

## Documentation

- External provider behavior must be sourced from official documentation.
- Add official references to `docs/research/source-ledger.md`.
- Record architecture changes as ADRs before changing shared contracts.

## Security

- Tenant isolation must be enforced server-side, not only in UI code.
- Restricted content must not leak through search, notifications, or summaries.
- Staged-mode policy must fail closed when configuration is missing.
