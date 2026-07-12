# Phase 5 AI Review Security

## Current controls

- tenant and project scope required before review intake
- knowledge retrieval remains tenant and project filtered
- findings require cautious language
- human disposition remains separate from finding generation
- converted findings require a governed related issue id
- AI audit and outbox events are emitted

## Known gaps

- no prompt-injection filtering yet on uploaded source text
- no model inference runtime yet
- no jurisdiction-source licensing workflow yet
- no evaluation dataset persistence yet
