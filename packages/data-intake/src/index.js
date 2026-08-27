import crypto from "node:crypto";

export const PROVIDERS = Object.freeze({
  quickbooks: { scopes: ["com.intuit.quickbooks.accounting"], category: "accounting" },
  stripe: { scopes: ["read_only"], category: "payments" },
  hubspot: { scopes: ["crm.objects.companies.read", "crm.objects.deals.read"], category: "crm" },
  google_analytics: { scopes: ["https://www.googleapis.com/auth/analytics.readonly"], category: "analytics" },
  google_sheets: { scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"], category: "spreadsheet" }
});

const CONFIDENCE = new Set(["low", "medium", "high"]);
const METRIC_KEY = /^[a-z][a-z0-9_]{1,63}$/;

function cleanMetric(input, defaults = {}) {
  const key = String(input?.key ?? "").trim().toLowerCase();
  if (!METRIC_KEY.test(key)) throw new Error("Metric key is invalid.");
  const value = Number(input?.value);
  if (!Number.isFinite(value)) throw new Error(`Metric ${key} requires a finite numeric value.`);
  const confidence = input.confidence ?? defaults.confidence ?? "medium";
  if (!CONFIDENCE.has(confidence)) throw new Error("Metric confidence is invalid.");
  return {
    key,
    value,
    unit: String(input.unit ?? "count").trim().slice(0, 32),
    period: String(input.period ?? "current").trim().slice(0, 64),
    sourceType: defaults.sourceType,
    sourceProvider: defaults.sourceProvider ?? null,
    confidence,
    observedAt: input.observedAt ?? defaults.observedAt ?? new Date().toISOString()
  };
}

export function connectorContract(provider) {
  const definition = PROVIDERS[provider];
  if (!definition) throw new Error(`Unsupported provider: ${provider}`);
  return { provider, ...definition, tokenStorage: "encrypted_server_side", passwordCollection: false, writesEnabled: false };
}

export function validateConnection({ provider, grantedScopes = [], expiresAt, revokedAt = null }) {
  const contract = connectorContract(provider);
  const missingScopes = contract.scopes.filter((scope) => !grantedScopes.includes(scope));
  const expired = !expiresAt || Date.parse(expiresAt) <= Date.now();
  const status = revokedAt ? "revoked" : missingScopes.length ? "scope_error" : expired ? "expired" : "healthy";
  return { provider, status, missingScopes, expiresAt: expiresAt ?? null, revokedAt, checkedAt: new Date().toISOString() };
}

export function parseCsvPreview(text, { maxRows = 5000 } = {}) {
  if (typeof text !== "string" || Buffer.byteLength(text) > 2_000_000) throw new Error("CSV input is missing or too large.");
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter((line) => line.trim());
  if (lines.length < 2) throw new Error("CSV requires a header and at least one row.");
  if (lines.length - 1 > maxRows) throw new Error("CSV row limit exceeded.");
  const parseLine = (line) => {
    const values = []; let current = ""; let quoted = false;
    for (let i = 0; i < line.length; i += 1) {
      const char = line[i];
      if (char === '"' && line[i + 1] === '"' && quoted) { current += '"'; i += 1; }
      else if (char === '"') quoted = !quoted;
      else if (char === "," && !quoted) { values.push(current.trim()); current = ""; }
      else current += char;
    }
    if (quoted) throw new Error("CSV contains an unterminated quoted field.");
    values.push(current.trim()); return values;
  };
  const headers = parseLine(lines[0]).map((item) => item.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, ""));
  if (headers.some((header) => !header) || new Set(headers).size !== headers.length) throw new Error("CSV headers must be unique and non-empty.");
  const rows = lines.slice(1).map((line, rowIndex) => {
    const values = parseLine(line);
    if (values.length !== headers.length) throw new Error(`CSV row ${rowIndex + 2} has the wrong column count.`);
    return Object.fromEntries(headers.map((header, index) => [header, values[index]]));
  });
  return { headers, rows, rowCount: rows.length, digest: crypto.createHash("sha256").update(text).digest("hex") };
}

export function previewMetricMapping(preview, mapping) {
  if (!preview?.headers || !mapping?.keyColumn || !mapping?.valueColumn) throw new Error("A CSV preview and key/value mapping are required.");
  if (!preview.headers.includes(mapping.keyColumn) || !preview.headers.includes(mapping.valueColumn)) throw new Error("Mapping references an unknown CSV column.");
  return preview.rows.map((row) => cleanMetric({
    key: row[mapping.keyColumn], value: row[mapping.valueColumn], unit: mapping.unitColumn ? row[mapping.unitColumn] : mapping.unit,
    period: mapping.periodColumn ? row[mapping.periodColumn] : mapping.period, confidence: mapping.confidence ?? "medium"
  }, { sourceType: "imported", sourceProvider: "csv" }));
}

export function manualMetric(input) {
  return cleanMetric(input, { sourceType: "manual", confidence: "medium" });
}

export function connectedMetrics({ provider, health, records }) {
  connectorContract(provider);
  if (health?.status !== "healthy") throw new Error(`${provider} connection is not healthy.`);
  if (!Array.isArray(records)) throw new Error("Connected records must be an array.");
  return records.map((record) => cleanMetric(record, { sourceType: "connected", sourceProvider: provider, confidence: "high", observedAt: health.checkedAt }));
}
