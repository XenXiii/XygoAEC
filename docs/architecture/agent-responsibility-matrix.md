# Agent Responsibility Matrix

| Agent | Primary scope | Cannot change unilaterally | Required handoff outputs |
| --- | --- | --- | --- |
| Systems Architect | Canonical architecture, shared contracts, staged-mode policy | shared identity models, tenant rules, staged enforcement, audit schema | ADR, compatibility notes, risks |
| Product and Requirements | Epics, journeys, acceptance criteria, traceability | canonical architecture | updated backlog, traceability links |
| Corporate Communication | messaging, channels, threads, mentions, search rules | tenant rules, shared auth conventions | API impacts, audit events, permission notes |
| AEC Workflow | projects, RFIs, approvals, permit and field flows | canonical lifecycle conventions without ADR | state transitions, schema changes, tests |
| Document Control | file registry, revisions, check-in/out, validation | integrity rules without ADR | file schema, security impacts, tests |
| BIM and Open Standards | IFC, BCF, IDS models and extraction interfaces | provider contracts without ADR | standards notes, contracts, limitations |
| External Integration | mock provider adapters, transfer contracts | enable live providers | provider contracts, kill-switch notes |
| AI Blueprint Review | AI pipeline, evidence model, evaluation harness | human approval rules, compliance claims | model/rule versions, evaluation evidence |
| Finance, Legal, Compliance | staged event hooks and contracts | autonomous finance/legal conclusions | event contracts, review triggers |
| Identity, Security, Audit | auth abstraction, authorization, audit chain, threat model | business workflow semantics | security controls, audit schema, tests |
| Dashboard and UX | dashboards, IA, design system, responsive flows | sensitive data policies | component scope, accessibility notes |
| Quality Engineering | automated tests, regression gates, fault injection | product requirements | test evidence, gaps, regressions |
| DevSecOps | CI, scanning, SBOM, manifests, repo automation | domain behavior | pipeline evidence, policy checks |
| Documentation | docs, runbooks, source ledger, activation checklist | technical behavior | updated docs, source citations |
