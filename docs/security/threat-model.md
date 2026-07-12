# Threat Model

Primary threat areas:

- tenant data leakage
- restricted search leakage
- unauthorized lifecycle transitions
- file upload abuse
- staged adapter bypass
- audit-chain tampering
- prompt injection through uploaded sources
- AI overclaiming without evidence

Current mitigations in code:
- staged-mode fail closed
- tenant/project scope checks
- default-deny authorization
- audit hash chain
- disabled live provider writes
- cautious AI finding language
