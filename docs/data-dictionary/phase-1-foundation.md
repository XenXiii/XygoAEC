# Phase 1 Foundation Data Dictionary

## Core Entities Introduced

### Tenant

- `id`
- `name`
- `status`
- `staged`
- `createdAt`

### BusinessUnit

- `id`
- `tenantId`
- `name`
- `staged`

### Department

- `id`
- `tenantId`
- `businessUnitId`
- `name`
- `code`
- `staged`

### Team

- `id`
- `tenantId`
- `departmentId`
- `name`
- `staged`

### User

- `id`
- `tenantId`
- `email`
- `displayName`
- `status`
- `staged`

### Membership

- `id`
- `tenantId`
- `userId`
- `departmentId`
- `teamId`
- `organizationRole`
- `staged`

### Project

- `id`
- `tenantId`
- `name`
- `projectType`
- `status`
- `staged`

### ProjectParticipant

- `id`
- `tenantId`
- `projectId`
- `userId`
- `projectRole`
- `staged`

### SyntheticSession

- `sessionId`
- `tenantId`
- `userId`
- `organizationRole`
- `projectRoles`
- `allowedProjectIds`
- `staged`

### AuditEvent

- `eventId`
- `tenantId`
- `actorType`
- `actorId`
- `action`
- `resourceType`
- `resourceId`
- `beforeStateRef`
- `afterStateRef`
- `correlationId`
- `requestId`
- `schemaVersion`
- `staged`
- `timestamp`
- `previousHash`
- `eventHash`

### OutboxEvent

- `id`
- `eventType`
- `eventVersion`
- `aggregateType`
- `aggregateId`
- `tenantId`
- `payload`
- `staged`
- `status`
- `occurredAt`
