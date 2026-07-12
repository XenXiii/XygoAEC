# Phase 2 Communication Security

## Current controls

- server-side tenant check before read/search/send
- default-deny authorization remains in force
- private channels require explicit membership
- restricted channels require explicit membership
- project channels require project scope
- search does not return inaccessible messages
- audit event emitted on send
- outbox event emitted on send

## Known gaps

- no persistent read model yet
- no rate limiting yet
- no message retention policy implementation yet
- no attachment malware scanning yet
- no legal privilege exception model yet
