# apps/web

Local staged browser runtime for Xygo.

Run locally:

```bash
node apps/web/src/server.js
```

Defaults:
- web: `http://127.0.0.1:4173`

## Authenticated workspace local preview

Do not open `public/app.html` directly to test authentication. A `file://` page
cannot use the authenticated API origin. From the repository root, run:

```sh
npm run start:web
```

Then open `http://127.0.0.1:4173/app`. Direct-file opening shows a safe local
preview notice and does not authenticate or substitute fixture customer data.
Test fixtures are available only through an explicit `?fixture=` query and are
visibly labeled as simulated test data.
- api: `http://127.0.0.1:3000`

What it shows:
- staged executive summary
- staged workflow boards for projects, issues, RFIs, permits, review sessions, and AI findings
- tenant selector
- staged live-update indicator backed by the API event stream
