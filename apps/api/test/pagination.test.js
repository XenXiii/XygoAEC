import test from "node:test";
import assert from "node:assert/strict";

import { handleApiRequest } from "../src/handlers.js";
import { createMemoryRepository } from "../src/repositories/memory.js";

const T = "tenant-commercial-sim";

async function seedIssues(repository, n) {
  for (let i = 0; i < n; i += 1) {
    await handleApiRequest({
      method: "POST",
      path: `/v1/tenants/${T}/issues`,
      headers: { "x-staged-tenant-id": T },
      body: JSON.stringify({
        id: `issue-page-${i}`,
        projectId: "project-commercial-b",
        title: `t${i}`,
        description: "d",
        status: i % 2 === 0 ? "open" : "closed"
      }),
      repository
    });
  }
}

test("limit + offset paginate and expose nextOffset", async () => {
  const repository = createMemoryRepository();
  await seedIssues(repository, 5);

  const page1 = await handleApiRequest({
    method: "GET",
    path: `/v1/tenants/${T}/issues?limit=2&offset=0`,
    headers: { "x-staged-tenant-id": T },
    repository
  });
  assert.equal(page1.body.items.length, 2);
  assert.equal(page1.body.pagination.nextOffset, 2);
  assert.ok(page1.body.pagination.total >= 5);

  const lastOffset = page1.body.pagination.total - 1;
  const tail = await handleApiRequest({
    method: "GET",
    path: `/v1/tenants/${T}/issues?limit=2&offset=${lastOffset}`,
    headers: { "x-staged-tenant-id": T },
    repository
  });
  assert.equal(tail.body.items.length, 1);
  assert.equal(tail.body.pagination.nextOffset, null);
});

test("status filter narrows list results", async () => {
  const repository = createMemoryRepository();
  await seedIssues(repository, 4); // 2 open, 2 closed (plus seed issue-commercial-a which is open)

  const closed = await handleApiRequest({
    method: "GET",
    path: `/v1/tenants/${T}/issues?status=closed`,
    headers: { "x-staged-tenant-id": T },
    repository
  });
  assert.ok(closed.body.items.length >= 2);
  assert.ok(closed.body.items.every((issue) => issue.status === "closed"));
});
