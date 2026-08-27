import test from "node:test";
import assert from "node:assert/strict";
import { connectedMetrics, connectorContract, manualMetric, parseCsvPreview, previewMetricMapping, validateConnection } from "../src/index.js";

test("initial connectors use least-privilege read-only contracts", () => {
  for (const provider of ["quickbooks", "stripe", "hubspot", "google_analytics", "google_sheets"]) {
    const contract = connectorContract(provider);
    assert.equal(contract.writesEnabled, false);
    assert.equal(contract.passwordCollection, false);
    assert.ok(contract.scopes.every((scope) => /read|accounting/i.test(scope)));
  }
});

test("connection health reports missing scopes, expiry, and revocation", () => {
  assert.equal(validateConnection({ provider: "stripe", grantedScopes: ["read_only"], expiresAt: "2999-01-01T00:00:00Z" }).status, "healthy");
  assert.equal(validateConnection({ provider: "hubspot", grantedScopes: [], expiresAt: "2999-01-01T00:00:00Z" }).status, "scope_error");
  assert.equal(validateConnection({ provider: "stripe", grantedScopes: ["read_only"], expiresAt: "2020-01-01T00:00:00Z" }).status, "expired");
  assert.equal(validateConnection({ provider: "stripe", grantedScopes: ["read_only"], expiresAt: "2999-01-01T00:00:00Z", revokedAt: "2026-01-01T00:00:00Z" }).status, "revoked");
});

test("CSV import previews mappings before canonical metrics are produced", () => {
  const preview = parseCsvPreview('metric,value,unit\nmonthly_revenue,12000,usd\n"open_leads",8,count');
  assert.equal(preview.rowCount, 2);
  const metrics = previewMetricMapping(preview, { keyColumn: "metric", valueColumn: "value", unitColumn: "unit" });
  assert.equal(metrics[0].sourceType, "imported");
  assert.equal(metrics[0].value, 12000);
  assert.equal(preview.rows[0].metric, "monthly_revenue");
});

test("manual and connected metrics retain source, confidence, and health", () => {
  assert.equal(manualMetric({ key: "open_leads", value: 4 }).sourceType, "manual");
  const metrics = connectedMetrics({ provider: "stripe", health: { status: "healthy", checkedAt: "2026-01-01T00:00:00Z" }, records: [{ key: "monthly_revenue", value: 1000, unit: "usd" }] });
  assert.deepEqual([metrics[0].sourceProvider, metrics[0].confidence], ["stripe", "high"]);
  assert.throws(() => connectedMetrics({ provider: "stripe", health: { status: "expired" }, records: [] }), /not healthy/);
});

test("CSV parser rejects ambiguous headers and malformed rows", () => {
  assert.throws(() => parseCsvPreview("a,a\n1,2"), /unique/);
  assert.throws(() => parseCsvPreview("a,b\n1"), /column count/);
});
