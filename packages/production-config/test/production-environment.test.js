import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import {
  PRIVATE_PRODUCTION_ENV_VARS,
  PUBLIC_WEB_RUNTIME_ENV_VARS,
  REQUIRED_PRODUCTION_ENV_VARS,
  SERVER_ONLY_EMAIL_MONITORING_ENV_VARS,
  SERVER_ONLY_OUTBOX_ENV_VARS,
  SERVER_ONLY_STORAGE_ENV_VARS,
  assertProductionApiEnvironment,
  assertProductionWebEnvironment,
  assertProductionWorkerEnvironment,
  postgresPoolOptionsFromEnvironment,
  monitoringRuntimeOptionsFromEnvironment,
  workerRuntimeOptionsFromEnvironment
} from "../src/index.js";
import { validProductionEnvironment } from "./fixtures.js";

const validators = {
  api: assertProductionApiEnvironment,
  web: assertProductionWebEnvironment,
  worker: assertProductionWorkerEnvironment
};

test("local and staged development are unchanged", () => {
  for (const validate of Object.values(validators)) {
    assert.doesNotThrow(() => validate({}));
    assert.doesNotThrow(() => validate({ NODE_ENV: "test", STAGED_MODE: "true" }));
  }
});

test("explicit non-staged mode activates the production gate", () => {
  assert.throws(
    () => assertProductionWorkerEnvironment({ STAGED_MODE: "false" }),
    /Production worker configuration error/
  );
});

test("complete production manifests pass each process gate", () => {
  const env = validProductionEnvironment();
  for (const validate of Object.values(validators)) {
    assert.doesNotThrow(() => validate(env));
  }
});

test("deployable staging uses the same fail-closed server configuration gate", () => {
  const env = validProductionEnvironment({ XYGO_DEPLOY_ENVIRONMENT: "staging" });
  for (const validate of Object.values(validators)) {
    assert.doesNotThrow(() => validate(env));
  }
  assert.throws(
    () => assertProductionApiEnvironment(validProductionEnvironment({ XYGO_DEPLOY_ENVIRONMENT: "development" })),
    /XYGO_DEPLOY_ENVIRONMENT must be staging or production/
  );
});

test("every process gate fails when any of its required values is absent", () => {
  for (const [service, requiredNames] of Object.entries(REQUIRED_PRODUCTION_ENV_VARS)) {
    for (const name of requiredNames) {
      const env = validProductionEnvironment();
      delete env[name];
      assert.throws(() => validators[service](env), new RegExp(name));
    }
  }
});

test("unsafe backend settings fail closed", () => {
  assert.throws(
    () => assertProductionApiEnvironment(validProductionEnvironment({
      XYGO_API_PG_URL: "postgresql://xygo:password@db.production.xygoaec.com/xygo"
    })),
    /sslmode/
  );
  assert.throws(
    () => assertProductionApiEnvironment(validProductionEnvironment({
      XYGO_AUDIT_SIGNING_KEY: "change-me"
    })),
    /XYGO_AUDIT_SIGNING_KEY/
  );
  assert.throws(
    () => assertProductionWorkerEnvironment(validProductionEnvironment({
      XYGO_OUTBOX_BACKEND: "memory"
    })),
    /XYGO_OUTBOX_BACKEND must be postgres/
  );
  assert.throws(
    () => assertProductionWorkerEnvironment(validProductionEnvironment({
      XYGO_STORAGE_ENDPOINT: "http://storage.production.xygoaec.com"
    })),
    /XYGO_STORAGE_ENDPOINT must be an HTTPS URL/
  );
  assert.throws(
    () => assertProductionWebEnvironment(validProductionEnvironment({
      XYGO_WEB_APP_URL: "http://app.production.xygoaec.com"
    })),
    /XYGO_WEB_APP_URL must be an HTTPS URL/
  );
  assert.throws(
    () => assertProductionWebEnvironment(validProductionEnvironment({
      XYGO_WEB_OIDC_CLIENT_ID: "<public-client-id>"
    })),
    /placeholder values are forbidden.*XYGO_WEB_OIDC_CLIENT_ID/
  );
  assert.throws(
    () => assertProductionApiEnvironment(validProductionEnvironment({
      XYGO_PG_SEED_SYNTHETIC_DATA: "true"
    })),
    /XYGO_PG_SEED_SYNTHETIC_DATA must not be enabled/
  );
  for (const [name, value] of [
    ["XYGO_STORAGE_DRIVER", "local"],
    ["XYGO_STORAGE_PUBLIC_ACCESS", "public"],
    ["XYGO_STORAGE_SERVER_SIDE_ENCRYPTION", "none"],
    ["XYGO_STORAGE_ALLOWED_MIME_TYPES", "image/*"],
    ["XYGO_STORAGE_SIGNED_URL_TTL_SEC", "901"],
    ["XYGO_STORAGE_MAX_FILE_BYTES", "262144001"],
    ["XYGO_STORAGE_SECRET_ACCESS_KEY", "change-me"]
  ]) {
    assert.throws(
      () => assertProductionApiEnvironment(validProductionEnvironment({ [name]: value })),
      new RegExp(name)
    );
  }
});

