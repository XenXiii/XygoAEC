export const syntheticTenants = [
  {
    id: "tenant-residential-sim",
    name: "Residential Simulation Group",
    staged: true,
    businessUnits: ["bu-residential-design"],
    departments: ["dept-residential-architecture", "dept-residential-coordination"],
    teams: ["team-residential-core", "team-residential-field"],
    users: ["user-residential-admin", "user-residential-pm"],
    projects: ["project-residential-a"]
  },
  {
    id: "tenant-commercial-sim",
    name: "Commercial Simulation Group",
    staged: true,
    businessUnits: ["bu-commercial-ops"],
    departments: ["dept-commercial-architecture", "dept-commercial-engineering"],
    teams: ["team-commercial-design", "team-commercial-vdc"],
    users: ["user-commercial-admin", "user-commercial-vdc"],
    projects: ["project-commercial-b"]
  }
];

export const syntheticUsers = [
  {
    id: "user-residential-admin",
    tenantId: "tenant-residential-sim",
    email: "res-admin@synthetic.invalid",
    displayName: "Residential Admin",
    organizationRole: "company_admin",
    staged: true
  },
  {
    id: "user-residential-pm",
    tenantId: "tenant-residential-sim",
    email: "res-pm@synthetic.invalid",
    displayName: "Residential Project Manager",
    organizationRole: "supervisor",
    staged: true
  },
  {
    id: "user-commercial-admin",
    tenantId: "tenant-commercial-sim",
    email: "com-admin@synthetic.invalid",
    displayName: "Commercial Admin",
    organizationRole: "company_admin",
    staged: true
  },
  {
    id: "user-commercial-vdc",
    tenantId: "tenant-commercial-sim",
    email: "com-vdc@synthetic.invalid",
    displayName: "Commercial VDC Lead",
    organizationRole: "employee",
    staged: true
  }
];

export const syntheticDepartments = [
  {
    id: "dept-residential-architecture",
    tenantId: "tenant-residential-sim",
    businessUnitId: "bu-residential-design",
    name: "Residential Architecture",
    staged: true
  },
  {
    id: "dept-commercial-engineering",
    tenantId: "tenant-commercial-sim",
    businessUnitId: "bu-commercial-ops",
    name: "Commercial Engineering",
    staged: true
  }
];

export const syntheticProjects = [
  {
    id: "project-residential-a",
    tenantId: "tenant-residential-sim",
    name: "Two-Story Synthetic Residence",
    type: "residential",
    status: "draft",
    staged: true
  },
  {
    id: "project-commercial-b",
    tenantId: "tenant-commercial-sim",
    name: "Small Synthetic Commercial Building",
    type: "commercial",
    status: "draft",
    staged: true
  }
];

export const syntheticDisciplinePackages = [
  {
    id: "package-residential-arch",
    tenantId: "tenant-residential-sim",
    projectId: "project-residential-a",
    discipline: "architecture",
    leadUserId: "user-residential-admin",
    memberUserIds: ["user-residential-pm"],
    staged: true
  },
  {
    id: "package-commercial-arch",
    tenantId: "tenant-commercial-sim",
    projectId: "project-commercial-b",
    discipline: "architecture",
    leadUserId: "user-commercial-admin",
    memberUserIds: ["user-commercial-vdc"],
    staged: true
  }
];

export const syntheticFileRecords = [
  {
    id: "file-residential-sheetset-a",
    tenantId: "tenant-residential-sim",
    projectId: "project-residential-a",
    fileClass: "drawing_source",
    originalFilename: "synthetic-residential-sheetset-a.pdf",
    mimeType: "application/pdf",
    detectedType: "pdf",
    storageKey: "staged/residential/sheetset-a.pdf",
    sizeBytes: 2048,
    staged: true
  },
  {
    id: "file-commercial-model-a",
    tenantId: "tenant-commercial-sim",
    projectId: "project-commercial-b",
    fileClass: "model_source",
    originalFilename: "synthetic-commercial-model-a.ifc",
    mimeType: "application/octet-stream",
    detectedType: "ifc",
    storageKey: "staged/commercial/model-a.ifc",
    sizeBytes: 4096,
    staged: true
  }
];

export const syntheticDrawingSheets = [
  {
    id: "sheet-residential-a101",
    tenantId: "tenant-residential-sim",
    projectId: "project-residential-a",
    fileId: "file-residential-sheetset-a",
    discipline: "architecture",
    sheetNumber: "A101",
    sheetTitle: "First Floor Plan",
    sourceFormat: "pdf",
    staged: true
  }
];

export const syntheticModels = [
  {
    id: "model-commercial-a",
    tenantId: "tenant-commercial-sim",
    projectId: "project-commercial-b",
    sourceFileId: "file-commercial-model-a",
    discipline: "architecture",
    modelName: "Commercial Coordination Model",
    sourceFormat: "ifc",
    staged: true
  }
];

export const syntheticReviewSessions = [
  {
    id: "review-commercial-a",
    tenantId: "tenant-commercial-sim",
    projectId: "project-commercial-b",
    createdBy: "user-commercial-admin",
    artifactRefs: ["drawing:sheet-residential-a101", "model:model-commercial-a"],
    staged: true
  }
];

export const syntheticCoordinationIssues = [
  {
    id: "issue-commercial-a",
    tenantId: "tenant-commercial-sim",
    projectId: "project-commercial-b",
    title: "Plumbing clashes with structural beam",
    description: "Synthetic clash for staged coordination flow",
    status: "open",
    disciplines: ["plumbing", "structural"],
    relatedModelIds: ["model-commercial-a"],
    staged: true
  }
];

