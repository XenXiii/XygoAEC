# Phase 0 Test Strategy

## Included now

- unit tests for staged-mode enforcement
- unit tests for violation logging behavior
- unit tests for production-hostname rejection
- unit tests for outbound write rejection

## Deferred to later phases

- DB constraint tests
- authorization matrix tests
- E2E workflows
- search leakage tests
- audit-chain verification command tests
- adapter contract tests

## Acceptance standard for Phase 0

- all staged-mode tests pass locally
- no test requires network access
- no test uses live credentials or third-party systems