test("reserved example hosts and generic placeholder values fail closed", () => {
  assert.throws(
    () => assertProductionApiEnvironment(validProductionEnvironment({
      XYGO_API_PG_URL: "postgresql://xygo:password@db.xygo.invalid/xygo?sslmode=verify-full"
    })),
    /XYGO_API_PG_URL must not use a reserved example, test, local, invalid, or loopback hostname/
  );
  assert.throws(
    () => assertProductionWebEnvironment(validProductionEnvironment({
      XYGO_WEB_APP_URL: "https://app.xygo.example"
    })),
    /XYGO_WEB_APP_URL must not use a reserved example, test, local, invalid, or loopback hostname/
  );
  assert.throws(
    () => assertProductionApiEnvironment(validProductionEnvironment({
      XYGO_OIDC_AUDIENCE: "https://api.xygo.example"
    })),
    /XYGO_OIDC_AUDIENCE must not use a reserved example, test, local, invalid, or loopback hostname/
  );
  assert.throws(
    () => assertProductionWorkerEnvironment(validProductionEnvironment({
      XYGO_EMAIL_FROM: "notifications@example.com"
    })),
    /XYGO_EMAIL_FROM must not use a reserved example, test, local, invalid, or loopback hostname/
  );
  assert.throws(
    () => assertProductionWebEnvironment(validProductionEnvironment({ XYGO_RELEASE: "example-release" })),
    /placeholder values are forbidden.*XYGO_RELEASE/
  );
  assert.throws(
    () => assertProductionWebEnvironment(validProductionEnvironment({
      XYGO_WEB_OIDC_CLIENT_ID: "placeholder-client-id"
    })),
    /placeholder values are forbidden.*XYGO_WEB_OIDC_CLIENT_ID/
  );
});

