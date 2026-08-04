const PRODUCTION = "production";
const SECURE_POSTGRES_SSL_MODES = new Set(["require", "verify-ca", "verify-full"]);

export const PUBLIC_WEB_RUNTIME_ENV_VARS = Object.freeze([
  "XYGO_DEPLOY_ENVIRONMENT",
  "XYGO_RELEASE",
  "XYGO_WEB_APP_URL",
  "XYGO_WEB_API_BASE_URL",
  "XYGO_AUTH_MODE",
  "XYGO_OIDC_PROVIDER",
  "XYGO_OIDC_ISSUER",
  "XYGO_OIDC_AUDIENCE",
  "XYGO_WEB_OIDC_CLIENT_ID",
  "XYGO_WEB_OIDC_AUTHORIZATION_ENDPOINT",
  "XYGO_WEB_OIDC_TOKEN_ENDPOINT",
  "XYGO_WEB_OIDC_END_SESSION_ENDPOINT",
  "XYGO_WEB_OIDC_SCOPES",
  "XYGO_WEB_MONITORING_ENDPOINT"
]);

export const PRIVATE_PRODUCTION_ENV_VARS = Object.freeze([
  "XYGO_API_PG_URL",
  "XYGO_AUDIT_SIGNING_KEY",
  "XYGO_SMTP_USERNAME",
  "XYGO_SMTP_PASSWORD",
  "XYGO_STORAGE_ACCESS_KEY_ID",
  "XYGO_STORAGE_SECRET_ACCESS_KEY",
  "XYGO_MONITORING_AUTH_TOKEN",
  "XYGO_OIDC_BINDING_ADMIN_TOKEN"
]);

const API_REQUIRED_ENV_VARS = Object.freeze([
  "NODE_ENV",
  "STAGED_MODE",
  "XYGO_DEPLOY_ENVIRONMENT",
  "XYGO_RELEASE",
  "XYGO_AUTH_MODE",
  "XYGO_API_REPOSITORY_MODE",
  "XYGO_API_PG_URL",
  "XYGO_OIDC_PROVIDER",
  "XYGO_OIDC_ISSUER",
  "XYGO_OIDC_AUDIENCE",
  "XYGO_OIDC_JWKS_URI",
  "XYGO_OIDC_ALLOWED_ALGORITHMS",
  "XYGO_OIDC_CLOCK_TOLERANCE_SEC",
  "XYGO_AUDIT_SIGNING_KEY",
  "XYGO_WEB_APP_URL",
  "XYGO_WEB_API_BASE_URL",
  "XYGO_EMAIL_TRANSPORT",
  "XYGO_EMAIL_FROM",
  "XYGO_SMTP_HOST",
  "XYGO_SMTP_PORT",
  "XYGO_SMTP_USERNAME",
  "XYGO_SMTP_PASSWORD",
  "XYGO_STORAGE_DRIVER",
  "XYGO_STORAGE_BUCKET",
  "XYGO_STORAGE_REGION",
  "XYGO_STORAGE_ENDPOINT",
  "XYGO_STORAGE_ACCESS_KEY_ID",
  "XYGO_STORAGE_SECRET_ACCESS_KEY",
  "XYGO_OUTBOX_BACKEND",
  "XYGO_MONITORING_OTLP_ENDPOINT",
  "XYGO_MONITORING_AUTH_TOKEN"
]);

const WEB_REQUIRED_ENV_VARS = Object.freeze([
  "NODE_ENV",
  "STAGED_MODE",
  ...PUBLIC_WEB_RUNTIME_ENV_VARS
]);

