# Xygo AEC Corporate Cloud OS

Status: staged architecture brief
Mode: non-production only

## 1. System Architecture Document

### Product Positioning

This platform is a unified internal operating system for corporations that need secure communication, project execution, supervision, and finance/legal/compliance coordination in one place.

The UX goal is not "another chat app." It should feel like:
- a command center for work
- a traceable operating surface for approvals
- a structured collaboration layer with strong visibility boundaries

### Experience Principles

- Quietly powerful: high-density information without visual clutter
- Oversight by design: executives, finance, and legal can see what they should see without drowning in noise
- Context over tabs: project, discussion, tasks, approvals, files, and audit history stay linked
- Secure by default: restricted details stay restricted; summary visibility is intentional
- Staged realism: mock traffic, mock users, and mock finance events must behave like a believable enterprise environment

### Recommended Staged Stack

- Frontend: `Next.js` with TypeScript
- UI system: tokenized design system with responsive workspace layouts
- Backend gateway: `Node.js` + `Fastify`
- Realtime messaging: WebSocket gateway with staged event streams
- Services:
  - identity service
  - communication service
  - project service
  - approval service
  - audit service
  - notification service
  - reporting service
  - integration service
- Database: `Postgres`
- Realtime cache / queue: `Redis`
- Search: `OpenSearch` or staged full-text index
- Object storage: staged `S3/R2` bucket for attachments
- Observability: `Sentry`, structured logs, audit event store
- Auth in staged mode: local mock identity provider, SSO-ready abstraction

### Service Topology

```text
[ Web App ]
    |
    v
[ API Gateway / BFF ]
    |
    +--> Identity Service
    +--> Communication Service
    +--> Project Service
    +--> Approval Service
    +--> Notification Service
    +--> Reporting Service
    +--> Audit Service
    +--> Integration Service
    |
    +--> Realtime Gateway

Shared Infrastructure:
- Postgres
- Redis
- Search index
- Object storage
- Audit event ledger
```

### Primary Product Surfaces

- Company home dashboard
- Inbox and direct messages
- Channel workspace
- Project workspace
- Approval center
- Supervisor console
- Finance/compliance review console
- Executive overview dashboard
- Search and archive center

## 2. Module Map

### A. Identity and Access Management

- company accounts
- business entities
- departments
- teams
- users
- role-based access control
- visibility policies
- session and auth abstraction
- staged SSO/MFA readiness

### B. Communication System

- direct messages
- team channels
- department channels
- cross-team channels
- project channels
- executive channels
- finance-only channels
- legal-only channels
- announcements
- threads
- mentions
- searchable archive
- staged file attachments

### C. Project Operations System

- project creation
- ownership and assignment
- tasks and milestones
- budget linkage
- entity linkage
- risk tagging
- project documents
- approval checkpoints
- escalation routing
- status tracking

### D. Visibility and Policy Engine

- private visibility
- restricted visibility
- executive oversight visibility
- company-public summary visibility
- cross-team collaboration visibility
- field-level redaction policies

### E. Supervision and Approval Layer

- supervisor queue
- finance review queue
- legal review queue
- controller/CFO escalation
- exception routing
- audit timeline
- tamper-evident activity ledger

### F. Finance / Compliance Integration Layer

- staged budget sync
- entity mapping
- spending request routing
- anomaly flag routing
- legal/tax/compliance event linkage
- shared audit correlation

### G. Reporting and Dashboard Layer

- company-wide activity summary
- project health
- approval bottlenecks
- risk heatmap
- legal/compliance alerts
- finance alerts
- entity rollups
- executive summary

## 3. Database Schema Draft

### Core Organizational Tables

```text
companies
- id
- name
- slug
- status
- created_at

entities
- id
- company_id
- name
- entity_type
- jurisdiction
- finance_profile_id

departments
- id
- company_id
- name
- code

teams
- id
- department_id
- name
- visibility_default

users
- id
- company_id
- email
- display_name
- status
- identity_provider_ref

user_roles
- id
- user_id
- role_key
- scope_type
- scope_id
```

### Communication Tables

