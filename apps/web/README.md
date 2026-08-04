# apps/web

Local staged browser runtime for Xygo.

Run locally:

```bash
node apps/web/src/server.js
```

Defaults:
- web: `http://127.0.0.1:4173`
- api: `http://127.0.0.1:3000`

What it shows:
- staged executive summary
- staged workflow boards for projects, issues, RFIs, permits, review sessions, and AI findings
- tenant selector
- staged live-update indicator backed by the API event stream

## Managed OIDC runtime

The web server exposes non-secret deploy-time settings at `/runtime-config.json`. In production it
fails startup unless managed OIDC public-client endpoints, app/API HTTPS URLs, issuer, audience, and
client ID are configured. It rejects browser client secrets and fixes the login contract to
Authorization Code + PKCE `S256` with access tokens held in memory.

See [`config/managed-idp.env.example`](../../config/managed-idp.env.example) and
[`docs/activation/managed-idp-runtime.md`](../../docs/activation/managed-idp-runtime.md). The actual
authenticated login/callback UI is intentionally deferred to the web/PWA release-surface slice.
