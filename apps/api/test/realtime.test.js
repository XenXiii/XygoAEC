import test from "node:test";
import assert from "node:assert/strict";

import { createMemoryRepository } from "../src/repositories/memory.js";
import { buildTenantEventSnapshot, canStreamTenantEvents, formatSseEvent } from "../src/realtime.js";

test("tenant event stream auth requires matching staged tenant header", () => {
  assert.equal(
    canStreamTenantEvents({
      tenantId: "tenant-commercial-sim",
      headers: {
        "x-staged-tenant-id": "tenant-commercial-sim"
      }
    }),
    true
  );

  assert.equal(
    canStreamTenantEvents({
      tenantId: "tenant-commercial-sim",
      headers: {
        "x-staged-tenant-id": "tenant-residential-sim"
      }
    }),
    false
  );

  assert.equal(
    canStreamTenantEvents({
      tenantId: "tenant-commercial-sim",
      searchParams: new URLSearchParams({
        stagedTenantId: "tenant-commercial-sim"
      })
    }),
    true
  );
});

test("tenant event snapshot summarizes staged repository counts", () => {
  const repository = createMemoryRepository();
  const snapshot = buildTenantEventSnapshot({
    tenantId: "tenant-commercial-sim",
    repository
  });

  assert.equal(snapshot.projects, 1);
  assert.equal(snapshot.issues, 1);
  assert.equal(snapshot.rfis, 1);
  assert.equal(snapshot.permitPackages, 1);
  assert.equal(snapshot.reviewSessions, 1);
  assert.equal(snapshot.aiReviewRuns, 1);
  assert.equal(snapshot.aiFindings, 1);
});

test("SSE formatter emits event name and JSON data", () => {
  const payload = formatSseEvent({
    event: "snapshot",
    data: {
      staged: true
    }
  });

  assert.match(payload, /^event: snapshot\n/);
  assert.match(payload, /"staged":true/);
});
