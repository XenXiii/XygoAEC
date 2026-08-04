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
      XYGO_API_PG_URL: "postgresql://xygo:password@db.xygo.invalid/xygo"
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
      XYGO_STORAGE_ENDPOINT: "http://storage.xygo.invalid"
    })),
    /XYGO_STORAGE_ENDPOINT must be an HTTPS URL/
  );
  assert.throws(
    () => assertProductionWebEnvironment(validProductionEnvironment({
      XYGO_WEB_APP_URL: "http://app.xygo.invalid"
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
