# Authenticated web login operations

## Proven scope

The web process now implements a provider-neutral Authorization Code + PKCE login broker at
`/auth/login`, a callback at `/auth/callback`, session retrieval at `/auth/session`, refresh-token
renewal at `/auth/session/renew`, and logout at `/auth/logout`. No live identity-provider tenant,
client, credentials, redirect registration, DNS, HTTPS ingress, or deployment is included.

The browser receives only the short-lived access token in memory. Refresh tokens remain in the encrypted
PostgreSQL session store and never appear in `/runtime-config.json`, HTML, local storage, session storage,
or cookies. Login transactions and user sessions are encrypted with AES-256-GCM; database lookup keys
are HMAC-derived rather than raw browser handles. The cookie contains only a signed opaque session id and uses the `__Host-` prefix, Secure,
HttpOnly, Path=/, and SameSite=Lax. Lax is required so the authorization-server navigation can return
the signed, short-lived PKCE transaction cookie to the callback.

The web broker does not authorize tenants. Browser API calls carry the access token as a Bearer token;
the API still verifies its signature, issuer, audience, timestamps, and algorithm, resolves issuer and
subject through canonical PostgreSQL identity bindings, and applies the existing tenant/RBAC policy.
Self-asserted staged tenant headers do not grant access in OIDC mode.

## Staging configuration and registration

1. Create a public OIDC client with Authorization Code and PKCE S256 enabled. Do not create or inject
   a browser client secret.
2. Register the exact callback `https://<staging-app>/auth/callback` and the exact post-logout URI
   `https://<staging-app>/`. Wildcards, HTTP, loopback, query-bearing, and fragment-bearing redirect
   values are forbidden.
3. Configure the approved HTTPS issuer, audience, authorization, token, logout, and JWKS values. Replace
   every example placeholder through the secret/config manager.
4. Store independent `XYGO_WEB_SESSION_SECRET` and `XYGO_WEB_SESSION_ENCRYPTION_KEY` values only in
   the web process secret manager. Use at least 32 random characters for each. A signing-secret rotation
   invalidates browser handles; encryption-key rotation requires a reviewed re-encryption or session purge.
5. Set `XYGO_WEB_SESSION_STORE=postgres` and a TLS-protected `XYGO_WEB_SESSION_PG_URL`. Apply migration
   `0008_web_auth_sessions` before web rollout. Grant the web role only SELECT/INSERT/UPDATE/DELETE on
   `web_auth_sessions`; it must not own or migrate the schema.
6. Set the cookie controls to `__Host-xygo-session`, Secure=true, HttpOnly=true, SameSite=lax. Set
   `XYGO_WEB_ALLOWED_ORIGIN` to the exact application origin and require refresh tokens.
7. Configure bounded login transaction, idle session, absolute session, token request timeout, renewal
   lead time, and clock tolerance values from `config/production.env.example`.

## Smoke and release checks

1. Confirm production-mode web startup fails with placeholders, HTTP endpoints, a mismatched origin,
   weak signing/encryption secrets, a non-PostgreSQL session backend, an insecure PostgreSQL URL,
   non-`__Host-` cookie, disabled cookie protections, excessive clock tolerance,
   or refresh-token support disabled.
2. Confirm `/runtime-config.json` contains only public endpoints, client id, scopes, PKCE mode, relative
   auth routes, and renewal lead time. Search it for every private sentinel and session secret.
3. Start a login and inspect the redirect for state, nonce, S256 challenge, exact client id, callback,
   audience, and scopes. Confirm the transaction cookie is Secure, HttpOnly, SameSite=Lax, and short-lived.
4. Complete one approved staging login. Confirm the session cookie contains no token and `/auth/session`
   returns an access token with `Cache-Control: no-store` only to the same-origin browser.
5. Exercise renewal before expiry and after one API 401. Confirm refresh-token rotation stays server-side,
   concurrent browser renewal collapses to one request, and failure returns to sign-in without weakening API checks.
6. Restart or replace the web process after login and confirm the signed cookie still resolves the
   encrypted PostgreSQL session and can renew. Confirm logout deletes the row across all instances.
7. Open the live event stream and confirm the browser URL is only `/auth/events/stream?tenantId=...`.
   Confirm neither browser, ingress, web, nor API access logs contain `access_token`, Authorization values,
   cookies, authorization codes, state, nonce, PKCE verifiers, or refresh tokens.
8. Test mismatched/expired state, reused callback, disallowed Origin on renewal/logout, expired idle and
   absolute sessions, logout, token expiry/tolerance boundaries, and a cross-tenant API request.

## Persistence, cleanup, scaling, and recovery

All web instances use shared PostgreSQL sessions, so restart/redeploy and horizontal scaling require no session affinity.
Reads reject and delete an expired requested session. New login starts also prune all rows past
their idle or absolute expiry. Operators should additionally schedule the idempotent cleanup statement
`DELETE FROM web_auth_sessions WHERE idle_expires_at <= now() OR absolute_expires_at <= now()` at least
hourly and alert on failure or unexpected table growth. Logout deletes the durable session before clearing
the cookie. Database loss or deliberate row/key removal fails closed and requires reauthentication.

Back up the session table only under the same controls as other credential material. Do not export rows
for analytics or troubleshooting. During encryption-key compromise, block login/renewal, purge sessions,
rotate both secrets, restart the fleet, and require reauthentication. Never copy refresh tokens into
browser storage or logs.

## SSE and log hygiene

The browser never places an API bearer token in an SSE URL. It connects with the signed HttpOnly cookie to
the same-origin `/auth/events/stream` broker; the broker resolves the durable session and adds the bearer
Authorization header only to the internal API request. The API rejects `access_token` query authentication.
Configure ingress and application logs to omit Authorization and Cookie headers and all query strings on
auth routes. Retain the explicit `access_token` query redaction rule as defense in depth for historical or
malformed traffic, and test it before release.

Monitor login callback errors, token exchange/renewal failures, invalid-origin attempts, session counts,
database cleanup failures, and API 401/403 rates without logging authorization codes, access tokens, refresh tokens, cookies, state,
nonce, or PKCE verifiers. Rotate a compromised session secret and IdP client configuration, restart the
web fleet, and require reauthentication. Rollback must preserve API OIDC enforcement; never re-enable
self-asserted tenant headers in a deployable environment.
