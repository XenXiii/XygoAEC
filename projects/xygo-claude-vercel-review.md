# Claude Review Request — Xygo Vercel Static Site Deployment

## Goal

Review and correct the Vercel deployment setup for the Xygo website if needed.

The repo was originally a staged Node/static prototype, not a Next.js app. Vercel failed with:

```text
No Next.js version detected. Make sure your package.json has "next" in either "dependencies" or
"devDependencies". Also check your Root Directory setting matches the directory of your package.json file.
```

Do not add Next.js just to satisfy this error. The current site is static HTML/CSS/JS in
`apps/web/public`.

## Repo

Local path:

```text
/Users/Ai/.openclaw/workspace
```

GitHub:

```text
https://github.com/XenXiii/XygoAEC.git
```

Branch:

```text
main
```

Recent pushed commits:

```text
1e49ff9 Configure Vercel static web deployment
1c7a547 Add Xygo platform blueprint page
99d2f67 Reposition web preview for Xygo platform pivot
```

## Current Site Files

Static web root:

```text
apps/web/public
```

Important pages:

```text
apps/web/public/index.html
apps/web/public/demo.html
apps/web/public/platform.html
apps/web/public/blueprint.html
```

Styles/scripts:

```text
apps/web/public/styles.css
apps/web/public/demo.css
apps/web/public/blueprint.css
apps/web/public/app.js
apps/web/public/demo.js
apps/web/public/blueprint.js
```

## Current Vercel Config

Root file:

```text
vercel.json
```

Current contents:

```json
{
  "version": 2,
  "builds": [
    {
      "src": "apps/web/public/**/*",
      "use": "@vercel/static"
    }
  ],
  "routes": [
    {
      "src": "/",
      "dest": "/apps/web/public/index.html"
    },
    {
      "src": "/(.*)",
      "dest": "/apps/web/public/$1"
    }
  ]
}
```

## What Changed Recently

The site was repositioned from an AEC-only SaaS preview to the Xygo 2.0 pivot:

> Xygo generates and deploys custom AI-powered operating systems for SMBs, starting with
> construction and service businesses.

Added:

- `apps/web/public/platform.html`
- `apps/web/test/platform-page.test.js`

Updated:

- `apps/web/public/demo.html`
- `apps/web/public/index.html`

## Validation Already Run

```bash
npm run test:web
# 12 passed

npm test
# 213 passed, 1 skipped, 0 failed
```

## Known Constraints

- Preserve staged/non-production guardrails.
- Do not add live provider integrations.
- Do not use real customer data.
- Do not discard unrelated uncommitted work.
- Prefer minimal static-site deployment fixes over framework rewrites.
- Do not convert the repo to Next.js unless explicitly requested.

## What To Review

1. Verify whether `vercel.json` is the correct setup for deploying `apps/web/public` as a static
   Vercel site.
2. If Vercel still tries to detect Next.js, determine whether this must be fixed in Vercel project
   settings instead of code.
3. If a better code-side config is needed, propose or implement the smallest safe change.
4. Confirm whether root `/`, `/demo.html`, `/platform.html`, and `/blueprint.html` will route
   correctly on Vercel.
5. Keep the website static unless there is a strong reason to add a build step.

## Likely Vercel Dashboard Settings If Code Config Is Not Enough

If Vercel still fails after `vercel.json`, set:

```text
Framework Preset: Other
Root Directory: repo root
Build Command: blank / none
Output Directory: apps/web/public
Install Command: blank / default is fine
```

## Expected Outcome

Vercel should deploy the static site without looking for Next.js.

Public routes should include:

```text
/
/demo.html
/platform.html
/blueprint.html
```

