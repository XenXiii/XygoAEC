# Xygo production threat model

## Protected assets and trust boundaries

Protected assets are OIDC sessions, workspace membership, encrypted audit content, source tokens, Stripe entitlement state, and audit signing keys. Trust boundaries exist at the browser/mobile client, API edge, OIDC issuer, PostgreSQL connection, model provider, integration providers, Stripe webhook, and operations console.

## Required controls

- Identity is accepted only after JWT issuer, audience, signature, expiry, and JWKS checks. Workspace and role come from server-side membership records, never token tenant claims or request headers.
- Production boot requires PostgreSQL. Sensitive content is AES-256-GCM encrypted before persistence; lookup values use a separate keyed HMAC. Secrets must be independently generated and rotated.
- Every workspace query includes workspace scope. Cross-workspace API tests are mandatory before release. Database RLS is defense-in-depth and must be enabled by the production DBA.
- Copilot structured output is schema validated. Prompt injection is rejected and model text cannot directly execute a tool. Consequential tools require explicit approval and idempotency.
- Stripe entitlement changes only after raw-body signature verification and idempotent event storage. Redirects never grant access. Test and live keys are statically separated.
- Integration scopes are read-only and least privilege. Tokens are server-side encrypted. Expired, revoked, or scope-incomplete connections cannot sync; disconnect must revoke and delete tokens.
- Request size, timeout, rate limiting, structured errors, security headers, logging redaction, health/readiness, and graceful shutdown remain enabled.

## Residual risks and gates

- A live penetration test, Auth0 tenant review, Stripe live-mode webhook exercise, PostgreSQL RLS review, and mobile store-policy review remain required before production authorization.
- Current Expo tooling includes moderate transitive advisories through build-time `xcode`/`uuid`. There are no high or critical findings. Track the upstream patched Expo release; do not use `npm audit fix --force` without compatibility testing.
- Provider availability and model degradation require monitored retries, circuit breaking, and a user-visible partial-result state.

## Abuse cases reviewed

Cross-tenant identifiers, forged JWT claims, replayed checkout events, malicious CSV content, prompt injection, SSRF-style provider URLs, oversized bodies, brute-force requests, stale mobile tokens, offline replay of privileged actions, secret logging, and accidental test-key production deployment.