test("worker and OIDC clock numeric bounds reject unsafe extremes", () => {
  assert.doesNotThrow(() => assertProductionWorkerEnvironment(validProductionEnvironment({
    XYGO_WORKER_INTERVAL_MS: "100",
    XYGO_WORKER_MAX_ATTEMPTS: "1",
    XYGO_WORKER_BASE_BACKOFF_MS: "100",
    XYGO_WORKER_MAX_BACKOFF_MS: "100",
    XYGO_WORKER_CONCURRENCY: "1",
    XYGO_WORKER_STALE_AFTER_MS: "1000",
    XYGO_WORKER_SHUTDOWN_TIMEOUT_MS: "1000",
    XYGO_WORKER_MAX_DEAD_JOBS: "0"
  })));
  assert.doesNotThrow(() => assertProductionWorkerEnvironment(validProductionEnvironment({
    XYGO_WORKER_INTERVAL_MS: "60000",
    XYGO_WORKER_MAX_ATTEMPTS: "20",
    XYGO_WORKER_BASE_BACKOFF_MS: "900000",
    XYGO_WORKER_MAX_BACKOFF_MS: "86400000",
    XYGO_WORKER_CONCURRENCY: "64",
    XYGO_WORKER_STALE_AFTER_MS: "3600000",
    XYGO_WORKER_SHUTDOWN_TIMEOUT_MS: "120000",
    XYGO_WORKER_MAX_DEAD_JOBS: "100000"
  })));
  assert.doesNotThrow(() => assertProductionApiEnvironment(validProductionEnvironment({
    XYGO_OIDC_CLOCK_TOLERANCE_SEC: "0"
  })));
  assert.doesNotThrow(() => assertProductionApiEnvironment(validProductionEnvironment({
    XYGO_OIDC_CLOCK_TOLERANCE_SEC: "300"
  })));

  for (const [name, values] of Object.entries({
    XYGO_WORKER_INTERVAL_MS: ["99", "60001"],
    XYGO_WORKER_MAX_ATTEMPTS: ["0", "21"],
    XYGO_WORKER_BASE_BACKOFF_MS: ["99", "900001"],
    XYGO_WORKER_MAX_BACKOFF_MS: ["99", "86400001"],
    XYGO_WORKER_CONCURRENCY: ["0", "65"],
    XYGO_WORKER_STALE_AFTER_MS: ["999", "3600001"],
    XYGO_WORKER_SHUTDOWN_TIMEOUT_MS: ["999", "120001"],
    XYGO_WORKER_MAX_DEAD_JOBS: ["-1", "100001"]
  })) {
    for (const value of values) {
      assert.throws(
        () => assertProductionWorkerEnvironment(validProductionEnvironment({ [name]: value })),
        new RegExp(name)
      );
    }
  }
  assert.throws(
    () => assertProductionWorkerEnvironment(validProductionEnvironment({
      XYGO_WORKER_BASE_BACKOFF_MS: "1000",
      XYGO_WORKER_MAX_BACKOFF_MS: "999"
    })),
    /XYGO_WORKER_MAX_BACKOFF_MS/
  );
  for (const value of ["-1", "301"]) {
    assert.throws(
      () => assertProductionApiEnvironment(validProductionEnvironment({
        XYGO_OIDC_CLOCK_TOLERANCE_SEC: value
      })),
      /XYGO_OIDC_CLOCK_TOLERANCE_SEC/
    );
  }
});

test("web login session, callback origin, cookie, and token tolerance settings fail closed", () => {
  for (const [name, value] of [
    ["XYGO_WEB_SESSION_SECRET", "weak"],
    ["XYGO_WEB_SESSION_COOKIE_NAME", "xygo-session"],
    ["XYGO_WEB_SESSION_COOKIE_SECURE", "false"],
    ["XYGO_WEB_SESSION_COOKIE_HTTP_ONLY", "false"],
    ["XYGO_WEB_SESSION_COOKIE_SAME_SITE", "none"],
    ["XYGO_WEB_REQUIRE_REFRESH_TOKEN", "false"],
    ["XYGO_WEB_ALLOWED_ORIGIN", "https://attacker-production-xygoaec-com"],
    ["XYGO_WEB_SESSION_IDLE_SEC", "299"],
    ["XYGO_WEB_SESSION_ABSOLUTE_SEC", "86401"],
    ["XYGO_WEB_AUTH_TRANSACTION_TTL_SEC", "901"],
    ["XYGO_WEB_TOKEN_REQUEST_TIMEOUT_MS", "999"],
    ["XYGO_WEB_TOKEN_CLOCK_TOLERANCE_SEC", "121"],
    ["XYGO_WEB_TOKEN_RENEW_BEFORE_SEC", "29"]
  ]) {
    assert.throws(
      () => assertProductionWebEnvironment(validProductionEnvironment({ [name]: value })),
      new RegExp(name)
    );
  }
  assert.throws(
    () => assertProductionWebEnvironment(validProductionEnvironment({
      XYGO_WEB_SESSION_IDLE_SEC: "3600",
      XYGO_WEB_SESSION_ABSOLUTE_SEC: "3600"
    })),
    /XYGO_WEB_SESSION_IDLE_SEC/
  );
  assert.throws(
    () => assertProductionWebEnvironment(validProductionEnvironment({
      XYGO_WEB_OIDC_AUTHORIZATION_ENDPOINT: "http://idp.production.xygoaec.com/authorize"
    })),
    /XYGO_WEB_OIDC_AUTHORIZATION_ENDPOINT must be an HTTPS URL/
  );
  assert.doesNotThrow(() => assertProductionWebEnvironment(validProductionEnvironment({
    XYGO_WEB_TOKEN_CLOCK_TOLERANCE_SEC: "0"
  })));
  assert.doesNotThrow(() => assertProductionWebEnvironment(validProductionEnvironment({
    XYGO_WEB_TOKEN_CLOCK_TOLERANCE_SEC: "120"
  })));
});

