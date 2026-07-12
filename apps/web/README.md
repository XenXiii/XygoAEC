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
