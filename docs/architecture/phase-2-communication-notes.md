# Phase 2 Communication Notes

Included in this increment:
- channel model
- channel membership model
- direct and project-channel access checks
- message model and revision helper
- mention parsing
- staged attachment references
- notification preference model
- search filtering with access-aware results
- read-state record helper
- audit and outbox emission on send

Security posture:
- tenant match required
- private membership required
- restricted channels require membership
- project channels require project scope
- search returns only messages from accessible channels

Deferred:
- persistent storage
- HTTP APIs and WebSocket streams
- full-text indexing backend
- attachment virus scanning and file registry integration
- message reactions and saved messages
