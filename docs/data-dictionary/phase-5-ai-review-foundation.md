# Phase 5 AI Review Foundation Data Dictionary

## KnowledgeSource

- `id`
- `tenantId`
- `projectId`
- `sourceType`
- `title`
- `visibilityClass`
- `effectiveDate`
- `chunkRefs`
- `staged`

## RetrievedSource

- `knowledgeSourceId`
- `chunkId`
- `excerpt`
- `effectiveDate`
- `staged`

## ReviewRun

- `id`
- `tenantId`
- `projectId`
- `artifactType`
- `artifactId`
- `status`
- `ruleVersion`
- `modelVersion`
- `jurisdictionProfile`
- `staged`

## EvidenceRecord

- `id`
- `reviewRunId`
- `evidenceType`
- `references`
- `excerpt`
- `staged`

## AIFinding

- `id`
- `reviewRunId`
- `ruleOrModelVersion`
- `category`
- `title`
- `description`
- `severity`
- `confidence`
- `evidenceType`
- `evidenceReferences`
- `referencedStandard`
- `jurisdictionProfile`
- `assumptions`
- `missingInformation`
- `suggestedNextAction`
- `assignedDiscipline`
- `humanDisposition`
- `staged`
