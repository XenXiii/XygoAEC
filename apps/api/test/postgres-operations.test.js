import test from "node:test";
import assert from "node:assert/strict";

import { createServer, listenWhenReady } from "../src/server.js";
import { createMetrics } from "../src/telemetry/metrics.js";

const stagedEnv = {
  NODE_ENV: "test",
  STAGED_MODE: "true",
  XYGO_API_REPOSITORY_MODE: "memory"
};
const logger = { info() {}, warn() {}, error() {} };

test("API startup refuses to listen until repository readiness succeeds", async () => {
  const repository = {
    async checkReadiness() {
      const error = new Error("pending migrations");
      error.code = "postgres_schema_not_current";
      throw error;
    },
    async close() {}
  };
  const server = createServer({ env: stagedEnv, repository, logger });

  await assert.rejects(
    () => listenWhenReady(server, { port: 0, host: "127.0.0.1" }),
    (error) => error.code === "postgres_schema_not_current"
  );
  assert.equal(server.listening, false);
});

test("ready probe returns 503 when the database becomes unavailable", async () => {
  const repository = {
    async checkReadiness() {
      const error = new Error("database unavailable");
      error.code = "postgres_unavailable";
      throw error;
    },
    async close() {}
  };
  const server = createServer({ env: stagedEnv, repository, logger });
  const response = await new Promise((resolve) => {
    const state = { status: null, body: null };
    const request = { method: "GET", url: "/ready", headers: {}, socket: {} };
    const reply = {
      headersSent: false,
      on() {},
      setHeader() {},
      writeHead(status) {
        state.status = status;
        this.headersSent = true;
      },
      end(body) {
        state.body = JSON.parse(body);
        resolve(state);
      }
    };
    server.listeners("request")[0](request, reply);
  });

  assert.equal(response.status, 503);
  assert.deepEqual(response.body, {
    ready: false,
    reason: "postgres_unavailable",
    staged: true
  });
});

test("API readiness exposes outbox health failures instead of reporting ready", async () => {
  const repository = { async checkReadiness() { return { ready: true }; }, async close() {} };
  const storage = { configuration: { maxFileBytes: 1024 }, async checkReadiness() { return { ready: true }; }, async close() {} };
  const outbox = {
    async checkReadiness() {
      const error = new Error("dead jobs exceed policy");
      error.code = "outbox_unhealthy";
      throw error;
    },
    async close() {}
  };
  const metrics = createMetrics();
  const server = createServer({ env: stagedEnv, repository, storage, outbox, metrics, logger });
  await assert.rejects(
    () => server.checkReadiness(),
    (error) => error.code === "outbox_unhealthy"
  );
  assert.match(metrics.render(), /xygo_dependency_ready\{dependency="outbox"\} 0/);
});

test("API readiness and metrics expose database, storage, outbox, worker, and email health", async (t) => {
  const repository = {
    async checkReadiness() { return { ready: true, latencyMs: 3 }; },
    async checkEmailDeliveryReadiness() { return { ready: true, failures: 0, backlog: 2 }; },
    async checkWorkerReadiness() { return { ready: true, instanceId: "worker-a", ageMs: 10 }; },
    async close() {}
  };
  const storage = { configuration: { maxFileBytes: 1024 }, async checkReadiness() { return { ready: true }; }, async close() {} };
  const outbox = { async checkReadiness() { return { ready: true, backlog: 2 }; }, async close() {} };
  const metrics = createMetrics();
  const server = createServer({ env: stagedEnv, repository, storage, outbox, metrics, logger });
  t.after(() => server.closeRepository());

  const readiness = await server.checkReadiness();
  assert.equal(readiness.ready, true);
  for (const component of ["database", "storage", "outbox", "worker", "emailDelivery"]) {
    assert.equal(readiness[component].ready, true, `${component} should be ready`);
  }
  const text = metrics.render();
  for (const dependency of ["database", "storage", "outbox", "worker", "email_delivery"]) {
    assert.match(text, new RegExp(`xygo_dependency_ready\\{dependency="${dependency}"\\} 1`));
  }
  assert.match(text, /xygo_outbox_backlog 2/);
  assert.match(text, /xygo_email_delivery_failures 0/);
});
