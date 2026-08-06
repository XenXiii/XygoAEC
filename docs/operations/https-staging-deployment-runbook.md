# HTTPS staging deployment and smoke-test runbook

## Safety contract

This runbook prepares a release; it does not authorize a deployment. Keep credentials in the approved
secret manager and inject them only into the API, worker, or web server that needs them. The public web
bundle, manifest, service worker, source maps, and `/runtime-config.json` may contain only the runtime
allowlist documented in the production environment gate. Never place a bearer token in a URL, log,
checked-in file, shell history, or CI artifact.

## Platform setup

1. Provision distinct staging web and API DNS names. Point them to the intended ingress and wait for
   public DNS convergence before release. Obtain certificates covering the exact names; accept TLS 1.2
   or 1.3 only, redirect HTTP to HTTPS, set HSTS to at least one day, and preserve the original protocol
   as `X-Forwarded-Proto: https` to the application. Do not enable HSTS `includeSubDomains` until every
   affected subdomain is HTTPS-capable.
2. Configure the ingress/CDN to bypass caching for `/auth/*`, `/v1/*`, `/uploads/*`, `/files/*`,
   `/runtime-config.json`, responses carrying `Set-Cookie`, requests carrying `Cookie` or
   `Authorization`, and all responses marked `private` or `no-store`. Revalidate HTML, the manifest, and
   the service worker. Strip or redact `Authorization`, `Cookie`, `Set-Cookie`, and query strings from
   ingress, CDN, application, tracing, and error logs. Do not use session affinity: encrypted sessions
   are shared in PostgreSQL and the cookie is only a signed opaque handle.
3. Register the exact IdP callback `https://WEB_HOST/auth/callback` and post-logout URL
   `https://WEB_HOST/`. Register no HTTP, wildcard, preview, or localhost redirect for the staging
   client. Keep the client public with Authorization Code + PKCE; no client secret belongs in the web
   runtime or browser bundle.
4. Create the PostgreSQL databases or roles through the platform secret manager. Require certificate
   validation (`sslmode=verify-full`), least privilege, backups, and network restrictions. Provide
   independent high-entropy session signing and encryption secrets. Keep `XYGO_WEB_SESSION_STORE=postgres`,
   the `__Host-` secure/HTTP-only/Lax cookie, refresh-token requirement, bounded token tolerance, and the
   exact HTTPS allowed origin from the production contract.

## Preflight and migration gate

Start with `config/production.env.example` and `config/staging-deployment.env.example`, replacing every
placeholder outside the repository. The same immutable commit identifier must be supplied as
`XYGO_RELEASE` and `XYGO_STAGING_EXPECTED_RELEASE`.

Run the fail-closed configuration/repository gate in each release environment before starting services:

```sh
npm run check:staging
```

It reuses the production API, web/auth, and worker validators and rejects HTTP/reserved hosts, placeholder IdP data,
in-memory sessions, weak secrets, insecure cookies, non-validating PostgreSQL URLs, unsafe token
tolerance, mismatched callback/logout URLs, weak TLS/HSTS declarations, missing log redaction, CDN caching
of authenticated responses, unsafe Vercel headers, unsafe service-worker boundaries, and missing auth
migrations. Its output contains origins and the release ID only; it never prints secrets.

Apply migrations once from an approved migration job, then check connectivity and schema state from each
service network:

```sh
npm run migrate:postgres
npm run check:postgres
npm run check:outbox
```

Do not start traffic until migration `0008_web_auth_sessions` and all earlier migrations are current.
The API `/ready` response must remain 503 until PostgreSQL, storage, outbox, email delivery, and worker
health satisfy their configured gates.

## Automated remote smoke checks

After an operator has deployed the immutable artifact, run public checks from outside the hosting network:

```sh
XYGO_STAGING_BASE_URL=https://WEB_HOST \
XYGO_STAGING_EXPECTED_RELEASE=IMMUTABLE_RELEASE \
npm run smoke:staging
```

