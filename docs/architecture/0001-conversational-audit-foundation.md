# ADR 0001: Incremental conversational-audit foundation

Status: accepted for the foundation slice.

The existing Node/Vercel public site and APIs remain in place. Framework migration is deferred so current routes, SEO, privacy, contact, and checkout behavior remain stable. Domain logic lives in workspace packages and is shared by server clients; clients only project state.

The first slice adds a strict audit state machine, structured copilot-output boundary, canvas projection, server-oriented entitlement policy, accessible web workspace, and Expo mobile scaffold. Authentication, persistence, streaming transport, provider integrations, signed Stripe webhooks, and production mobile binaries are later milestones and must not be represented as complete.

Security decisions: workspace identity is supplied by trusted server session context, never a client header; unknown model fields and cross-workspace facts are rejected; consequential tools require allowlisting, approval, and idempotency; free/paid access is decided at the domain/API boundary; mobile billing uses an external account handoff pending platform-policy review.
