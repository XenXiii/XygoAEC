# Authenticated web login operations

## Proven scope

The web process now implements a provider-neutral Authorization Code + PKCE login broker at
`/auth/login`, a callback at `/auth/callback`, session retrieval at `/auth/session`, refresh-token
renewal at `/auth/session/renew`, and logout at `/auth/logout`. No live identity-provider tenant,
client, credentials, redirect registration, DNS, HTTPS ingress, or deployment is included.

The browser receives only the short-lived access token in memory. Refresh tokens remain in the web
process session store and never appear in `/runtime-config.json`, HTML, local storage, session storage,
or cookies. The cookie contains only a signed opaque session id and uses the `__Host-` prefix, Secure,
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
4. Store `XYGO_WEB_SESSION_SECRET` only in the web process secret manager. Use at least 32 random
   characters and rotate it as a coordinated logout of all sessions.
5. Set the cookie controls to `__Host-xygo-session`, Secure=true, HttpOnly=true, SameSite=lax. Set
   `XYGO_WEB_ALLOWED_ORIGIN` to the exact application origin and require refresh tokens.
6. Configure bounded login transaction, idle session, absolute session, token request timeout, renewal
   lead time, and clock tolerance values from `config/production.env.example`.

## Smoke and release checks

1. Confirm production-mode web startup fails with placeholders, HTTP endpoints, a mismatched origin,
   weak session secret, non-`__Host-` cookie, disabled cookie protections, excessive clock tolerance,
   or refresh-token support disabled.
2. Confirm `/runtime-config.json` contains only public endpoints, client id, scopes, PKCE mode, relative
   auth routes, and renewal lead time. Search it for every private sentinel and session secret.
3. Start a login and inspect the redirect for state, nonce, S256 challenge, exact client id, callback,
   audience, and scopes. Confirm the transaction cookie is Secure, HttpOnly, SameSite=Lax, and short-lived.
4. Complete one approved staging login. Confirm the session cookie contains no token and `/auth/session`
   returns an access token with `Cache-Control: no-store` only to the same-origin browser.
5. Exercise renewal before expiry and after one API 401. Confirm refresh-token rotation stays server-side,
   concurrent browser renewal collapses to one request, and failure returns to sign-in without weakening API checks.
6. Test mismatched/expired state, reused callback, disallowed Origin on renewal/logout, expired idle and
   absolute sessions, logout, token expiry/tolerance boundaries, and a cross-tenant API request.

## Operations and remaining blocker

The implemented session store is process-local and deliberately bounded. A process restart logs users
out, and multi-instance staging requires either session affinity or a reviewed shared encrypted session
store before scaling. Never copy refresh tokens into browser storage to work around this constraint.

Monitor login callback errors, token exchange/renewal failures, invalid-origin attempts, session counts,
and API 401/403 rates without logging authorization codes, access tokens, refresh tokens, cookies, state,
nonce, or PKCE verifiers. Rotate a compromised session secret and IdP client configuration, restart the
web fleet, and require reauthentication. Rollback must preserve API OIDC enforcement; never re-enable
self-asserted tenant headers in a deployable environment.
