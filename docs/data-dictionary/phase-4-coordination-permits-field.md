# Phase 4 Coordination, Permits, and Field Data Dictionary

## CoordinationIssue

- `id`
- `tenantId`
- `projectId`
- `title`
- `description`
- `status`
- `type`
- `source`
- `disciplines`
- `assignedLeadUserId`
- `priority`
- `severity`
- `confidence`
- `relatedSheetIds`
- `relatedModelIds`
- `relatedElementIds`
- `evidence`
- `proposedResolution`
- `staged`

## BCFTopic

- `id`
- `tenantId`
- `projectId`
- `issueId`
- `topic`
- `viewpoint`
- `camera`
- `selectedElements`
- `snapshotRef`
- `comments`
- `priority`
- `staged`

## RFI

- `id`
- `tenantId`
- `projectId`
- `title`
- `question`
- `requestedBy`
- `assignedTo`
- `status`
- `relatedSheetIds`
- `relatedIssueIds`
- `staged`

## ApprovalRequest

- `id`
- `tenantId`
- `projectId`
- `approvalType`
- `status`
- `requestedBy`
- `reviewerRole`
- `artifactRefs`
- `staged`

## PermitPackage

- `id`
- `tenantId`
- `projectId`
- `jurisdictionProfile`
- `status`
- `submissionPackageRefs`
- `requiredFormsChecklist`
- `reviewComments`
- `responseMatrix`
- `submissionCycles`
- `permitReadinessFindings`
- `staged`

## FieldItem

- `id`
- `tenantId`
- `projectId`
- `itemType`
- `title`
- `status`
- `location`
- `photoFixtureRefs`
- `relatedSheetIds`
- `relatedModelIds`
- `responsibleParty`
- `dueDate`
- `resolution`
- `costImpactPlaceholder`
- `staged`