The command resolves DNS and checks HTTPS/HSTS, the deployed release, public-only no-store runtime config,
API/PostgreSQL/outbox readiness, shell cache headers, anonymous/expired session behavior, HTTPS IdP redirect,
exact callback, PKCE/state/nonce and secure transaction cookie, rejected callback, SSE session-backed URL
hygiene, origin-bound renewal/logout, PWA manifest, service-worker private-data boundaries, and the safe
offline page. Any mismatch exits nonzero.

For cross-tenant API validation, obtain a short-lived staging access token through the normal IdP flow and
inject it as a masked, ephemeral environment variable in an isolated runner. Disable shell tracing and
delete the variable immediately afterward:

```sh
XYGO_STAGING_BASE_URL=https://WEB_HOST \
XYGO_STAGING_EXPECTED_RELEASE=IMMUTABLE_RELEASE \
XYGO_STAGING_SMOKE_TENANT_ID=ALLOWED_TENANT \
XYGO_STAGING_SMOKE_DENIED_TENANT_ID=DENIED_TENANT \
XYGO_STAGING_SMOKE_ACCESS_TOKEN=MASKED_EPHEMERAL_VALUE \
npm run smoke:staging
```

The allowed request must return 200/no-store and the same identity against the denied tenant must return
403. The script never prints the token. Omit all three optional values to run the public suite without a
credential; the result explicitly reports the tenant check as skipped.

## Browser authentication, offline, and update matrix

Use a clean browser profile and retain screenshots or redacted test evidence:

1. Open `/workspace`; confirm loading becomes signed-out and the URL contains no bearer/access token.
   Sign in, inspect the callback, and confirm it exchanges a one-time code, removes callback parameters,
   creates only a secure opaque session cookie, and shows the authorized tenant.
2. Let the access token enter its renewal window. Confirm `POST /auth/session/renew` succeeds through the
   same PostgreSQL session after restarting one web process and that neither refresh nor access tokens
   appear in browser storage, URLs, logs, traces, or error reports. Confirm `/auth/events/stream` uses the
   session cookie and its URL contains only the tenant ID.
3. Expire or revoke the server session. Confirm session and renewal return 401/no-store, the expired UI
   hides prior tenant data, and sign-in restores a new session. Log out and confirm the PostgreSQL session
   is invalidated, the cookie is cleared, IdP logout returns only to the registered HTTPS application root, and
   replaying the old cookie fails.
4. Verify a user bound to one tenant receives 403 and the tenant-denied UI for another tenant. Search CDN,
   ingress, application, monitoring, and browser network exports for the test token, cookies, callback
   code, `access_token=`, and `refresh_token`; any occurrence fails release.
5. Install from `/workspace`. With DevTools Cache Storage open, confirm only versioned public shell assets
   exist. Go offline: navigation may show `offline.html`, but tenant reports, files, portal data, auth,
   runtime config, and operational API data must be unavailable. Return online and confirm fresh network
   requests. Publish a test shell build with an incremented `CACHE_VERSION`, accept its update prompt, and
   confirm old `xygo-shell-*` caches are removed without automatic activation.

## Rollback and pass/fail signals

Keep the previous immutable web/API/worker artifacts and database compatibility notes. On a failed smoke,
stop promotion, preserve redacted evidence, and route traffic back to the prior artifact. Publish a newly
versioned service worker with the rollback—never reuse the failed cache name—then rerun the public smoke
with the prior release ID and repeat login, tenant, offline, and update checks. Database rollback requires
an explicitly reviewed forward-fix or compatible migration plan; never reverse a migration ad hoc.

A release passes only when preflight is green, migrations are current, `/ready` is 200 for the exact
release, public and credential-assisted smoke checks pass, browser lifecycle checks pass across a process
restart, caches contain no private URLs or bodies, logs contain no auth material, and rollback is proven.
DNS/certificate provisioning, external secrets, IdP registration, staging PostgreSQL, deployment, and the
credential-assisted/browser checks remain operator actions outside this repository.