```text
channels
- id
- company_id
- name
- channel_type
- visibility_class
- entity_id nullable
- department_id nullable
- team_id nullable
- project_id nullable
- created_by
- created_at

channel_members
- id
- channel_id
- user_id
- membership_role
- joined_at

messages
- id
- channel_id
- sender_user_id
- thread_root_id nullable
- body
- body_format
- visibility_snapshot
- created_at
- edited_at nullable

message_attachments
- id
- message_id
- file_id
- access_policy_id
```

### Project Tables

```text
projects
- id
- company_id
- entity_id
- name
- code
- summary
- visibility_class
- owner_user_id
- department_id
- team_id
- budget_amount
- budget_currency
- status
- risk_level
- created_at

project_members
- id
- project_id
- user_id
- project_role

tasks
- id
- project_id
- title
- description
- assignee_user_id
- status
- priority
- due_date
- milestone_id nullable

milestones
- id
- project_id
- title
- target_date
- status

project_documents
- id
- project_id
- file_id
- document_type
- visibility_class
```

### Approval / Finance / Compliance Tables

```text
approval_requests
- id
- project_id
- source_type
- source_id
- approval_type
- requested_by
- current_status
- priority
- created_at

approval_steps
- id
- approval_request_id
- sequence_no
- reviewer_role
- reviewer_user_id nullable
- decision
- decided_at nullable

budget_links
- id
- project_id
- external_budget_ref
- staged_finance_status

compliance_events
- id
- project_id
- event_type
- severity
- routed_to
- status
- created_at

audit_events
- id
- company_id
- actor_user_id nullable
- object_type
- object_id
- action_key
- event_payload
- hash_prev
- hash_self
- created_at
```

### Reporting / Notification Tables

```text
notifications
- id
- user_id
- notification_type
- object_type
- object_id
- read_at nullable
- created_at

dashboard_snapshots
- id
- company_id
- snapshot_type
- snapshot_payload
- created_at
```

## 4. RBAC / Permissions Matrix

```text
Role                  DM  Channel  Project View  Restricted Detail  Approval  Budget View  Legal View  Audit View  Admin
Employee              Y   Y        Scoped        N                  N         N            N           Limited     N
Team Lead             Y   Y        Team/Project  Limited            Y         Limited      N           Scoped      N
Department Head       Y   Y        Department    Limited            Y         Summary      N           Scoped      N
Project Owner         Y   Y        Project Full  If assigned        Y         Project      N           Project     N
Supervisor            Y   Y        Cross-Scope   Summary/Exception  Y         Summary      Summary     Broad       N
Finance Reviewer      Y   Finance  Budget Scope  Finance-needed     Y         Full         N           Broad       N
Legal Reviewer        Y   Legal    Legal Scope   Legal-needed       Y         N            Full        Broad       N
Controller / CFO      Y   Y        Broad         Summary/Exception  Y         Full         Summary     Broad       N
Executive             Y   Exec     Company Wide  Summary by default Y         Summary      Summary     Broad       N
System Admin          Y   Y        Broad         Broad              Y         Broad        Broad       Broad       Y
```

Permission model notes:
- Access is both role-based and scope-based.
- Sensitive detail should be filtered at query time and again at response serialization time.
- Executive oversight does not imply full unrestricted raw content access by default.
- Finance and legal see data tied to their review responsibilities, not all communication universally.

## 5. Channel Visibility Rules

### Visibility Classes

- `private`
  - only explicit members can view channel existence and content
- `restricted`
  - channel existence may be hidden or minimally visible; content restricted to authorized roles/members
- `executive_oversight`
  - primary membership is limited, but summary and exception visibility is available to designated executive roles
- `company_public`
  - visible in company directory and summary feeds; content may still use attachment/document restrictions
- `cross_team_collaboration`
  - visible to invited teams and designated collaborating departments

### Rules

- Direct messages are always `private`
- Finance channels default to `restricted`
- Legal channels default to `restricted`
- Executive channels default to `executive_oversight`
- Company announcement channels default to `company_public`
- Project channels inherit project visibility unless overridden by stricter policy
- Company-public projects expose summary cards, milestones, owners, and high-level status only
- Restricted projects hide tasks, attachments, approval detail, budget detail, and sensitive comments unless authorized

## 6. Project Lifecycle Design

### Lifecycle States

```text
draft
intake
assigned
active
awaiting_approval
finance_review
legal_review
blocked
escalated
completed
archived
```