export const syntheticRfis = [
  {
    id: "rfi-commercial-a",
    tenantId: "tenant-commercial-sim",
    projectId: "project-commercial-b",
    title: "Clarify structural opening offset",
    question: "Please confirm the synthetic offset shown near gridline B.",
    status: "submitted",
    relatedIssueIds: ["issue-commercial-a"],
    staged: true
  }
];

export const syntheticPermitPackages = [
  {
    id: "permit-commercial-a",
    tenantId: "tenant-commercial-sim",
    projectId: "project-commercial-b",
    jurisdictionProfile: "synthetic-jurisdiction-commercial",
    status: "package_preparation",
    requiredFormsChecklist: [true, true],
    submissionPackageRefs: ["drawing:sheet-residential-a101"],
    staged: true
  },
  {
    id: "permit-residential-a",
    tenantId: "tenant-residential-sim",
    projectId: "project-residential-a",
    jurisdictionProfile: "synthetic-jurisdiction-residential",
    status: "internal_completeness_review",
    requiredFormsChecklist: [true],
    submissionPackageRefs: ["drawing:sheet-residential-a101"],
    staged: true
  }
];

export const syntheticFieldItems = [
  {
    id: "field-commercial-a",
    tenantId: "tenant-commercial-sim",
    projectId: "project-commercial-b",
    itemType: "site_issue",
    status: "open",
    title: "Synthetic field coordination issue",
    relatedModelIds: ["model-commercial-a"],
    staged: true
  }
];

export const syntheticKnowledgeSources = [
  {
    id: "knowledge-commercial-spec-a",
    tenantId: "tenant-commercial-sim",
    projectId: "project-commercial-b",
    sourceType: "project_spec",
    title: "Synthetic Commercial Spec A",
    visibilityClass: "project_only",
    chunkRefs: ["chunk-commercial-spec-a-1"],
    staged: true
  }
];

export const syntheticAiReviewRuns = [
  {
    id: "review-run-commercial-a",
    tenantId: "tenant-commercial-sim",
    projectId: "project-commercial-b",
    artifactType: "drawing_sheet",
    artifactId: "sheet-residential-a101",
    status: "queued",
    ruleVersion: "rules-v1",
    modelVersion: "model-sim-v1",
    staged: true
  }
];

export const syntheticAiFindings = [
  {
    id: "finding-commercial-a",
    reviewRunId: "review-run-commercial-a",
    ruleOrModelVersion: "rules-v1",
    category: "permit_package_completeness_concern",
    title: "Synthetic permit completeness concern",
    description: "Potential issue: staged permit package appears incomplete. Requires qualified review.",
    severity: "medium",
    confidence: "medium",
    evidenceType: "deterministic_rule",
    evidenceReferences: ["review-run-commercial-a-rule-1"],
    assignedDiscipline: "architecture",
    humanDisposition: "pending",
    staged: true
  }
];

export const syntheticTransferPackages = [
  {
    id: "transfer-commercial-trimble-a",
    tenantId: "tenant-commercial-sim",
    projectId: "project-commercial-b",
    destinationProvider: "trimble_connect",
    sheetManifest: ["sheet:sheet-residential-a101"],
    modelManifest: ["model:model-commercial-a"],
    latestApprovedRevisionRefs: ["file:file-commercial-model-a"],
    requiredApprovals: ["approval:discipline_release"],
    staged: true
  }
];

export const syntheticGovernanceEvents = [
  {
    eventType: "design.revision.approved",
    tenantId: "tenant-commercial-sim",
    projectId: "project-commercial-b",
    revisionId: "rev-commercial-a",
    requiresFinanceReview: true,
    requiresLegalReview: false,
    staged: true
  },
  {
    eventType: "legal.review.required",
    tenantId: "tenant-commercial-sim",
    projectId: "project-commercial-b",
    revisionId: "rev-commercial-a",
    requiresFinanceReview: false,
    requiresLegalReview: true,
    staged: true
  }
];

export const syntheticChannels = [
  {
    id: "channel-residential-announcements",
    tenantId: "tenant-residential-sim",
    name: "Residential Announcements",
    channelType: "announcement_channel",
    visibilityClass: "company_public_summary",
    staged: true
  },
  {
    id: "channel-commercial-project-a",
    tenantId: "tenant-commercial-sim",
    name: "Commercial Project Coordination",
    channelType: "project_channel",
    visibilityClass: "project_only",
    projectId: "project-commercial-b",
    staged: true
  }
];

export const syntheticChannelMemberships = [
  {
    id: "channel-membership-res-admin",
    tenantId: "tenant-residential-sim",
    channelId: "channel-residential-announcements",
    userId: "user-residential-admin",
    membershipRole: "owner",
    staged: true
  },
  {
    id: "channel-membership-com-admin",
    tenantId: "tenant-commercial-sim",
    channelId: "channel-commercial-project-a",
    userId: "user-commercial-admin",
    membershipRole: "owner",
    staged: true
  },
  {
    id: "channel-membership-com-vdc",
    tenantId: "tenant-commercial-sim",
    channelId: "channel-commercial-project-a",
    userId: "user-commercial-vdc",
    membershipRole: "member",
    staged: true
  }
];

export const syntheticMessages = [
  {
    id: "message-commercial-a",
    tenantId: "tenant-commercial-sim",
    channelId: "channel-commercial-project-a",
    senderUserId: "user-commercial-admin",
    body: "Please review clash package @user-commercial-vdc",
    mentions: ["user-commercial-vdc"],
    attachments: [],
    references: ["project:project-commercial-b"],
    revision: 1,
    deleted: false,
    staged: true
  }
];