test("worker runtime settings have bounded local defaults and map every production control", () => {
  assert.deepEqual(workerRuntimeOptionsFromEnvironment({}), {
    intervalMs: 1000,
    maxAttempts: 5,
    baseBackoffMs: 1000,
    maxBackoffMs: 900000,
    concurrency: 4,
    staleAfterMs: 60000,
    shutdownTimeoutMs: 30000,
    maxDeadJobs: 0
  });
  assert.deepEqual(workerRuntimeOptionsFromEnvironment(validProductionEnvironment()), {
    intervalMs: 1000,
    maxAttempts: 5,
    baseBackoffMs: 1000,
    maxBackoffMs: 900000,
    concurrency: 4,
    staleAfterMs: 60000,
    shutdownTimeoutMs: 30000,
    maxDeadJobs: 0
  });
});

test("email provider and monitoring settings fail closed in production", () => {
  for (const [name, value] of [
    ["XYGO_EMAIL_TRANSPORT", "sink"],
    ["XYGO_EMAIL_RESEND_API_URL", "https://mail.production.xygoaec.com"],
    ["XYGO_EMAIL_RESEND_API_KEY", "change-me"],
    ["XYGO_EMAIL_WEBHOOK_SECRET", "short"],
    ["XYGO_EMAIL_REPLY_TO", "not-an-email"],
    ["XYGO_MONITORING_ENABLED", "false"]
  ]) {
    assert.throws(
      () => assertProductionWorkerEnvironment(validProductionEnvironment({ [name]: value })),
      (error) => error instanceof Error && error.message.includes(name)
    );
  }
  assert.throws(
    () => assertProductionApiEnvironment(validProductionEnvironment({
      XYGO_EMAIL_RESEND_API_KEY: "not-a-resend-key-but-long-enough"
    })),
    /re_ key format/
  );
  assert.throws(
    () => assertProductionApiEnvironment(validProductionEnvironment({
      XYGO_EMAIL_WEBHOOK_SECRET: "not-a-svix-secret-but-long-enough"
    })),
    /whsec_ format/
  );

  for (const [name, values] of Object.entries({
    XYGO_ALERT_OUTBOX_BACKLOG_MAX: ["-1", "1000001"],
    XYGO_ALERT_OUTBOX_OLDEST_PENDING_SEC: ["0", "86401"],
    XYGO_ALERT_EMAIL_FAILED_MAX: ["-1", "100001"],
    XYGO_ALERT_EMAIL_STALE_SEC: ["59", "604801"],
    XYGO_ALERT_DATABASE_LATENCY_MS: ["49", "30001"],
    XYGO_ALERT_WORKER_HEARTBEAT_SEC: ["4", "3601"]
  })) {
    for (const value of values) {
      assert.throws(
        () => assertProductionApiEnvironment(validProductionEnvironment({ [name]: value })),
        new RegExp(name)
      );
    }
  }
});