### Flow

1. Project is created in `draft`
2. Owner, entity, visibility, and budget fields are set
3. Project moves to `intake`
4. Team and department assignments are applied
5. Required checkpoints move it to `assigned` then `active`
6. Budget or risk triggers can create `approval_requests`
7. Finance or legal rules can route it into review states
8. Exceptions can move it to `blocked` or `escalated`
9. Approved work returns to `active`
10. Finished work moves to `completed` and later `archived`

### Approval Triggers

- budget threshold crossed
- high-risk tag applied
- restricted entity assignment
- legal-sensitive document attached
- anomalous activity or unusual spending request

## 7. Finance Integration Map

The finance/legal/safe-AI workflow remains external but connected through staged adapters.

### Integration Objects

- project -> budget reference
- project -> entity reference
- spend request -> approval policy
- compliance event -> legal/finance queue
- audit event -> shared correlation ID

### Integration Services

- `integration_service`
  - exposes mock finance endpoints
  - simulates budget sync responses
  - simulates compliance flags
  - simulates anomaly detections

### Example Flow

1. Project owner submits spending request
2. Project service emits event
3. Approval service checks policy
4. Integration service queries staged finance rules
5. Finance review queue is populated if threshold/risk policy is hit
6. Audit service writes correlated ledger entries
7. Reporting service updates bottleneck and risk dashboards

## 8. Dashboard Specification

### Company Dashboard

- active project count
- blocked project count
- approvals waiting
- top entity activity
- company-public project summaries
- alert rail for legal/finance exceptions

### Team Activity Dashboard

- team project load
- message volume trends
- open tasks
- overdue milestones
- cross-team collaboration map

### Project Workspace Dashboard

- project health
- milestone progress
- risk tags
- linked approvals
- budget summary
- recent channel activity
- audit timeline preview

### Supervisor Console

- exceptions needing review
- stalled approvals
- blocked projects
- access anomalies
- top risk projects

### Finance Risk Dashboard

- budget-linked projects
- pending spend approvals
- anomaly flags
- entity exposure summary
- high-risk project heatmap

### Legal / Compliance Dashboard

- legal review queue
- compliance event queue
- policy exceptions
- sensitive document actions
- audit trail drill-down

### Executive Overview

- company-wide status
- strategic project rollup
- high-level financial risk signals
- org bottlenecks
- summary-only oversight for restricted work

## 9. Staged Deployment Report

### Deployment Posture

- internal-only staged environment
- seeded mock companies, departments, teams, projects, channels, and audit events
- no public signups
- no live messaging federation
- no real finance APIs
- no real email or SMS delivery

### Recommended Environments

- `local`
  - single-developer environment
  - seeded fixtures
- `staging-shared`
  - internal preview environment
  - synthetic traffic
  - mock auth and finance connectors
- `qa-sim`
  - synthetic load
  - workflow replay
  - permission regression testing

### Staged Data Strategy

- fake corporate entities
- fake users and role maps
- fake projects and budgets
- fake approval histories
- fake anomaly and compliance events
- fake attachment files with safe placeholder content

### Non-Production Controls

- network egress restrictions for provider adapters
- hard-disabled production credentials path
- explicit environment banner in UI
- synthetic watermarking in exports and files
- no production domains

## 10. Future Go-Live Checklist

- [ ] Replace mock identity with approved SSO provider
- [ ] Enable production MFA enforcement
- [ ] Complete security review and penetration test
- [ ] Complete privacy and data retention review
- [ ] Finalize finance integration contracts
- [ ] Finalize legal/compliance review rules
- [ ] Validate audit immutability approach
- [ ] Approve incident response and access review policies
- [ ] Replace mock notification providers with approved internal comms providers
- [ ] Perform role and visibility boundary verification with real org data
- [ ] Complete load and reliability testing
- [ ] Complete backup and recovery verification
- [ ] Complete executive signoff
- [ ] Complete controller/CFO signoff
- [ ] Complete legal signoff
- [ ] Complete final launch approval

## End State Required

The phase-one end state is a complete staged architecture package that can be handed off to implementation without ambiguity:
- clear service boundaries
- clear permission and visibility model
- clear schema draft
- clear integration map
- clear dashboard requirements
- clear staged deployment posture
- clear go-live gate list
