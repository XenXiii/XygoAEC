# Branch Protection (manual repo setting)

Branch protection cannot be committed as a file — it is a GitHub repository setting.
Apply the following to `main` (Settings → Branches → Add rule, or via `gh`):

- Require a pull request before merging (no direct pushes to `main`).
- Require status checks to pass before merging:
  - `Test suite (Node 24.x)` (from `ci.yml`)
  - `CodeQL analysis` (from `codeql.yml`)
  - `Dependency Review` (from `dependency-review.yml`, PR-only)
- Require branches to be up to date before merging.
- Require conversation resolution before merging.
- Do not allow force pushes or deletions.

Apply via CLI (requires admin + auth):

```bash
gh api -X PUT repos/XenXiii/XygoAEC/branches/main/protection \
  -H "Accept: application/vnd.github+json" \
  -f 'required_status_checks[strict]=true' \
  -f 'required_status_checks[contexts][]=Test suite (Node 24.x)' \
  -f 'required_status_checks[contexts][]=CodeQL analysis' \
  -F 'enforce_admins=true' \
  -F 'required_pull_request_reviews[required_approving_review_count]=1' \
  -F 'restrictions=null'
```

Until this is applied, CI runs on every push/PR but does **not** block merges.
