# Domain Map

## Canonical Bounded Contexts

### Identity and Organization

Owns:
- tenant
- business unit
- department
- team
- membership
- organization roles
- authentication abstraction

### Authorization and Visibility

Owns:
- RBAC / ABAC rules
- visibility classes
- restricted access policy evaluation
- field-level protection rules

### Communication

Owns:
- direct messages
- channels
- threads
- mentions
- reactions
- read state
- announcement publishing

### Projects and AEC Operations

Owns:
- projects
- participants
- discipline packages
- lifecycle state machine
- approvals and review gates

### Documents and File Registry

Owns:
- file records
- revisions
- integrity hashes
- check-in / check-out
- staged upload validation
- preview orchestration

### Drawings and Models

Owns:
- drawing sheets
- BIM models
- derivative artifacts
- metadata extraction records
- model element references

### Coordination, RFIs, Permits, and Field

Owns:
- coordination issues
- RFIs
- permit packages and cycles
- field issues
- bulletins

### AI Review

Owns:
- review runs
- deterministic rule outputs
- model inferences
- evidence assembly
- confidence and severity models

### Integrations

Owns:
- provider interfaces
- staged adapters
- transfer packages
- simulated statuses
- outbound allowlist enforcement

### Audit and Observability

Owns:
- append-only audit events
- tamper-evident hash chain
- trace IDs
- staged-policy violation logging

### Notifications and Dashboards

Owns:
- in-product notifications
- delivery preferences
- dashboard projections
- executive and supervisor summaries

## Dependency Direction

```text
Identity -> Authorization
Authorization -> All domain actions
Projects -> Communication, Documents, Drawings/Models, Coordination
Documents -> Drawings/Models, AI Review, Integrations
Drawings/Models -> Coordination, AI Review
Projects + Approvals -> Finance/Legal integration hooks
All domains -> Audit/Observability
All domains -> Notifications/Dashboards projections
Integrations <- domain events via outbox
```

## Invariants

- Tenant boundary is mandatory on every tenant-owned record.
- Audit events are append-only.
- Live provider access is blocked in staged mode.
- AI findings remain recommendations until human disposition.
