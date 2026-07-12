# Phase 4 Coordination, Permits, and Field Security

## Current controls

- server-side tenant and project checks for issue, permit, approval, and field updates
- permit lifecycle rejects incomplete packages before simulated submission
- reviewer comments required before `reviewer_comments_received`
- field items cannot resolve without resolution text
- coordination and field transitions produce audit and outbox evidence

## Known gaps

- no full approval quorum enforcement yet
- no permit jurisdiction-source licensing logic yet
- no construction role-specialized authorization matrix yet
- no BCF export serializer yet
