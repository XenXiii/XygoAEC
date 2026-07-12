# Xygo AEC

Status: architecture brief created

## Active Build Direction

`Xygo AEC` is now defined as a staged, non-production corporate cloud communication and supervision system for internal operations, cross-team collaboration, project oversight, and finance/legal/compliance coordination.

Guardrails:
- staged mode only
- mock datasets and mock traffic only
- no live deployment
- no live communication providers
- no live user traffic
- no production writes
- no production finance connections

## Current Deliverables

- Main architecture brief: [xygo-aec-corporate-os-architecture.md](/Users/Ai/.openclaw/workspace/projects/xygo-aec-corporate-os-architecture.md)

## Working Assumptions

- The platform is a unified internal operating system, not a public social or customer chat product.
- Messaging, project operations, supervision, and finance/compliance links all live in one staged platform.
- Sensitive visibility boundaries are first-class requirements.
- Executive, finance, and legal oversight must exist without exposing restricted project details broadly.
- The finance/legal/safe-AI workflow is treated as an existing staged adjacent system, connected through a controlled integration layer.

## Open Decisions

- Preferred frontend visual language and design system
- Whether the first implementation pass should prioritize messaging, project ops, or supervision dashboards
- Whether the staged finance workflow already has a defined mock API contract
- Whether document/file handling needs blueprint/BIM-aware metadata in phase one

## Active UI/UX Build Rules

For each approved Xygo section:

- Design and build only the approved section
- Do not redesign unrelated sections
- Do not move to the next section without explicit approval
- Prioritize clarity, speed, accessibility, trust, and visual hierarchy
- Use clean layouts, consistent spacing, responsive design, and reusable components
- Minimize clicks and cognitive load
- Design for desktop, tablet, and mobile
- Follow `WCAG 2.2 AA`
- Include real working states:
  - loading
  - empty
  - error
  - success
  - disabled
  - permission-restricted
- Keep the interface modern, premium, and professional for AEC teams

Required response format for section delivery:

- What was designed or changed
- Files changed
- Test result
- `SECTION COMPLETE — WAITING FOR CONTINUE.`

## Active Section Build Protocol

Execution mode:

- Build `Xygo AI AEC SaaS` one section at a time
- Do not build the full platform at once
- Start with `Section 0` only when actual execution is approved
- Finish each section completely before moving forward
- Do not start the next section until the user replies `CONTINUE`

Each section must include:

- working code
- tests
- documentation
- security checks
- staged demo data

Environment constraints:

- use only mock data and local staged services
- do not connect to live Autodesk
- do not connect to live Revit
- do not connect to live AutoCAD
- do not connect to live Rhino
- do not connect to live Procore
- do not connect to live Trimble
- do not connect to live Microsoft
- do not connect to live QuickBooks
- do not connect to production systems
- verify APIs and standards using official documentation only
- do not invent SDK methods, endpoints, or file capabilities

Planned build order:

1. Repository setup, architecture, staged-mode safeguards
2. Companies, users, departments, teams, tenant isolation
3. Roles, permissions, restricted access
4. Corporate messaging and channels
5. Threads, mentions, attachments, notifications, search
6. AEC project workspaces
7. Discipline packages
8. File registry and secure uploads
9. File revisions and document control
10. 2D blueprint management
11. 3D BIM model management
12. OpenBIM, IFC, BCF, IDS
13. Drawing and model review tools
14. Coordination and clash issues
15. Design lifecycle and approvals
16. RFIs and project issues
17. Permit workflow
18. Construction and field workflow
19. AI blueprint review pipeline
20. AI findings, code concerns, permit-readiness scoring
21. Autodesk, Procore, Trimble, Microsoft mock integrations
22. Finance/legal integration hooks
23. Dashboards and executive oversight
24. Audit chain, security hardening, load testing
25. Final staged deployment report and activation checklist

Required per-section workflow:

- inspect the existing repository
- explain the section plan briefly
- build only that section
- run tests and fix errors
- report files changed, features completed, test results, and limitations
- end with `SECTION COMPLETE — WAITING FOR CONTINUE.`

## Delivery Checklist

- [x] Create project file
- [x] Convert request into a concrete staged platform brief
- [x] Produce architecture document
- [x] Produce module map
- [x] Produce schema draft
- [x] Produce RBAC and visibility rules
- [x] Produce project lifecycle and finance integration map
- [x] Produce dashboard specification
- [x] Produce staged deployment report
- [x] Produce future go-live checklist

## Next Best Step

If approved, the next move is to scaffold the repo and service boundaries from the architecture brief in staged/mock mode only.