test("monitoring runtime defaults and production thresholds map to readiness controls", () => {
  assert.deepEqual(monitoringRuntimeOptionsFromEnvironment({}), {
    outboxBacklogMax: 1000,
    outboxOldestPendingMs: 900000,
    emailFailedMax: 0,
    emailStaleAfterMs: 900000,
    databaseLatencyMs: 2000,
    workerHeartbeatStaleMs: 120000
  });
  assert.deepEqual(monitoringRuntimeOptionsFromEnvironment(validProductionEnvironment()), {
    outboxBacklogMax: 1000,
    outboxOldestPendingMs: 900000,
    emailFailedMax: 0,
    emailStaleAfterMs: 900000,
    databaseLatencyMs: 2000,
    workerHeartbeatStaleMs: 120000
  });
});

test("Postgres pool settings use safe defaults locally and bounded explicit values in production", () => {
  assert.deepEqual(postgresPoolOptionsFromEnvironment({}), {
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000
  });
  assert.deepEqual(postgresPoolOptionsFromEnvironment({
    XYGO_PG_POOL_MAX: "1",
    XYGO_PG_IDLE_TIMEOUT_MS: "1000",
    XYGO_PG_CONNECTION_TIMEOUT_MS: "30000"
  }), {
    max: 1,
    idleTimeoutMillis: 1000,
    connectionTimeoutMillis: 30000
  });

  for (const [name, values] of Object.entries({
    XYGO_PG_POOL_MAX: ["0", "51"],
    XYGO_PG_IDLE_TIMEOUT_MS: ["999", "300001"],
    XYGO_PG_CONNECTION_TIMEOUT_MS: ["999", "30001"]
  })) {
    for (const value of values) {
      assert.throws(
        () => assertProductionApiEnvironment(validProductionEnvironment({ [name]: value })),
        new RegExp(name)
      );
      assert.throws(
        () => postgresPoolOptionsFromEnvironment({ [name]: value }),
        new RegExp(name)
      );
    }
  }
});

test("public browser variables and private secrets are explicitly disjoint", () => {
  assert.deepEqual(
    PUBLIC_WEB_RUNTIME_ENV_VARS.filter((name) => PRIVATE_PRODUCTION_ENV_VARS.includes(name)),
    []
  );
  assert.deepEqual(
    PUBLIC_WEB_RUNTIME_ENV_VARS.filter((name) => SERVER_ONLY_STORAGE_ENV_VARS.includes(name)),
    []
  );
  assert.deepEqual(
    PUBLIC_WEB_RUNTIME_ENV_VARS.filter((name) => SERVER_ONLY_OUTBOX_ENV_VARS.includes(name)),
    []
  );
  assert.deepEqual(
    PUBLIC_WEB_RUNTIME_ENV_VARS.filter((name) => SERVER_ONLY_EMAIL_MONITORING_ENV_VARS.includes(name)),
    []
  );
});

test("production example manifest names every required value and contains placeholders for secrets", () => {
  const manifest = fs.readFileSync(
    new URL("../../../config/production.env.example", import.meta.url),
    "utf8"
  );
  const names = new Set(
    manifest.split("\n")
      .filter((line) => /^[A-Z][A-Z0-9_]*=/.test(line))
      .map((line) => line.slice(0, line.indexOf("=")))
  );
  const required = new Set(Object.values(REQUIRED_PRODUCTION_ENV_VARS).flat());
  assert.deepEqual([...required].filter((name) => !names.has(name)), []);

  for (const name of PRIVATE_PRODUCTION_ENV_VARS.filter((candidate) => names.has(candidate))) {
    const line = manifest.split("\n").find((candidate) => candidate.startsWith(`${name}=`));
    assert.match(line, new RegExp(`^${name}=<secret:`));
  }
});
