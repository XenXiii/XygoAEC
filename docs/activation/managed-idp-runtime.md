# Managed IdP Runtime Contract

This slice defines the deploy-time OIDC contract for the API and browser and the controlled workflow
that binds an invited provider identity to a provisioned Postgres user. It does not create provider
accounts, deploy an environment, or add the portal login UI.

## Provider setup

Create two provider resources in the selected managed OIDC tenant:

1. An API/resource server with the exact audience configured as `XYGO_OIDC_AUDIENCE`.
2. A browser public client using Authorization Code flow with PKCE `S256`. Do not issue or configure a
   client secret for the browser.

Record the provider's exact issuer (including its trailing slash when the provider emits one), JWKS
endpoint, authorization endpoint, token endpoint, and logout/end-session endpoint. Register these
browser URLs exactly:

- callback: `<XYGO_WEB_APP_URL>/auth/callback`
- post-logout: `<XYGO_WEB_APP_URL>/`
- allowed web origin: `XYGO_WEB_APP_URL`

Use [`config/managed-idp.env.example`](../../config/managed-idp.env.example) as the provider-specific
reference fragment. A complete production environment starts from
[`config/production.env.example`](../../config/production.env.example); real values belong in the
approved environment or secret store. `XYGO_OIDC_PROVIDER` is descriptive but mandatory in production;
supported values are `auth0`, `clerk`, `cognito`, `entra`, `google`, `okta`, and `other-managed-oidc`.

For Google OAuth / Sign in with Google, set the issuer to `https://accounts.google.com`, the
authorization endpoint to `https://accounts.google.com/o/oauth2/v2/auth`, the token endpoint to
`https://oauth2.googleapis.com/token`, and the JWKS endpoint to
`https://www.googleapis.com/oauth2/v3/certs`. Use the Google OAuth client ID as both
`XYGO_WEB_OIDC_CLIENT_ID` and `XYGO_OIDC_AUDIENCE`, store `XYGO_WEB_OIDC_CLIENT_SECRET` only in the
server-side web runtime, and omit `XYGO_WEB_OIDC_END_SESSION_ENDPOINT` because Google does not publish
a standard OIDC end-session endpoint. The web broker stores Google's `id_token` as the server-issued
browser session bearer so the API can verify issuer, audience, signature, and canonical Postgres
issuer+subject binding.

The API validates bearer tokens against the exact issuer, audience, explicit JWKS endpoint, and RSA
algorithm allowlist. The provider token's tenant or role claims are never authorization inputs.
Postgres issuer+subject binding, active tenant, active user, and canonical role assignment determine
access.

## Invite and bind a provisioned user

Provision the tenant and user first without an `oidcSubject`. In the managed provider's administrative
console or approved automation:

1. Invite/create the user with the same reviewed email address.
2. Complete any required email verification or MFA enrollment.
3. Retrieve the immutable OIDC `sub` from the provider's administrative record. Do not use email as
   the subject and do not copy a tenant or role claim into Xygo.
4. Verify the provider issuer exactly matches the runtime `XYGO_OIDC_ISSUER`.
5. Run the binding command from a controlled operator environment:

```bash
XYGO_API_PG_URL='<canonical-postgres-url>' \
XYGO_OIDC_ISSUER='https://tenant.example-idp.com/' \
XYGO_AUDIT_SIGNING_KEY='<secret-audit-key>' \
XYGO_WEB_APP_URL='https://app.staging.xygo.example' \
npm run bind:oidc-user -- \
  --tenant-id tenant-client-slug \
  --email owner@example.com \
  --subject '<immutable-provider-sub>' \
  --actor-id '<operator-id>' \
  --approve-managed-idp-binding
```

The command never contacts the provider. It transactionally finds the active Postgres tenant, user,
and role assignment; rejects missing, inactive, ambiguous, or conflicting records; inserts the unique
issuer+subject binding; appends `managed_idp.identity_bound` audit evidence; and queues the activation
delivery, its audit evidence, and durable outbox job. An exact rerun is idempotent. A different subject
for the user, or reuse of a subject by another user, fails without a partial identity, activation
delivery, outbox job, or audit record. The worker performs the external delivery later; see the
[Email Delivery and Monitoring Operations Runbook](../operations/email-monitoring-runbook.md).

## Startup gates

An API runtime marked by `NODE_ENV=production` or `STAGED_MODE=false` refuses to start unless:

- `XYGO_AUTH_MODE=oidc` and `XYGO_API_REPOSITORY_MODE=postgres`;
- a supported `XYGO_OIDC_PROVIDER` is named;
- issuer, audience, and an explicit `XYGO_OIDC_JWKS_URI` are configured;
- issuer and JWKS use safe HTTPS URLs;
- the algorithm allowlist contains supported RSA algorithms and clock tolerance is 0–300 seconds.

The production web runtime independently refuses to start unless the app URL, API URL, public client
ID, issuer/audience, and provider authorization/token/logout endpoints are complete and HTTPS. It
also rejects `XYGO_WEB_OIDC_CLIENT_SECRET`. `/runtime-config.json` exposes only non-secret public
client configuration and is served with `Cache-Control: no-store`.

The complete API/web/worker variable lists and additional Postgres, audit, email, storage, outbox, and
monitoring gates are defined in the
[`Production Environment And Secrets Gate`](../operations/production-environment-gate.md).

## Browser token lifecycle contract

The web client must consume `/runtime-config.json` and use Authorization Code + PKCE `S256` with
`state` and `nonce` validation. Access tokens stay in memory and are sent only as `Authorization:
Bearer` headers to `XYGO_WEB_API_BASE_URL`; they must not be stored in local storage, embedded in
URLs, or treated as a source of tenant/role authorization. The provider SDK may perform in-memory
renewal or use a rotated refresh token only when the provider is configured for public-client refresh
token rotation. Logout clears in-memory state and uses the configured end-session endpoint.

The authenticated portal login/callback UI and token-renewal implementation remain part of the PWA
release-surface work. Until that work lands, this contract is deploy-time configuration and startup
validation, not a claim that end users can sign in through the web UI.
