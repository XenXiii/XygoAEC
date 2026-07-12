# Staged Provider Contracts

Official references used for Phase 6 mock-adapter design:

- Autodesk APS Data Management API:
  - https://aps.autodesk.com/developer/overview/data-management-api
  - https://aps.autodesk.com/en/docs/data/v2
- Procore OAuth and API docs:
  - https://developers.procore.com/documentation/introduction
  - https://developers.procore.com/documentation/oauth-endpoints
  - https://developers.procore.com/documentation/oauth-auth-grant-flow
- Trimble Connect docs:
  - https://developer.trimble.com/docs/connect/
  - https://developer.trimble.com/docs/connect/reference/openapi/core/
  - https://developer.trimble.com/docs/connect/tools/api/model/
- Microsoft Graph docs:
  - https://learn.microsoft.com/en-us/graph/
  - https://learn.microsoft.com/en-us/graph/overview
  - https://learn.microsoft.com/en-us/graph/auth/auth-concepts
  - https://learn.microsoft.com/en-us/graph/use-the-api

Phase 6 implementation intentionally uses only these concepts:
- staged configuration validation
- simulated authentication
- simulated transfer lifecycle
- transfer-package contract validation
- report generation

Explicitly disabled in current code:
- create folder on provider
- upload file to provider
- publish model to provider
- live OAuth exchanges
- live external writes
