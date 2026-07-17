# Xygo — Vercel Deploy Guide (Static Site)

The Xygo website is a **static multi-page site** in `apps/web/public` — **no Next.js, no build step**.
`vercel.json` is already configured for this. Follow the steps below.

- **Repo to import:** https://github.com/XenXiii/XygoAEC
- **Branch:** `main`
- **Config file:** `vercel.json` (committed at repo root)

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "framework": null,
  "buildCommand": null,
  "outputDirectory": "apps/web/public"
}
```

## Deploy from scratch (Vercel dashboard)

1. Go to https://vercel.com/new
2. **Import Git Repository** → select `XenXiii/XygoAEC`.
3. In **Configure Project**, set:

   | Setting | Value |
   | --- | --- |
   | **Framework Preset** | **Other** |
   | **Root Directory** | `./` (repo root — leave as default; do **not** set to `apps/web`) |
   | **Build Command** | leave blank / Override **off** |
   | **Output Directory** | blank (uses `vercel.json` → `apps/web/public`) |
   | **Install Command** | default |

4. **Deploy**.

## Fixing an EXISTING project that failed with "No Next.js version detected"

That error means the project's Framework Preset is Next.js. Fix it:

1. Project → **Settings → Build & Deployment**.
2. **Framework Preset** → **Other**.
3. **Root Directory** → `./` (must be the repo root where `package.json` + `vercel.json` live).
4. **Build Command** → turn **Override off** (clear any `next build`).
5. **Save**, then **Deployments → Redeploy** the latest commit on `main` (currently `a65c078`).

`vercel.json` (`"framework": null`) now overrides detection, so a fresh deploy of `main` should
succeed even before touching the dashboard — but aligning the dashboard avoids future surprises.

## Expected routes after deploy

| URL | Serves |
| --- | --- |
| `/` | `index.html` (Control Room) |
| `/platform.html` | Platform overview (marketing) |
| `/demo.html` | Pivot preview (marketing) |
| `/blueprint.html` | Blueprint review workspace |
| `/platform-blueprint.html` | Generated platform blueprint panel |

## Important caveat (staged)

The marketing pages (`platform.html`, `demo.html`) are fully static and render completely on Vercel.
The **data panels** (Control Room, blueprint, platform-blueprint) call the staged API at
`http://127.0.0.1:3000`, which is **not deployed** — on Vercel those panels show their
"API not reachable" state by design. Hosting the API is a separate step that would touch the
staged/non-production guardrails, so it is intentionally not part of this static deploy.

## Guardrails

Static deploy only. No live integrations, no production writes, no real customer data. Synthetic
"SIMULATED DATA" banners remain on the app surfaces.