const WORKER_REQUIRED_ENV_VARS = Object.freeze([
  "NODE_ENV",
  "STAGED_MODE",
  "XYGO_DEPLOY_ENVIRONMENT",
  "XYGO_RELEASE",
  "XYGO_API_PG_URL",
  "XYGO_AUDIT_SIGNING_KEY",
  "XYGO_WEB_APP_URL",
  "XYGO_EMAIL_TRANSPORT",
  "XYGO_EMAIL_FROM",
  "XYGO_SMTP_HOST",
  "XYGO_SMTP_PORT",
  "XYGO_SMTP_USERNAME",
  "XYGO_SMTP_PASSWORD",
  "XYGO_STORAGE_DRIVER",
  "XYGO_STORAGE_BUCKET",
  "XYGO_STORAGE_REGION",
  "XYGO_STORAGE_ENDPOINT",
  "XYGO_STORAGE_ACCESS_KEY_ID",
  "XYGO_STORAGE_SECRET_ACCESS_KEY",
  "XYGO_OUTBOX_BACKEND",
  "XYGO_WORKER_INTERVAL_MS",
  "XYGO_WORKER_MAX_ATTEMPTS",
  "XYGO_WORKER_BASE_BACKOFF_MS",
  "XYGO_WORKER_CONCURRENCY",
  "XYGO_MONITORING_OTLP_ENDPOINT",
  "XYGO_MONITORING_AUTH_TOKEN"
]);

export const REQUIRED_PRODUCTION_ENV_VARS = Object.freeze({
  api: API_REQUIRED_ENV_VARS,
  web: WEB_REQUIRED_ENV_VARS,
  worker: WORKER_REQUIRED_ENV_VARS
});

function normalizedString(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function fail(service, message) {
  throw new Error(`Production ${service} configuration error: ${message}`);
}

function requireValues(env, names, service) {
  const missing = names.filter((name) => !normalizedString(env[name]));
  if (missing.length > 0) {
    fail(service, `missing required environment variables: ${missing.join(", ")}.`);
  }
  const placeholders = names.filter((name) => /^<.*>$/.test(normalizedString(env[name])));
  if (placeholders.length > 0) {
    fail(service, `placeholder values are forbidden for: ${placeholders.join(", ")}.`);
  }
}

function requireExact(env, name, expected, service) {
  if (normalizedString(env[name]) !== expected) {
    fail(service, `${name} must be ${expected}.`);
  }
}

function requireHttpsUrl(env, name, service, { allowQuery = false } = {}) {
  let url;
  try {
    url = new URL(normalizedString(env[name]));
  } catch {
    fail(service, `${name} must be an absolute HTTPS URL.`);
  }
  if (
    url.protocol !== "https:" ||
    !url.hostname ||
    url.username ||
    url.password ||
    url.hash ||
    (!allowQuery && url.search)
  ) {
    fail(service, `${name} must be an HTTPS URL without credentials, a fragment, or unsupported URL components.`);
  }
}

function requirePostgresUrl(env, service) {
  let url;
  try {
    url = new URL(normalizedString(env.XYGO_API_PG_URL));
  } catch {
    fail(service, "XYGO_API_PG_URL must be a valid PostgreSQL connection URL.");
  }
  if (!new Set(["postgres:", "postgresql:"]).has(url.protocol) || !url.hostname) {
    fail(service, "XYGO_API_PG_URL must use the postgres or postgresql scheme and name a host.");
  }
  if (!SECURE_POSTGRES_SSL_MODES.has(url.searchParams.get("sslmode"))) {
    fail(service, "XYGO_API_PG_URL must set sslmode=require, verify-ca, or verify-full.");
  }
}

function requireSecret(env, name, service, minimumLength = 32) {
  const secret = normalizedString(env[name]);
  if (
    !secret ||
    secret.length < minimumLength ||
    /^<.*>$/.test(secret) ||
    /^(change-?me|replace-?me|example|placeholder)/i.test(secret)
  ) {
    fail(service, `${name} must be a non-placeholder secret of at least ${minimumLength} characters.`);
  }
}

function requireInteger(env, name, service, { minimum = 1, maximum = Number.MAX_SAFE_INTEGER } = {}) {
  const raw = normalizedString(env[name]);
  const value = Number(raw);
  if (!/^\d+$/.test(raw ?? "") || !Number.isSafeInteger(value) || value < minimum || value > maximum) {
    fail(service, `${name} must be an integer between ${minimum} and ${maximum}.`);
  }
}

function requireEmail(env, service) {
  const value = normalizedString(env.XYGO_EMAIL_FROM);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value ?? "")) {
    fail(service, "XYGO_EMAIL_FROM must be a valid email address.");
  }
}

