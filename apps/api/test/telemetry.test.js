import test from "node:test";
import assert from "node:assert/strict";

import { createLogger } from "../src/telemetry/logger.js";
import { createMetrics } from "../src/telemetry/metrics.js";

test("logger emits structured JSON with merged base fields", () => {
  const lines = [];
  const logger = createLogger({ sink: (l) => lines.push(l), clock: () => "2026-07-12T00:00:00.000Z" });

  logger.info("hello", { a: 1 });
  const child = logger.child({ requestId: "req-1" });
  child.warn("careful", { b: 2 });

  const first = JSON.parse(lines[0]);
  assert.equal(first.level, "info");
  assert.equal(first.msg, "hello");
  assert.equal(first.a, 1);
  assert.equal(first.ts, "2026-07-12T00:00:00.000Z");

  const second = JSON.parse(lines[1]);
  assert.equal(second.level, "warn");
  assert.equal(second.requestId, "req-1");
  assert.equal(second.b, 2);
});

test("metrics count requests and expose Prometheus text", () => {
  const metrics = createMetrics();
  metrics.recordRequest({ method: "GET", status: 200, durationMs: 12 });
  metrics.recordRequest({ method: "GET", status: 200, durationMs: 40 });
  metrics.recordRequest({ method: "POST", status: 403, durationMs: 3 });

  const text = metrics.render();
  assert.match(text, /xygo_http_requests_total\{method="GET",status="200"\} 2/);
  assert.match(text, /xygo_http_requests_total\{method="POST",status="403"\} 1/);
  assert.match(text, /xygo_http_request_duration_ms_count 3/);
  assert.match(text, /# TYPE xygo_http_request_duration_ms histogram/);
});
