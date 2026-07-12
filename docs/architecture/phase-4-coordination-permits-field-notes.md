# Phase 4 Coordination, Permits, and Field Notes

Included in this increment:
- coordination issue model
- BCF-compatible topic record
- RFI model
- approval request model
- permit package lifecycle model
- field/construction item model
- audit/outbox emission helpers
- synthetic staged fixtures for issues, permit packages, and field items

Security posture:
- tenant scope required
- project scope required
- permit transitions reject incomplete forms and missing submission packages
- field items require explicit resolution before resolving
- coordination and approval events emit audit and outbox records

Deferred:
- full issue workflow UI
- permit response matrix automation
- construction bulletin/change notice specializations
- threaded issue conversations
- cross-package approval quorum logic
