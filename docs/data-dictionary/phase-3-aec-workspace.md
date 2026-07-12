# Phase 3 AEC Workspace Data Dictionary

## DisciplinePackage

- `id`
- `tenantId`
- `projectId`
- `discipline`
- `leadUserId`
- `memberUserIds`
- `scope`
- `deliverables`
- `dependencies`
- `drawingIds`
- `modelIds`
- `reviewGate`
- `completionStatus`
- `staged`

## ReviewSession

- `id`
- `tenantId`
- `projectId`
- `createdBy`
- `artifactRefs`
- `status`
- `commentIds`
- `staged`

## ReviewComment

- `id`
- `tenantId`
- `reviewSessionId`
- `authorUserId`
- `body`
- `markupRef`
- `dueDate`
- `staged`

## FileRecord

- `id`
- `tenantId`
- `projectId`
- `discipline`
- `fileClass`
- `originalFilename`
- `safeFilename`
- `mimeType`
- `detectedType`
- `sizeBytes`
- `storageKey`
- `revision`
- `lifecycleStatus`
- `visibilityClass`
- `integrityHash`
- `validationState`
- `malwareScanState`
- `staged`

## DrawingSheet

- `id`
- `tenantId`
- `projectId`
- `fileId`
- `discipline`
- `sheetNumber`
- `sheetTitle`
- `revision`
- `sourceFormat`
- `lifecycleStatus`
- `aiReviewStatus`
- `integrityHash`
- `staged`

## ModelRecord

- `id`
- `tenantId`
- `projectId`
- `sourceFileId`
- `discipline`
- `modelName`
- `sourceFormat`
- `authoringApplication`
- `lifecycleStatus`
- `reviewState`
- `approvalState`
- `derivativeArtifacts`
- `integrityHash`
- `staged`
