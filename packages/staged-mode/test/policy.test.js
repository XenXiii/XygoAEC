import test from "node:test";
import assert from "node:assert/strict";

import {
  assertNoLiveCredentialValue,
  assertNoProductionTarget,
  assertStagedMode,
  assertStagedOutboundOperation,
  createPolicyViolationRecord,
  getStagedMode
} from "../src/index.js";

test("staged mode defaults to true when config is missing", () => {
  assert.equal(getStagedMode({}), true);
});

test("staged mode cannot be disabled", () => {
  assert.throws(() => assertStagedMode({ STAGED_MODE: false }), /cannot be disabled/);
});

test("production targets are blocked", () => {
  assert.throws(
    () => assertNoProductionTarget("https://api.procore.com/v1/projects"),
    /Blocked potential production target/
  );
});

test("live credential patterns are blocked", () => {
  assert.throws(
    () => assertNoLiveCredentialValue("sk_live_123456"),
    /Blocked potential live credential pattern/
  );
});

test("outbound write methods are blocked in staged mode", () => {
  assert.throws(
    () =>
      assertStagedOutboundOperation({
        config: {},
        target: "https://docs.local.example",
        method: "POST"
      }),
    /Blocked outbound write-like method/
  );
});

test("documentation-style reads remain allowed when target is not production", () => {
  const result = assertStagedOutboundOperation({
    config: {},
    target: "https://example.invalid/docs/reference",
    method: "GET"
  });

  assert.deepEqual(result, {
    allowed: true,
    staged: true
  });
});

test("policy violation records are marked staged and timestamped", () => {
  const record = createPolicyViolationRecord({
    target: "https://api.live.example",
    reason: "manual test"
  });

  assert.equal(record.type, "staged_policy_violation");
  assert.equal(record.target, "https://api.live.example");
  assert.equal(record.reason, "manual test");
  assert.equal(record.staged, true);
  assert.ok(record.occurredAt);
});
