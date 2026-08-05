# PWA and web release operations

## Scope and safety contract

The staging web release is an installable Xygo Workspace PWA rooted at `/workspace`. It links the
contractor field-report, client-portal, blueprint, control-room, activation-demo, and release-status
surfaces. No live credentials, deployment, DNS, or HTTPS infrastructure are included in this change.

The service worker is a shell-only worker. It may precache the offline page, generic workspace HTML,
styles, scripts, icons, and other explicitly listed public assets. It never intercepts or caches `/auth/`,
`/v1/`, `/uploads/`, `/files/`, `/runtime-config.json`, cross-origin requests, non-GET requests, or any
request carrying an Authorization header. Protected tenant/API responses and tenant files therefore
remain online-only and cannot be replayed to another signed-in user from a browser cache.

## Staging configuration and release

1. Complete the authenticated-login runbook, apply all PostgreSQL migrations, and configure the public
   web origin, API origin, IdP metadata, and server-only session secrets through the approved config and
   secret managers. Do not inject server variables into `apps/web/public`.
2. Set `XYGO_DEPLOY_ENVIRONMENT` and immutable `XYGO_RELEASE` values. Confirm `/runtime-config.json`
   returns only the documented public configuration and `Cache-Control: no-store`.
3. Confirm the release host serves `manifest.webmanifest` as `application/manifest+json`, the service
   worker with `Cache-Control: no-cache` and `Service-Worker-Allowed: /`, and HTML with revalidation.
4. Inspect the built public directory for credentials, private database URLs, session material, source
   maps containing environment values, and unexpected generated files. Fail the release if any appear.
5. Install from `/workspace` in a clean browser profile. Confirm the standalone name, icons, start URL,
   theme, contractor/client shortcuts, and update prompt.

## Authentication and tenant smoke tests

1. Open `/workspace` signed out and confirm the loading state becomes a clear sign-in action.
2. Sign in and open contractor reports, client portal, blueprinting, and control room. Confirm each waits
   for session resolution and that tenant-denied API responses produce the access-denied surface.
3. Expire and revoke a session. Confirm renewal fails closed, the expired-session action appears, and no
   protected data remains visible beneath it. Sign in again and confirm normal recovery.
4. Sign out. Confirm the durable server session is deleted, the cookie is cleared, and returning to a
   protected route produces the signed-out surface.
5. Test a canonical user against a different tenant path and confirm the API returns 403 and the web UI
   shows access denied without exposing the other tenant's data.

## Offline and cache validation

1. With DevTools open, inspect Cache Storage. Only the versioned `xygo-shell-*` cache may exist; inspect
   every entry and confirm there are no API, auth, runtime-config, upload, tenant-file, or bearer-token URLs.
2. Go offline. Navigation may show the offline shell, but reports, files, portal data, session responses,
   and operational status must not be available from cache. The offline page must state that tenant data
   is not cached.
3. Return online and confirm runtime configuration and authenticated data are fetched again from the
   network. Test switching users/tenants in the same browser profile and confirm no prior private response
   appears.

## Cache invalidation, update, and rollback

For every shell asset change, increment `CACHE_VERSION` in `service-worker.js`. The new worker installs in
the background, presents an update action, activates only after approval, deletes prior `xygo-shell-*`
caches, and reloads controlled clients. Never use `skipWaiting` automatically for an unreviewed release.

To roll back, restore the prior application artifact while publishing a new service-worker cache version;
do not reuse a broken cache name. Verify the prior manifest, shell, and runtime compatibility, then repeat
the offline/cache and authentication smoke tests. If worker behavior is unsafe, publish a no-op replacement
worker that deletes Xygo caches and unregisters itself; do not ask users to clear all browser data unless
incident response requires it.

## Remaining activation work

Before staging deployment, provision the real HTTPS host and IdP configuration, verify platform-specific
install behavior, confirm ingress cache rules match this runbook, complete accessibility and supported-
browser checks, and run the full login, tenant-isolation, restart, offline, update, and rollback matrix.
