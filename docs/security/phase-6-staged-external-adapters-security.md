# Phase 6 Staged External Adapters Security

## Current controls

- provider allowlist only
- staged configuration required
- live write methods disabled
- transfer simulations require tenant and project scope
- staged-mode outbound guard remains active
- transfer actions emit audit and outbox evidence

## Known gaps

- no provider-specific sandbox credential storage yet
- no per-provider pagination/resource contract expansion yet
- no signed manifest packaging yet
