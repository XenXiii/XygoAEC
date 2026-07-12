# Requirements Traceability Matrix

| Requirement ID | Requirement summary | Primary domain | Planned phase | Evidence target |
| --- | --- | --- | --- | --- |
| XYGO-001 | Staged mode must fail closed and block production access | Security / Integrations | Phase 0 | policy module, tests, docs |
| XYGO-002 | Multi-tenant company hierarchy with enforced isolation | Identity / Authorization | Phase 1 | schema, auth middleware, leakage tests |
| XYGO-003 | RBAC + ABAC + visibility classes | Authorization | Phase 1 | permission matrix, policy tests |
| XYGO-004 | Corporate messaging with channels and DMs | Communication | Phase 2 | APIs, UI, audit, E2E |
| XYGO-005 | Threads, mentions, attachments, notifications, search | Communication / Documents | Phase 2 | contract tests, search leakage tests |
| XYGO-006 | AEC project workspaces and discipline packages | Projects | Phase 3 | project flows, seeded demos |
| XYGO-007 | File registry, revisions, integrity, secure uploads | Documents | Phase 3 | validation tests, audit chain, fixtures |
| XYGO-008 | 2D drawing registry and sheet indexing | Drawings | Phase 3 | schema, parsing pipeline, fixtures |
| XYGO-009 | 3D BIM registry and metadata extraction | Models | Phase 3 | model contracts, fixtures, tests |
| XYGO-010 | OpenBIM support for IFC, BCF, IDS concepts | BIM Standards | Phase 4 | standards-backed contracts |
| XYGO-011 | Coordination issues, RFIs, approvals, permit flows | Coordination / Permits | Phase 4 | state machine, E2E |
| XYGO-012 | AI review with evidence, confidence, limitations | AI Review | Phase 5 | evaluation harness, finding schema |
| XYGO-013 | Mock staged adapters for Autodesk/Procore/Trimble/Microsoft | Integrations | Phase 6 | contract tests, no-live safeguards |
| XYGO-014 | Finance/legal/compliance event hooks only | Finance Contracts | Phase 7 | event contracts, outbox tests |
| XYGO-015 | Role-specific dashboards and executive summaries | Dashboards | Phase 7 | responsive UI, permission tests |
| XYGO-016 | Audit-chain verification and hardening | Audit / Security | Phase 8 | verification command, tests |
| XYGO-017 | Accessibility at WCAG 2.2 AA target | UX / QE | Every phase | accessibility tests and reviews |
| XYGO-018 | Official-docs-only policy for external integrations | Documentation / Integrations | Every phase | source ledger updates |