function assertProductionBaseline(env, names, service) {
  if (!isProductionEnvironment(env)) return false;
  requireValues(env, names, service);
  requireExact(env, "NODE_ENV", PRODUCTION, service);
  requireExact(env, "STAGED_MODE", "false", service);
  requireExact(env, "XYGO_DEPLOY_ENVIRONMENT", PRODUCTION, service);
  return true;
}

function assertBackendServices(env, service) {
  requirePostgresUrl(env, service);
  requireSecret(env, "XYGO_AUDIT_SIGNING_KEY", service);
  requireExact(env, "XYGO_EMAIL_TRANSPORT", "smtp", service);
  requireEmail(env, service);
  requireInteger(env, "XYGO_SMTP_PORT", service, { maximum: 65_535 });
  requireSecret(env, "XYGO_SMTP_PASSWORD", service, 16);
  requireExact(env, "XYGO_STORAGE_DRIVER", "s3", service);
  requireHttpsUrl(env, "XYGO_STORAGE_ENDPOINT", service);
  requireSecret(env, "XYGO_STORAGE_SECRET_ACCESS_KEY", service, 16);
  requireExact(env, "XYGO_OUTBOX_BACKEND", "postgres", service);
  requireHttpsUrl(env, "XYGO_MONITORING_OTLP_ENDPOINT", service);
  requireSecret(env, "XYGO_MONITORING_AUTH_TOKEN", service, 16);
}

export function isProductionEnvironment(env = process.env) {
  return normalizedString(env.NODE_ENV)?.toLowerCase() === PRODUCTION || normalizedString(env.STAGED_MODE) === "false";
}

export function assertProductionApiEnvironment(env = process.env) {
  if (!assertProductionBaseline(env, API_REQUIRED_ENV_VARS, "API")) return;
  requireExact(env, "XYGO_AUTH_MODE", "oidc", "API");
  requireExact(env, "XYGO_API_REPOSITORY_MODE", "postgres", "API");
  requireHttpsUrl(env, "XYGO_OIDC_ISSUER", "API");
  requireHttpsUrl(env, "XYGO_OIDC_JWKS_URI", "API", { allowQuery: true });
  requireHttpsUrl(env, "XYGO_WEB_APP_URL", "API");
  requireHttpsUrl(env, "XYGO_WEB_API_BASE_URL", "API");
  requireInteger(env, "XYGO_OIDC_CLOCK_TOLERANCE_SEC", "API", { minimum: 0, maximum: 300 });
  assertBackendServices(env, "API");
}

export function assertProductionWebEnvironment(env = process.env) {
  if (!assertProductionBaseline(env, WEB_REQUIRED_ENV_VARS, "web")) return;
  requireExact(env, "XYGO_AUTH_MODE", "oidc", "web");
  requireHttpsUrl(env, "XYGO_WEB_APP_URL", "web");
  requireHttpsUrl(env, "XYGO_WEB_API_BASE_URL", "web");
  requireHttpsUrl(env, "XYGO_OIDC_ISSUER", "web");
  requireHttpsUrl(env, "XYGO_WEB_OIDC_AUTHORIZATION_ENDPOINT", "web", { allowQuery: true });
  requireHttpsUrl(env, "XYGO_WEB_OIDC_TOKEN_ENDPOINT", "web", { allowQuery: true });
  requireHttpsUrl(env, "XYGO_WEB_OIDC_END_SESSION_ENDPOINT", "web", { allowQuery: true });
  requireHttpsUrl(env, "XYGO_WEB_MONITORING_ENDPOINT", "web");
}

export function assertProductionWorkerEnvironment(env = process.env) {
  if (!assertProductionBaseline(env, WORKER_REQUIRED_ENV_VARS, "worker")) return;
  requireHttpsUrl(env, "XYGO_WEB_APP_URL", "worker");
  assertBackendServices(env, "worker");
  requireInteger(env, "XYGO_WORKER_INTERVAL_MS", "worker", { maximum: 300_000 });
  requireInteger(env, "XYGO_WORKER_MAX_ATTEMPTS", "worker", { maximum: 100 });
  requireInteger(env, "XYGO_WORKER_BASE_BACKOFF_MS", "worker", { maximum: 3_600_000 });
  requireInteger(env, "XYGO_WORKER_CONCURRENCY", "worker", { maximum: 1_000 });
}
