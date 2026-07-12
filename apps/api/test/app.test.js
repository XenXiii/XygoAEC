import test from "node:test";
import assert from "node:assert/strict";

import { handleApiRequest } from "../src/handlers.js";
import { createMemoryRepository } from "../src/repositories/memory.js";

test("health endpoint returns staged ok response", async () => {
  const response = await handleApiRequest({
    method: "GET",
    path: "/health"
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.status, "ok");
  assert.equal(response.body.staged, true);
});

test("tenant-scoped project list requires matching staged tenant header", async () => {
  const repository = createMemoryRepository();
  const response = await handleApiRequest({
    method: "GET",
    path: "/v1/tenants/tenant-commercial-sim/projects",
    repository,
    headers: {
      "x-staged-tenant-id": "tenant-commercial-sim"
    }
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.items.length, 1);
});

test("tenant mismatch is rejected", async () => {
  const repository = createMemoryRepository();
  const response = await handleApiRequest({
    method: "GET",
    path: "/v1/tenants/tenant-commercial-sim/projects",
    repository,
    headers: {
      "x-staged-tenant-id": "tenant-residential-sim"
    }
  });

  assert.equal(response.status, 403);
  assert.equal(response.body.error, "forbidden");
});

test("executive dashboard endpoint returns staged summary", async () => {
  const repository = createMemoryRepository();
  const response = await handleApiRequest({
    method: "GET",
    path: "/v1/tenants/tenant-commercial-sim/dashboard/executive",
    repository,
    headers: {
      "x-staged-tenant-id": "tenant-commercial-sim"
    }
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.item.tenantId, "tenant-commercial-sim");
  assert.equal(response.body.item.staged, true);
});

test("executive dashboard permit summary reflects repository-backed permit changes", async () => {
  const repository = createMemoryRepository();

  const createResponse = await handleApiRequest({
    method: "POST",
    path: "/v1/tenants/tenant-commercial-sim/permits",
    repository,
    headers: {
      "x-staged-tenant-id": "tenant-commercial-sim"
    },
    body: JSON.stringify({
      id: "permit-commercial-delay",
      projectId: "project-commercial-b",
      jurisdictionProfile: "synthetic-jurisdiction-commercial-delay",
      status: "revision_required",
      requiredFormsChecklist: [true]
    })
  });

  assert.equal(createResponse.status, 201);

  const response = await handleApiRequest({
    method: "GET",
    path: "/v1/tenants/tenant-commercial-sim/dashboard/executive",
    repository,
    headers: {
      "x-staged-tenant-id": "tenant-commercial-sim"
    }
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.item.permitDelays, 1);
});

test("transfer queue endpoint returns staged transfers", async () => {
  const repository = createMemoryRepository();
  const response = await handleApiRequest({
    method: "GET",
    path: "/v1/tenants/tenant-commercial-sim/transfers",
    repository,
    headers: {
      "x-staged-tenant-id": "tenant-commercial-sim"
    }
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.item.stagedTransfers.length, 1);
});

test("audit event list and verification reflect staged API writes", async () => {
  const repository = createMemoryRepository();

  const createResponse = await handleApiRequest({
    method: "POST",
    path: "/v1/tenants/tenant-commercial-sim/projects",
    repository,
    headers: {
      "x-staged-tenant-id": "tenant-commercial-sim",
      "x-staged-user-id": "user-commercial-admin"
    },
    body: JSON.stringify({
      id: "project-commercial-audit",
      name: "Synthetic Audit Project"
    })
  });

  assert.equal(createResponse.status, 201);

  const eventsResponse = await handleApiRequest({
    method: "GET",
    path: "/v1/tenants/tenant-commercial-sim/audit-events",
    repository,
    headers: {
      "x-staged-tenant-id": "tenant-commercial-sim"
    }
  });

  assert.equal(eventsResponse.status, 200);
  assert.equal(eventsResponse.body.items.length, 1);
  assert.equal(eventsResponse.body.items[0].action, "api.project.created");

  const verifyResponse = await handleApiRequest({
    method: "GET",
    path: "/v1/tenants/tenant-commercial-sim/audit-events/verify",
    repository,
    headers: {
      "x-staged-tenant-id": "tenant-commercial-sim"
    }
  });

  assert.equal(verifyResponse.status, 200);
  assert.equal(verifyResponse.body.item.valid, true);
  assert.equal(verifyResponse.body.item.checkedEventCount, 1);
});

test("tenant-scoped issue list returns staged issues", async () => {
  const repository = createMemoryRepository();
  const response = await handleApiRequest({
    method: "GET",
    path: "/v1/tenants/tenant-commercial-sim/issues",
    repository,
    headers: {
      "x-staged-tenant-id": "tenant-commercial-sim"
    }
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.items.length, 1);
});

test("tenant-scoped RFI list returns staged RFIs", async () => {
  const repository = createMemoryRepository();
  const response = await handleApiRequest({
    method: "GET",
    path: "/v1/tenants/tenant-commercial-sim/rfis",
    repository,
    headers: {
      "x-staged-tenant-id": "tenant-commercial-sim"
    }
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.items.length, 1);
});

test("tenant-scoped permit package list returns staged permit packages", async () => {
  const repository = createMemoryRepository();
  const response = await handleApiRequest({
    method: "GET",
    path: "/v1/tenants/tenant-commercial-sim/permits",
    repository,
    headers: {
      "x-staged-tenant-id": "tenant-commercial-sim"
    }
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.items.length, 1);
});

test("tenant-scoped review session list returns staged review sessions", async () => {
  const repository = createMemoryRepository();
  const response = await handleApiRequest({
    method: "GET",
    path: "/v1/tenants/tenant-commercial-sim/review-sessions",
    repository,
    headers: {
      "x-staged-tenant-id": "tenant-commercial-sim"
    }
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.items.length, 1);
});

test("tenant-scoped AI review run list returns staged review runs", async () => {
  const repository = createMemoryRepository();
  const response = await handleApiRequest({
    method: "GET",
    path: "/v1/tenants/tenant-commercial-sim/ai-review-runs",
    repository,
    headers: {
      "x-staged-tenant-id": "tenant-commercial-sim"
    }
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.items.length, 1);
});

test("tenant-scoped AI finding list returns staged findings", async () => {
  const repository = createMemoryRepository();
  const response = await handleApiRequest({
    method: "GET",
    path: "/v1/tenants/tenant-commercial-sim/ai-findings",
    repository,
    headers: {
      "x-staged-tenant-id": "tenant-commercial-sim"
    }
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.items.length, 1);
});

test("unsupported methods are blocked on staged API surface", async () => {
  const repository = createMemoryRepository();
  const response = await handleApiRequest({
    method: "PATCH",
    path: "/v1/tenants/tenant-commercial-sim/projects",
    repository,
    headers: {
      "x-staged-tenant-id": "tenant-commercial-sim"
    }
  });

  assert.equal(response.status, 405);
  assert.equal(response.body.error, "method_not_allowed");
});

test("project creation is staged, tenant-scoped, and readable immediately after write", async () => {
  const repository = createMemoryRepository();

  const createResponse = await handleApiRequest({
    method: "POST",
    path: "/v1/tenants/tenant-commercial-sim/projects",
    repository,
    headers: {
      "x-staged-tenant-id": "tenant-commercial-sim"
    },
    body: JSON.stringify({
      id: "project-commercial-c",
      name: "Synthetic Tower Annex",
      projectType: "commercial"
    })
  });

  assert.equal(createResponse.status, 201);
  assert.equal(createResponse.body.item.id, "project-commercial-c");

  const listResponse = await handleApiRequest({
    method: "GET",
    path: "/v1/tenants/tenant-commercial-sim/projects",
    repository,
    headers: {
      "x-staged-tenant-id": "tenant-commercial-sim"
    }
  });

  assert.equal(listResponse.body.items.length, 2);
});

test("cross-tenant project creation is denied", async () => {
  const repository = createMemoryRepository();

  const response = await handleApiRequest({
    method: "POST",
    path: "/v1/tenants/tenant-commercial-sim/projects",
    repository,
    headers: {
      "x-staged-tenant-id": "tenant-commercial-sim"
    },
    body: JSON.stringify({
      id: "project-bad",
      tenantId: "tenant-residential-sim",
      name: "Bad Project"
    })
  });

  assert.equal(response.status, 403);
  assert.equal(response.body.error, "forbidden");
});

test("issue creation is staged and visible through tenant issue listing", async () => {
  const repository = createMemoryRepository();

  const createResponse = await handleApiRequest({
    method: "POST",
    path: "/v1/tenants/tenant-commercial-sim/issues",
    repository,
    headers: {
      "x-staged-tenant-id": "tenant-commercial-sim"
    },
    body: JSON.stringify({
      id: "issue-commercial-b",
      projectId: "project-commercial-b",
      title: "Synthetic duct conflict",
      description: "Duct conflicts with framing clearance.",
      disciplines: ["mechanical_hvac", "framing"]
    })
  });

  assert.equal(createResponse.status, 201);
  assert.equal(createResponse.body.item.id, "issue-commercial-b");

  const listResponse = await handleApiRequest({
    method: "GET",
    path: "/v1/tenants/tenant-commercial-sim/issues",
    repository,
    headers: {
      "x-staged-tenant-id": "tenant-commercial-sim"
    }
  });

  assert.equal(listResponse.body.items.length, 2);
});

test("issue creation rejects cross-tenant or unknown project references", async () => {
  const repository = createMemoryRepository();

  const response = await handleApiRequest({
    method: "POST",
    path: "/v1/tenants/tenant-commercial-sim/issues",
    repository,
    headers: {
      "x-staged-tenant-id": "tenant-commercial-sim"
    },
    body: JSON.stringify({
      id: "issue-bad",
      projectId: "project-residential-a",
      title: "Bad issue",
      description: "Should not be allowed."
    })
  });

  assert.equal(response.status, 403);
  assert.equal(response.body.error, "forbidden");
});

test("RFI creation is staged and visible through tenant RFI listing", async () => {
  const repository = createMemoryRepository();

  const createResponse = await handleApiRequest({
    method: "POST",
    path: "/v1/tenants/tenant-commercial-sim/rfis",
    repository,
    headers: {
      "x-staged-tenant-id": "tenant-commercial-sim"
    },
    body: JSON.stringify({
      id: "rfi-commercial-b",
      projectId: "project-commercial-b",
      title: "Clarify ceiling clearance",
      question: "Please confirm minimum duct clearance at gridline C."
    })
  });

  assert.equal(createResponse.status, 201);
  assert.equal(createResponse.body.item.id, "rfi-commercial-b");

  const listResponse = await handleApiRequest({
    method: "GET",
    path: "/v1/tenants/tenant-commercial-sim/rfis",
    repository,
    headers: {
      "x-staged-tenant-id": "tenant-commercial-sim"
    }
  });

  assert.equal(listResponse.body.items.length, 2);
});

test("RFI creation rejects cross-tenant or unknown project references", async () => {
  const repository = createMemoryRepository();

  const response = await handleApiRequest({
    method: "POST",
    path: "/v1/tenants/tenant-commercial-sim/rfis",
    repository,
    headers: {
      "x-staged-tenant-id": "tenant-commercial-sim"
    },
    body: JSON.stringify({
      id: "rfi-bad",
      projectId: "project-residential-a",
      title: "Bad RFI"
    })
  });

  assert.equal(response.status, 403);
  assert.equal(response.body.error, "forbidden");
});

test("permit package creation is staged and visible through tenant permit listing", async () => {
  const repository = createMemoryRepository();

  const createResponse = await handleApiRequest({
    method: "POST",
    path: "/v1/tenants/tenant-commercial-sim/permits",
    repository,
    headers: {
      "x-staged-tenant-id": "tenant-commercial-sim"
    },
    body: JSON.stringify({
      id: "permit-commercial-b",
      projectId: "project-commercial-b",
      jurisdictionProfile: "synthetic-jurisdiction-commercial-v2",
      requiredFormsChecklist: [true, false]
    })
  });

  assert.equal(createResponse.status, 201);
  assert.equal(createResponse.body.item.id, "permit-commercial-b");

  const listResponse = await handleApiRequest({
    method: "GET",
    path: "/v1/tenants/tenant-commercial-sim/permits",
    repository,
    headers: {
      "x-staged-tenant-id": "tenant-commercial-sim"
    }
  });

  assert.equal(listResponse.body.items.length, 2);
});

test("permit package creation rejects cross-tenant or unknown project references", async () => {
  const repository = createMemoryRepository();

  const response = await handleApiRequest({
    method: "POST",
    path: "/v1/tenants/tenant-commercial-sim/permits",
    repository,
    headers: {
      "x-staged-tenant-id": "tenant-commercial-sim"
    },
    body: JSON.stringify({
      id: "permit-bad",
      projectId: "project-residential-a",
      jurisdictionProfile: "synthetic-jurisdiction-bad"
    })
  });

  assert.equal(response.status, 403);
  assert.equal(response.body.error, "forbidden");
});

test("review session creation is staged and visible through tenant review-session listing", async () => {
  const repository = createMemoryRepository();

  const createResponse = await handleApiRequest({
    method: "POST",
    path: "/v1/tenants/tenant-commercial-sim/review-sessions",
    repository,
    headers: {
      "x-staged-tenant-id": "tenant-commercial-sim"
    },
    body: JSON.stringify({
      id: "review-commercial-b",
      projectId: "project-commercial-b",
      createdBy: "user-commercial-admin",
      artifactRefs: ["model:model-commercial-a"]
    })
  });

  assert.equal(createResponse.status, 201);
  assert.equal(createResponse.body.item.id, "review-commercial-b");

  const listResponse = await handleApiRequest({
    method: "GET",
    path: "/v1/tenants/tenant-commercial-sim/review-sessions",
    repository,
    headers: {
      "x-staged-tenant-id": "tenant-commercial-sim"
    }
  });

  assert.equal(listResponse.body.items.length, 2);
});

test("review session creation rejects cross-tenant or unknown project references", async () => {
  const repository = createMemoryRepository();

  const response = await handleApiRequest({
    method: "POST",
    path: "/v1/tenants/tenant-commercial-sim/review-sessions",
    repository,
    headers: {
      "x-staged-tenant-id": "tenant-commercial-sim"
    },
    body: JSON.stringify({
      id: "review-bad",
      projectId: "project-residential-a",
      createdBy: "user-commercial-admin",
      artifactRefs: ["drawing:sheet-residential-a101"]
    })
  });

  assert.equal(response.status, 403);
  assert.equal(response.body.error, "forbidden");
});

test("AI review run creation is staged and visible through tenant run listing", async () => {
  const repository = createMemoryRepository();

  const createResponse = await handleApiRequest({
    method: "POST",
    path: "/v1/tenants/tenant-commercial-sim/ai-review-runs",
    repository,
    headers: {
      "x-staged-tenant-id": "tenant-commercial-sim"
    },
    body: JSON.stringify({
      id: "review-run-commercial-b",
      projectId: "project-commercial-b",
      artifactType: "bim_model",
      artifactId: "model-commercial-a"
    })
  });

  assert.equal(createResponse.status, 201);
  assert.equal(createResponse.body.item.id, "review-run-commercial-b");

  const listResponse = await handleApiRequest({
    method: "GET",
    path: "/v1/tenants/tenant-commercial-sim/ai-review-runs",
    repository,
    headers: {
      "x-staged-tenant-id": "tenant-commercial-sim"
    }
  });

  assert.equal(listResponse.body.items.length, 2);
});

test("AI finding creation is staged and visible through tenant finding listing", async () => {
  const repository = createMemoryRepository();

  const createResponse = await handleApiRequest({
    method: "POST",
    path: "/v1/tenants/tenant-commercial-sim/ai-findings",
    repository,
    headers: {
      "x-staged-tenant-id": "tenant-commercial-sim"
    },
    body: JSON.stringify({
      id: "finding-commercial-b",
      reviewRunId: "review-run-commercial-a",
      category: "missing_dimensions",
      title: "Synthetic dimension gap",
      description: "Potential issue: dimension string appears incomplete. Requires qualified review."
    })
  });

  assert.equal(createResponse.status, 201);
  assert.equal(createResponse.body.item.id, "finding-commercial-b");

  const listResponse = await handleApiRequest({
    method: "GET",
    path: "/v1/tenants/tenant-commercial-sim/ai-findings",
    repository,
    headers: {
      "x-staged-tenant-id": "tenant-commercial-sim"
    }
  });

  assert.equal(listResponse.body.items.length, 2);
});

test("AI finding creation rejects cross-tenant or unknown review runs", async () => {
  const repository = createMemoryRepository();

  const response = await handleApiRequest({
    method: "POST",
    path: "/v1/tenants/tenant-commercial-sim/ai-findings",
    repository,
    headers: {
      "x-staged-tenant-id": "tenant-commercial-sim"
    },
    body: JSON.stringify({
      id: "finding-bad",
      reviewRunId: "review-run-missing",
      category: "missing_dimensions",
      title: "Bad finding",
      description: "Potential issue: bad reference. Requires qualified review."
    })
  });

  assert.equal(response.status, 403);
  assert.equal(response.body.error, "forbidden");
});

test("AI finding disposition update is staged and enforces governed conversion", async () => {
  const repository = createMemoryRepository();

  const acceptedResponse = await handleApiRequest({
    method: "POST",
    path: "/v1/tenants/tenant-commercial-sim/ai-findings/finding-commercial-a/disposition",
    repository,
    headers: {
      "x-staged-tenant-id": "tenant-commercial-sim"
    },
    body: JSON.stringify({
      nextDisposition: "accepted"
    })
  });

  assert.equal(acceptedResponse.status, 200);
  assert.equal(acceptedResponse.body.item.humanDisposition, "accepted");

  const convertResponse = await handleApiRequest({
    method: "POST",
    path: "/v1/tenants/tenant-commercial-sim/ai-findings/finding-commercial-a/disposition",
    repository,
    headers: {
      "x-staged-tenant-id": "tenant-commercial-sim"
    },
    body: JSON.stringify({
      nextDisposition: "converted_to_issue",
      relatedIssueId: "issue-commercial-a"
    })
  });

  assert.equal(convertResponse.status, 200);
  assert.equal(convertResponse.body.item.humanDisposition, "converted_to_issue");
  assert.equal(convertResponse.body.item.relatedIssueId, "issue-commercial-a");
});

test("AI finding disposition rejects invalid related issue linkage", async () => {
  const repository = createMemoryRepository();

  const response = await handleApiRequest({
    method: "POST",
    path: "/v1/tenants/tenant-commercial-sim/ai-findings/finding-commercial-a/disposition",
    repository,
    headers: {
      "x-staged-tenant-id": "tenant-commercial-sim"
    },
    body: JSON.stringify({
      nextDisposition: "converted_to_issue",
      relatedIssueId: "issue-missing"
    })
  });

  assert.equal(response.status, 403);
  assert.equal(response.body.error, "forbidden");
});

test("malformed JSON request body returns 400 instead of crashing", async () => {
  const repository = createMemoryRepository();

  const response = await handleApiRequest({
    method: "POST",
    path: "/v1/tenants/tenant-commercial-sim/projects",
    repository,
    headers: {
      "x-staged-tenant-id": "tenant-commercial-sim"
    },
    body: "{bad json"
  });

  assert.equal(response.status, 400);
  assert.equal(response.body.error, "bad_request");
  assert.equal(response.body.staged, true);
});
