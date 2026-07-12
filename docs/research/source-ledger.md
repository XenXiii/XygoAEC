# Source Ledger

Retrieval date: 2026-07-11

This ledger records the official sources used to shape Phase 0 decisions. Community or marketing summaries are intentionally excluded as primary design authority.

| Area | Official source | Version / status noted | Retrieval date | Notes |
| --- | --- | --- | --- | --- |
| Frontend baseline | https://nextjs.org/docs/app/getting-started | Current docs page, last updated 2025-05-02 | 2026-07-11 | Used to justify App Router-ready web baseline. |
| Next.js project structure | https://nextjs.org/docs/app/getting-started/project-structure | Current docs page | 2026-07-11 | Used for future app layout planning. |
| Backend framework option | https://docs.nestjs.com/ | Current docs | 2026-07-11 | Used in modular-monolith comparison. |
| OpenAPI in NestJS | https://docs.nestjs.com/openapi/introduction | Current docs | 2026-07-11 | Used for contract-first API planning. |
| PostgreSQL row security | https://www.postgresql.org/docs/current/ddl-rowsecurity.html | Current docs | 2026-07-11 | Used for tenant isolation planning. |
| PostgreSQL policy creation | https://www.postgresql.org/docs/current/sql-createpolicy.html | Current docs | 2026-07-11 | Used for RLS enforcement approach. |
| OpenAPI standard | https://spec.openapis.org/oas/v3.2.0.html | OAS 3.2.0 | 2026-07-11 | Used for versioned API design requirement. |
| IFC | https://ifc43-docs.standards.buildingsmart.org/ | IFC 4.3.2.0 docs | 2026-07-11 | Used for OpenBIM planning and metadata boundaries. |
| IFC standards overview | https://technical.buildingsmart.org/standards/ifc/ | Current official overview | 2026-07-11 | Used for standards scope and terminology. |
| BCF | https://www.buildingsmart.org/standards/bsi-standards/bim-collaboration-format/ | Current official overview | 2026-07-11 | Used for BCF-compatible issue concepts. |
| IDS | https://www.buildingsmart.org/standards/bsi-standards/information-delivery-specification-ids/ | Current official overview | 2026-07-11 | Used for deterministic requirement validation design. |
| Autodesk APS docs | https://aps.autodesk.com/developer/documentation | Current official docs portal | 2026-07-11 | Used to constrain future mock adapter design. |
| Autodesk Data Management API | https://aps.autodesk.com/developer/overview/data-management-api | Current official overview | 2026-07-11 | Used to bound future data-management adapter capabilities. |
| Autodesk Data Management API v2 docs | https://aps.autodesk.com/en/docs/data/v2 | Current official docs | 2026-07-11 | Used to keep transfer adapter language aligned with official APS data concepts only. |
| Procore docs | https://developers.procore.com/documentation/introduction | Current official docs | 2026-07-11 | Used for future mock adapter boundaries. |
| Procore REST overview | https://developers.procore.com/reference/rest/docs/rest-api-overview | Current official overview | 2026-07-11 | Used to record versioning and API coverage expectations. |
| Procore OAuth | https://developers.procore.com/documentation/oauth-endpoints | Current official docs | 2026-07-11 | Used for staged auth simulation planning. |
| Procore OAuth auth-code flow | https://developers.procore.com/documentation/oauth-auth-grant-flow | Current official docs | 2026-07-11 | Used to keep staged auth simulation grounded in official flow terminology. |
| Trimble Connect overview | https://developer.trimble.com/docs/connect/ | Current official docs | 2026-07-11 | Used for future mock adapter scoping. |
| Trimble Connect Core API | https://developer.trimble.com/docs/connect/reference/openapi/core/ | Current official reference | 2026-07-11 | Used to bound file/workspace capability expectations. |
| Trimble Connect Model API | https://developer.trimble.com/docs/connect/tools/api/model/ | Current official docs | 2026-07-11 | Used to keep model-transfer terminology aligned with official concepts. |
| Microsoft Azure AI Search | https://learn.microsoft.com/en-us/azure/search/search-what-is-azure-search | Current official docs | 2026-07-11 | Used for future permission-aware search abstraction. |
| Microsoft Graph docs | https://learn.microsoft.com/en-us/graph/ | Current official docs | 2026-07-11 | Used for staged Microsoft integration boundaries. |
| Microsoft Graph overview | https://learn.microsoft.com/en-us/graph/overview | Current official docs | 2026-07-11 | Used to constrain Graph integration framing to official concepts only. |
| Microsoft Graph auth concepts | https://learn.microsoft.com/en-us/graph/auth/auth-concepts | Current official docs | 2026-07-11 | Used to keep staged auth terminology aligned with official Microsoft guidance. |
| Microsoft Graph API usage | https://learn.microsoft.com/en-us/graph/use-the-api | Current official docs | 2026-07-11 | Used to keep staged API request language grounded in official usage patterns. |
| OWASP ASVS | https://owasp.org/www-project-application-security-verification-standard/ | ASVS 5.0 referenced on project page | 2026-07-11 | Used for security baseline target selection. |
| NIST AI RMF | https://www.nist.gov/itl/ai-risk-management-framework | Current official overview | 2026-07-11 | Used for AI governance and evidence requirements. |
| OpenTelemetry | https://opentelemetry.io/docs/ | Current docs | 2026-07-11 | Used for observability baseline. |
| GitHub CODEOWNERS | https://docs.github.com/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/about-code-owners | Current docs | 2026-07-11 | Used for repository governance plan. |
| GitHub CodeQL | https://docs.github.com/code-security/code-scanning/introduction-to-code-scanning/about-code-scanning-with-codeql | Current docs | 2026-07-11 | Used for CI security scan planning. |

## Constraints Captured

- Official docs support a staged mock-adapter approach, but Phase 0 does not enable real provider access.
- PostgreSQL RLS is viable for tenant isolation, but application-layer checks still remain mandatory.
- Open standards like IFC, BCF, and IDS vary in practical completeness by export source, so Xygo must preserve provenance and validation limits.
- OWASP ASVS and NIST AI RMF support a conservative baseline for staged security and human-reviewed AI findings.
