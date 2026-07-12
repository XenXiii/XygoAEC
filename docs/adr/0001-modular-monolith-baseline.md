# ADR 0001: Modular Monolith Baseline for Phase 0

Status: accepted
Date: 2026-07-11

## Context

Xygo needs:
- strong tenant isolation
- auditable domain boundaries
- staged-only external adapters
- real-time collaboration
- future extraction boundaries for provider and AI pipelines

The repository is empty, and Phase 0 requires a low-complexity starting point that still preserves eventual scale.

## Options Considered

### Option A: Modular monolith with asynchronous workers

Characteristics:
- one primary backend deployment unit at the start
- bounded contexts in separate packages/modules
- asynchronous worker processes for file, AI, and notification jobs
- outbox-driven integration boundaries

Pros:
- lowest operational complexity
- faster delivery for Section 0 and early platform sections
- easier transaction consistency
- simpler local staged environment
- cleaner early enforcement of audit, authorization, and staged-mode policy

Cons:
- requires discipline to preserve module boundaries
- some future extractions will need planned seams

### Option B: Early service-oriented architecture

Characteristics:
- multiple backend services from the beginning
- separate deployments for communication, projects, documents, AI, and integrations

Pros:
- clearer service ownership
- independent scaling paths

Cons:
- too much operational overhead for current phase
- more infrastructure and CI burden before core workflows exist
- harder local staged development
- more risk of duplicated policies and inconsistent authorization

## Decision

Adopt `Option A`: a modular monolith plus asynchronous workers.

Initial shape:
- `apps/api` as the primary application surface
- `apps/worker` for file-processing, AI-review, and notification jobs
- domain packages under `packages/*`
- provider adapters behind interfaces and staged kill switches

## Consequences

- Shared contracts must remain explicit to prevent accidental tight coupling.
- Sensitive cross-cutting concerns such as authorization, audit, staged-mode policy, and tenant scoping must be centralized.
- Future service extraction remains possible when evidence justifies it.
