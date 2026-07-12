# Phase 3 Document Control Security

## Current controls

- staged and tenant-scoped file records only
- project scope required for validation and checkout helpers
- upload type allowlist
- staged size limit enforcement
- immutable-history protection for approved historical files
- sheet collision detection by project, number, and revision
- lifecycle transitions enforce sequence and artifact prerequisites

## Known gaps

- no real object storage adapter yet
- no malware scanner integration yet
- no signed URL generation yet
- no persistent lock/check-out coordination yet
- no field-level redaction layer on file metadata yet
