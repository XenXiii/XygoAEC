# Phase 7 Dashboards and Integration Hooks Security

## Current controls

- dashboards summarize only staged inputs
- finance/legal routing stays event-driven and internal
- transfer queues expose staged provider names only
- governance events require tenant and project scope before audit emission

## Known gaps

- no UI-level redaction layer yet
- no persistent materialized views yet
- no notification-delivery controls yet
