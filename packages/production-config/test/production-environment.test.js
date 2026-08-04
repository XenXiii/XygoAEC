import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import {
  PRIVATE_PRODUCTION_ENV_VARS,
  PUBLIC_WEB_RUNTIME_ENV_VARS,
  REQUIRED_PRODUCTION_ENV_VARS,
  assertProductionApiEnvironment,
  assertProductionWebEnvironment,
  assertProductionWorkerEnvironment
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
      XYGO_SMTP_HOST: "smtp.example.com"
    })),
    /XYGO_SMTP_HOST must not use a reserved example, test, local, invalid, or loopback hostname/
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
    XYGO_WORKER_CONCURRENCY: "1"
  })));
  assert.doesNotThrow(() => assertProductionWorkerEnvironment(validProductionEnvironment({
    XYGO_WORKER_INTERVAL_MS: "60000",
    XYGO_WORKER_MAX_ATTEMPTS: "20",
    XYGO_WORKER_BASE_BACKOFF_MS: "900000",
    XYGO_WORKER_CONCURRENCY: "64"
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
    XYGO_WORKER_CONCURRENCY: ["0", "65"]
  })) {
    for (const value of values) {
      assert.throws(
        () => assertProductionWorkerEnvironment(validProductionEnvironment({ [name]: value })),
        new RegExp(name)
      );
    }
  }
  for (const value of ["-1", "301"]) {
    assert.throws(
      () => assertProductionApiEnvironment(validProductionEnvironment({
        XYGO_OIDC_CLOCK_TOLERANCE_SEC: value
      })),
      /XYGO_OIDC_CLOCK_TOLERANCE_SEC/
    );
  }
});

test("public browser variables and private secrets are explicitly disjoint", () => {
  assert.deepEqual(
    PUBLIC_WEB_RUNTIME_ENV_VARS.filter((name) => PRIVATE_PRODUCTION_ENV_VARS.includes(name)),
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
