# Accessibility Baseline

Target:
- WCAG 2.2 AA where applicable

Current staged runtime baseline:
- local browser runtime exists in `apps/web`
- keyboard access includes skip navigation and visible focus treatment
- status surfaces use `aria-live` regions
- reduced-motion CSS fallback is present
- staged warning banner is text-visible, not color-only
- automated static accessibility checks now run in `apps/web/test/accessibility.test.js`

Known limitation:
- accessibility verification is currently static/runtime-structure focused, not a full browser audit with assistive-tech or axe-class tooling
