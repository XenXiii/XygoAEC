import { storageConfigurationFromEnvironment } from "../../file-storage/src/index.js";

const PRODUCTION = "production";
const SECURE_POSTGRES_SSL_MODES = new Set(["require", "verify-ca", "verify-full"]);
const RESERVED_PRODUCTION_HOST_SUFFIXES = Object.freeze([
  ".example",
  ".invalid",
  ".test",
  ".localhost",
  ".local",
  ".example.com",
  ".example.net",
  ".example.org"
]);
export const WORKER_NUMERIC_LIMITS = Object.freeze({
  XYGO_WORKER_INTERVAL_MS: { minimum: 100, maximum: 60_000 },
  XYGO_WORKER_MAX_ATTEMPTS: { minimum: 1, maximum: 20 },
  XYGO_WORKER_BASE_BACKOFF_MS: { minimum: 100, maximum: 900_000 },
  XYGO_WORKER_MAX_BACKOFF_MS: { minimum: 100, maximum: 86_400_000 },
  XYGO_WORKER_CONCURRENCY: { minimum: 1, maximum: 64 },
  XYGO_WORKER_STALE_AFTER_MS: { minimum: 1_000, maximum: 3_600_000 },
  XYGO_WORKER_SHUTDOWN_TIMEOUT_MS: { minimum: 1_000, maximum: 120_000 },
  XYGO_WORKER_MAX_DEAD_JOBS: { minimum: 0, maximum: 100_000 }
});
export const MONITORING_NUMERIC_LIMITS = Object.freeze({
  XYGO_ALERT_OUTBOX_BACKLOG_MAX: { minimum: 0, maximum: 1_000_000 },
  XYGO_ALERT_OUTBOX_OLDEST_PENDING_SEC: { minimum: 1, maximum: 86_400 },
  XYGO_ALERT_EMAIL_FAILED_MAX: { minimum: 0, maximum: 100_000 },
  XYGO_ALERT_EMAIL_STALE_SEC: { minimum: 60, maximum: 604_800 },
  XYGO_ALERT_DATABASE_LATENCY_MS: { minimum: 50, maximum: 30_000 },
  XYGO_ALERT_WORKER_HEARTBEAT_SEC: { minimum: 5, maximum: 3_600 }
});
export const POSTGRES_POOL_ENVIRONMENT = Object.freeze({
  XYGO_PG_POOL_MAX: { option: "max", defaultValue: 10, minimum: 1, maximum: 50 },
  XYGO_PG_IDLE_TIMEOUT_MS: {
    option: "idleTimeoutMillis",
    defaultValue: 30_000,
    minimum: 1_000,
    maximum: 300_000
  },
  XYGO_PG_CONNECTION_TIMEOUT_MS: {
    option: "connectionTimeoutMillis",
    defaultValue: 5_000,
    minimum: 1_000,
    maximum: 30_000
  }
});
const POSTGRES_POOL_ENV_VARS = Object.freeze(Object.keys(POSTGRES_POOL_ENVIRONMENT));

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
  "XYGO_WEB_TOKEN_RENEW_BEFORE_SEC",
  "XYGO_WEB_MONITORING_ENDPOINT"
]);

export const PRIVATE_PRODUCTION_ENV_VARS = Object.freeze([
  "XYGO_API_PG_URL",
  "XYGO_AUDIT_SIGNING_KEY",
  "XYGO_EMAIL_RESEND_API_KEY",
  "XYGO_EMAIL_WEBHOOK_SECRET",
  "XYGO_STORAGE_ACCESS_KEY_ID",
  "XYGO_STORAGE_SECRET_ACCESS_KEY",
  "XYGO_MONITORING_AUTH_TOKEN",
  "XYGO_OIDC_BINDING_ADMIN_TOKEN",
  "XYGO_WEB_SESSION_SECRET",
  "XYGO_WEB_SESSION_ENCRYPTION_KEY",
  "XYGO_WEB_SESSION_PG_URL"
]);

export const SERVER_ONLY_WEB_AUTH_ENV_VARS = Object.freeze([
  "XYGO_WEB_SESSION_SECRET",
  "XYGO_WEB_SESSION_ENCRYPTION_KEY",
  "XYGO_WEB_SESSION_STORE",
  "XYGO_WEB_SESSION_PG_URL",
  "XYGO_WEB_SESSION_COOKIE_NAME",
  "XYGO_WEB_SESSION_COOKIE_SECURE",
  "XYGO_WEB_SESSION_COOKIE_HTTP_ONLY",
  "XYGO_WEB_SESSION_COOKIE_SAME_SITE",
  "XYGO_WEB_SESSION_IDLE_SEC",
  "XYGO_WEB_SESSION_ABSOLUTE_SEC",
  "XYGO_WEB_AUTH_TRANSACTION_TTL_SEC",
  "XYGO_WEB_TOKEN_REQUEST_TIMEOUT_MS",
  "XYGO_WEB_TOKEN_CLOCK_TOLERANCE_SEC",
  "XYGO_WEB_REQUIRE_REFRESH_TOKEN",
  "XYGO_WEB_ALLOWED_ORIGIN"
]);

export const SERVER_ONLY_EMAIL_MONITORING_ENV_VARS = Object.freeze([
  "XYGO_EMAIL_TRANSPORT",
  "XYGO_EMAIL_FROM",
  "XYGO_EMAIL_REPLY_TO",
  "XYGO_EMAIL_RESEND_API_URL",
  "XYGO_EMAIL_RESEND_API_KEY",
  "XYGO_EMAIL_WEBHOOK_SECRET",
  "XYGO_EMAIL_REQUEST_TIMEOUT_MS",
  "XYGO_EMAIL_SINK_PATH",
  "XYGO_MONITORING_ENABLED",
  "XYGO_MONITORING_OTLP_ENDPOINT",
  "XYGO_MONITORING_AUTH_TOKEN",
  ...Object.keys(MONITORING_NUMERIC_LIMITS)
]);

export const SERVER_ONLY_STORAGE_ENV_VARS = Object.freeze([
  "XYGO_STORAGE_DRIVER",
  "XYGO_STORAGE_BUCKET",
  "XYGO_STORAGE_REGION",
  "XYGO_STORAGE_ENDPOINT",
  "XYGO_STORAGE_ACCESS_KEY_ID",
  "XYGO_STORAGE_SECRET_ACCESS_KEY",
  "XYGO_STORAGE_FORCE_PATH_STYLE",
  "XYGO_STORAGE_PUBLIC_ACCESS",
  "XYGO_STORAGE_SERVER_SIDE_ENCRYPTION",
  "XYGO_STORAGE_MAX_FILE_BYTES",
  "XYGO_STORAGE_ALLOWED_MIME_TYPES",
  "XYGO_STORAGE_SIGNED_URL_TTL_SEC",
  "XYGO_STORAGE_RETENTION_DAYS"
]);

export const SERVER_ONLY_OUTBOX_ENV_VARS = Object.freeze([
  "XYGO_OUTBOX_BACKEND",
  ...Object.keys(WORKER_NUMERIC_LIMITS)
]);

const API_REQUIRED_ENV_VARS = Object.freeze([
  "NODE_ENV",
  "STAGED_MODE",
  "XYGO_DEPLOY_ENVIRONMENT",
  "XYGO_RELEASE",
  "XYGO_AUTH_MODE",
  "XYGO_API_REPOSITORY_MODE",
  "XYGO_API_PG_URL",
  ...POSTGRES_POOL_ENV_VARS,
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
  "XYGO_EMAIL_REPLY_TO",
  "XYGO_EMAIL_RESEND_API_URL",
  "XYGO_EMAIL_RESEND_API_KEY",
  "XYGO_EMAIL_WEBHOOK_SECRET",
  "XYGO_EMAIL_REQUEST_TIMEOUT_MS",
  "XYGO_STORAGE_DRIVER",
  "XYGO_STORAGE_BUCKET",
  "XYGO_STORAGE_REGION",
  "XYGO_STORAGE_ENDPOINT",
  "XYGO_STORAGE_ACCESS_KEY_ID",
  "XYGO_STORAGE_SECRET_ACCESS_KEY",
  "XYGO_STORAGE_FORCE_PATH_STYLE",
  "XYGO_STORAGE_PUBLIC_ACCESS",
  "XYGO_STORAGE_SERVER_SIDE_ENCRYPTION",
  "XYGO_STORAGE_MAX_FILE_BYTES",
  "XYGO_STORAGE_ALLOWED_MIME_TYPES",
  "XYGO_STORAGE_SIGNED_URL_TTL_SEC",
  "XYGO_STORAGE_RETENTION_DAYS",
  "XYGO_OUTBOX_BACKEND",
  "XYGO_MONITORING_ENABLED",
  "XYGO_MONITORING_OTLP_ENDPOINT",
  "XYGO_MONITORING_AUTH_TOKEN",
  ...Object.keys(MONITORING_NUMERIC_LIMITS)
]);

const WEB_REQUIRED_ENV_VARS = Object.freeze([
  "NODE_ENV",
  "STAGED_MODE",
  ...PUBLIC_WEB_RUNTIME_ENV_VARS,
  ...SERVER_ONLY_WEB_AUTH_ENV_VARS
]);

const WORKER_REQUIRED_ENV_VARS = Object.freeze([
  "NODE_ENV",
  "STAGED_MODE",
  "XYGO_DEPLOY_ENVIRONMENT",
  "XYGO_RELEASE",
  "XYGO_API_PG_URL",
  ...POSTGRES_POOL_ENV_VARS,
  "XYGO_AUDIT_SIGNING_KEY",
  "XYGO_WEB_APP_URL",
  "XYGO_EMAIL_TRANSPORT",
  "XYGO_EMAIL_FROM",
  "XYGO_EMAIL_REPLY_TO",
  "XYGO_EMAIL_RESEND_API_URL",
  "XYGO_EMAIL_RESEND_API_KEY",
  "XYGO_EMAIL_WEBHOOK_SECRET",
  "XYGO_EMAIL_REQUEST_TIMEOUT_MS",
  "XYGO_STORAGE_DRIVER",
  "XYGO_STORAGE_BUCKET",
  "XYGO_STORAGE_REGION",
  "XYGO_STORAGE_ENDPOINT",
  "XYGO_STORAGE_ACCESS_KEY_ID",
  "XYGO_STORAGE_SECRET_ACCESS_KEY",
  "XYGO_STORAGE_FORCE_PATH_STYLE",
  "XYGO_STORAGE_PUBLIC_ACCESS",
  "XYGO_STORAGE_SERVER_SIDE_ENCRYPTION",
  "XYGO_STORAGE_MAX_FILE_BYTES",
  "XYGO_STORAGE_ALLOWED_MIME_TYPES",
  "XYGO_STORAGE_SIGNED_URL_TTL_SEC",
  "XYGO_STORAGE_RETENTION_DAYS",
  "XYGO_OUTBOX_BACKEND",
  "XYGO_WORKER_INTERVAL_MS",
  "XYGO_WORKER_MAX_ATTEMPTS",
  "XYGO_WORKER_BASE_BACKOFF_MS",
  "XYGO_WORKER_MAX_BACKOFF_MS",
  "XYGO_WORKER_CONCURRENCY",
  "XYGO_WORKER_STALE_AFTER_MS",
  "XYGO_WORKER_SHUTDOWN_TIMEOUT_MS",
  "XYGO_WORKER_MAX_DEAD_JOBS",
  "XYGO_MONITORING_ENABLED",
  "XYGO_MONITORING_OTLP_ENDPOINT",
  "XYGO_MONITORING_AUTH_TOKEN",
  ...Object.keys(MONITORING_NUMERIC_LIMITS)
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

function isPlaceholderValue(value) {
  const normalized = normalizedString(value);
  return Boolean(
    normalized && (
      /^<.*>$/.test(normalized) ||
      /^(change-?me|replace-?me|example|placeholder|sample|todo|tbd)(?:$|[-_: ])/i.test(normalized) ||
      /^your(?:$|[-_: ])/i.test(normalized)
    )
  );
}

function requireProductionHostname(hostname, name, service) {
  const normalized = String(hostname ?? "").toLowerCase().replace(/\.$/, "");
  const reserved =
    normalized === "localhost" ||
    normalized === "example.com" ||
    normalized === "example.net" ||
    normalized === "example.org" ||
    normalized === "0.0.0.0" ||
    normalized.startsWith("127.") ||
    normalized === "[::1]" ||
    normalized === "[::]" ||
    normalized.split(".").some((label) => /^(example|sample|placeholder)(?:$|-)/.test(label)) ||
    RESERVED_PRODUCTION_HOST_SUFFIXES.some((suffix) => normalized.endsWith(suffix));
  if (reserved) {
    fail(service, `${name} must not use a reserved example, test, local, invalid, or loopback hostname.`);
  }
}

function requireValues(env, names, service) {
  const missing = names.filter((name) => !normalizedString(env[name]));
  if (missing.length > 0) {
    fail(service, `missing required environment variables: ${missing.join(", ")}.`);
  }
  const placeholders = names.filter((name) => isPlaceholderValue(env[name]));
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
  requireProductionHostname(url.hostname, name, service);
}

function requirePostgresUrl(env, service, name = "XYGO_API_PG_URL") {
  let url;
  try {
    url = new URL(normalizedString(env[name]));
  } catch {
    fail(service, `${name} must be a valid PostgreSQL connection URL.`);
  }
  if (!new Set(["postgres:", "postgresql:"]).has(url.protocol) || !url.hostname) {
    fail(service, `${name} must use the postgres or postgresql scheme and name a host.`);
  }
  requireProductionHostname(url.hostname, name, service);
  if (!SECURE_POSTGRES_SSL_MODES.has(url.searchParams.get("sslmode"))) {
    fail(service, `${name} must set sslmode=require, verify-ca, or verify-full.`);
  }
}

function requireSecret(env, name, service, minimumLength = 32) {
  const secret = normalizedString(env[name]);
  if (
    !secret ||
    secret.length < minimumLength ||
    isPlaceholderValue(secret)
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

export function postgresPoolOptionsFromEnvironment(env = {}) {
  const options = {};
  for (const [name, specification] of Object.entries(POSTGRES_POOL_ENVIRONMENT)) {
    const raw = normalizedString(env[name]) ?? String(specification.defaultValue);
    const value = Number(raw);
    if (
      !/^\d+$/.test(raw) ||
      !Number.isSafeInteger(value) ||
      value < specification.minimum ||
      value > specification.maximum
    ) {
      throw new Error(
        `Postgres pool configuration error: ${name} must be an integer between ` +
        `${specification.minimum} and ${specification.maximum}.`
      );
    }
    options[specification.option] = value;
  }
  return options;
}

export function workerRuntimeOptionsFromEnvironment(env = {}) {
  const defaults = {
    XYGO_WORKER_INTERVAL_MS: 1000,
    XYGO_WORKER_MAX_ATTEMPTS: 5,
    XYGO_WORKER_BASE_BACKOFF_MS: 1000,
    XYGO_WORKER_MAX_BACKOFF_MS: 900_000,
    XYGO_WORKER_CONCURRENCY: 4,
    XYGO_WORKER_STALE_AFTER_MS: 60_000,
    XYGO_WORKER_SHUTDOWN_TIMEOUT_MS: 30_000,
    XYGO_WORKER_MAX_DEAD_JOBS: 0
  };
  const values = {};
  for (const [name, bounds] of Object.entries(WORKER_NUMERIC_LIMITS)) {
    const raw = normalizedString(env[name]) ?? String(defaults[name]);
    const value = Number(raw);
    if (!/^\d+$/.test(raw) || !Number.isSafeInteger(value) || value < bounds.minimum || value > bounds.maximum) {
      throw new Error(`Worker configuration error: ${name} must be an integer between ${bounds.minimum} and ${bounds.maximum}.`);
    }
    values[name] = value;
  }
  if (values.XYGO_WORKER_MAX_BACKOFF_MS < values.XYGO_WORKER_BASE_BACKOFF_MS) {
    throw new Error("Worker configuration error: XYGO_WORKER_MAX_BACKOFF_MS must be greater than or equal to XYGO_WORKER_BASE_BACKOFF_MS.");
  }
  return {
    intervalMs: values.XYGO_WORKER_INTERVAL_MS,
    maxAttempts: values.XYGO_WORKER_MAX_ATTEMPTS,
    baseBackoffMs: values.XYGO_WORKER_BASE_BACKOFF_MS,
    maxBackoffMs: values.XYGO_WORKER_MAX_BACKOFF_MS,
    concurrency: values.XYGO_WORKER_CONCURRENCY,
    staleAfterMs: values.XYGO_WORKER_STALE_AFTER_MS,
    shutdownTimeoutMs: values.XYGO_WORKER_SHUTDOWN_TIMEOUT_MS,
    maxDeadJobs: values.XYGO_WORKER_MAX_DEAD_JOBS
  };
}

export function monitoringRuntimeOptionsFromEnvironment(env = {}) {
  const defaults = {
    XYGO_ALERT_OUTBOX_BACKLOG_MAX: 1000,
    XYGO_ALERT_OUTBOX_OLDEST_PENDING_SEC: 900,
    XYGO_ALERT_EMAIL_FAILED_MAX: 0,
    XYGO_ALERT_EMAIL_STALE_SEC: 900,
    XYGO_ALERT_DATABASE_LATENCY_MS: 2000,
    XYGO_ALERT_WORKER_HEARTBEAT_SEC: 120
  };
  const values = {};
  for (const [name, bounds] of Object.entries(MONITORING_NUMERIC_LIMITS)) {
    const raw = normalizedString(env[name]) ?? String(defaults[name]);
    const value = Number(raw);
    if (!/^\d+$/.test(raw) || !Number.isSafeInteger(value) || value < bounds.minimum || value > bounds.maximum) {
      throw new Error(`Monitoring configuration error: ${name} must be an integer between ${bounds.minimum} and ${bounds.maximum}.`);
    }
    values[name] = value;
  }
  return {
    outboxBacklogMax: values.XYGO_ALERT_OUTBOX_BACKLOG_MAX,
    outboxOldestPendingMs: values.XYGO_ALERT_OUTBOX_OLDEST_PENDING_SEC * 1000,
    emailFailedMax: values.XYGO_ALERT_EMAIL_FAILED_MAX,
    emailStaleAfterMs: values.XYGO_ALERT_EMAIL_STALE_SEC * 1000,
    databaseLatencyMs: values.XYGO_ALERT_DATABASE_LATENCY_MS,
    workerHeartbeatStaleMs: values.XYGO_ALERT_WORKER_HEARTBEAT_SEC * 1000
  };
}

function requireEmail(env, service) {
  const mailbox = normalizedString(env.XYGO_EMAIL_FROM);
  const bracketed = mailbox?.match(/^.{1,200}\s<([^<>]+)>$/);
  const value = bracketed?.[1] ?? mailbox;
  if (!validEmailAddress(value)) {
    fail(service, "XYGO_EMAIL_FROM must be a valid email address.");
  }
  requireProductionHostname(value.slice(value.lastIndexOf("@") + 1), "XYGO_EMAIL_FROM", service);
  const replyTo = normalizedString(env.XYGO_EMAIL_REPLY_TO);
  if (!validEmailAddress(replyTo)) {
    fail(service, "XYGO_EMAIL_REPLY_TO must be a valid email address.");
  }
  requireProductionHostname(replyTo.slice(replyTo.lastIndexOf("@") + 1), "XYGO_EMAIL_REPLY_TO", service);
}

function validEmailAddress(value) {
  if (!value || value.length > 320) return false;
  const at = value.indexOf("@");
  if (at < 1 || at !== value.lastIndexOf("@") || at > 64) return false;
  const domain = value.slice(at + 1);
  if (domain.length < 3 || domain.startsWith(".") || domain.endsWith(".") || !domain.includes(".")) return false;
  for (const character of value) {
    if (character === " " || character === "\t" || character === "\r" || character === "\n") return false;
  }
  return true;
}

function requireHostValue(env, name, service) {
  const value = normalizedString(env[name]);
  if (!/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/i.test(value ?? "") || value.includes("..")) {
    fail(service, `${name} must be a hostname without a scheme, credentials, path, or port.`);
  }
  requireProductionHostname(value, name, service);
}

function rejectReservedUrlAudience(env, service) {
  const value = normalizedString(env.XYGO_OIDC_AUDIENCE);
  let url;
  try {
    url = new URL(value);
  } catch {
    // OIDC audiences may be opaque identifiers rather than URLs.
    return;
  }
  if (url.hostname) {
    requireProductionHostname(url.hostname, "XYGO_OIDC_AUDIENCE", service);
  }
}

function assertProductionBaseline(env, names, service) {
  if (!isProductionEnvironment(env)) return false;
  requireValues(env, names, service);
  requireExact(env, "NODE_ENV", PRODUCTION, service);
  requireExact(env, "STAGED_MODE", "false", service);
  if (!["staging", PRODUCTION].includes(normalizedString(env.XYGO_DEPLOY_ENVIRONMENT))) {
    fail(service, "XYGO_DEPLOY_ENVIRONMENT must be staging or production.");
  }
  return true;
}

function assertBackendServices(env, service) {
  requirePostgresUrl(env, service);
  for (const [name, bounds] of Object.entries(POSTGRES_POOL_ENVIRONMENT)) {
    requireInteger(env, name, service, bounds);
  }
  requireSecret(env, "XYGO_AUDIT_SIGNING_KEY", service);
  requireExact(env, "XYGO_EMAIL_TRANSPORT", "resend", service);
  requireEmail(env, service);
  requireExact(env, "XYGO_EMAIL_RESEND_API_URL", "https://api.resend.com", service);
  requireSecret(env, "XYGO_EMAIL_RESEND_API_KEY", service, 16);
  requireSecret(env, "XYGO_EMAIL_WEBHOOK_SECRET", service, 24);
  if (!/^re_[A-Za-z0-9_-]{12,}$/.test(normalizedString(env.XYGO_EMAIL_RESEND_API_KEY))) {
    fail(service, "XYGO_EMAIL_RESEND_API_KEY must use the Resend re_ key format.");
  }
  if (!/^whsec_[A-Za-z0-9+/=_-]{16,}$/.test(normalizedString(env.XYGO_EMAIL_WEBHOOK_SECRET))) {
    fail(service, "XYGO_EMAIL_WEBHOOK_SECRET must use the signed-webhook whsec_ format.");
  }
  requireInteger(env, "XYGO_EMAIL_REQUEST_TIMEOUT_MS", service, { minimum: 1_000, maximum: 30_000 });
  requireExact(env, "XYGO_STORAGE_DRIVER", "s3", service);
  try {
    storageConfigurationFromEnvironment(env);
  } catch (error) {
    fail(service, error.message);
  }
  requireExact(env, "XYGO_OUTBOX_BACKEND", "postgres", service);
  requireExact(env, "XYGO_MONITORING_ENABLED", "true", service);
  requireHttpsUrl(env, "XYGO_MONITORING_OTLP_ENDPOINT", service);
  requireSecret(env, "XYGO_MONITORING_AUTH_TOKEN", service, 16);
  for (const [name, bounds] of Object.entries(MONITORING_NUMERIC_LIMITS)) {
    requireInteger(env, name, service, bounds);
  }
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
  rejectReservedUrlAudience(env, "API");
  requireInteger(env, "XYGO_OIDC_CLOCK_TOLERANCE_SEC", "API", { minimum: 0, maximum: 300 });
  if (normalizedString(env.XYGO_PG_SEED_SYNTHETIC_DATA) === "true") {
    fail("API", "XYGO_PG_SEED_SYNTHETIC_DATA must not be enabled in production.");
  }
  assertBackendServices(env, "API");
}

export function assertProductionWebEnvironment(env = process.env) {
  if (!assertProductionBaseline(env, WEB_REQUIRED_ENV_VARS, "web")) return;
  requireExact(env, "XYGO_AUTH_MODE", "oidc", "web");
  requireHttpsUrl(env, "XYGO_WEB_APP_URL", "web");
  requireHttpsUrl(env, "XYGO_WEB_API_BASE_URL", "web");
  requireHttpsUrl(env, "XYGO_OIDC_ISSUER", "web");
  rejectReservedUrlAudience(env, "web");
  requireHttpsUrl(env, "XYGO_WEB_OIDC_AUTHORIZATION_ENDPOINT", "web", { allowQuery: true });
  requireHttpsUrl(env, "XYGO_WEB_OIDC_TOKEN_ENDPOINT", "web", { allowQuery: true });
  requireHttpsUrl(env, "XYGO_WEB_OIDC_END_SESSION_ENDPOINT", "web", { allowQuery: true });
  requireHttpsUrl(env, "XYGO_WEB_MONITORING_ENDPOINT", "web");
  requireSecret(env, "XYGO_WEB_SESSION_SECRET", "web", 32);
  requireSecret(env, "XYGO_WEB_SESSION_ENCRYPTION_KEY", "web", 32);
  requireExact(env, "XYGO_WEB_SESSION_STORE", "postgres", "web");
  requirePostgresUrl(env, "web", "XYGO_WEB_SESSION_PG_URL");
  requireExact(env, "XYGO_WEB_SESSION_COOKIE_SECURE", "true", "web");
  requireExact(env, "XYGO_WEB_SESSION_COOKIE_HTTP_ONLY", "true", "web");
  if (normalizedString(env.XYGO_WEB_SESSION_COOKIE_SAME_SITE)?.toLowerCase() !== "lax") {
    fail("web", "XYGO_WEB_SESSION_COOKIE_SAME_SITE must be lax so the signed OAuth callback transaction cookie is returned.");
  }
  if (!normalizedString(env.XYGO_WEB_SESSION_COOKIE_NAME)?.startsWith("__Host-")) {
    fail("web", "XYGO_WEB_SESSION_COOKIE_NAME must use the __Host- prefix.");
  }
  requireHttpsUrl(env, "XYGO_WEB_ALLOWED_ORIGIN", "web");
  if (new URL(env.XYGO_WEB_ALLOWED_ORIGIN).origin !== new URL(env.XYGO_WEB_APP_URL).origin ||
      new URL(env.XYGO_WEB_ALLOWED_ORIGIN).pathname !== "/") {
    fail("web", "XYGO_WEB_ALLOWED_ORIGIN must exactly match the XYGO_WEB_APP_URL origin.");
  }
  for (const [name, bounds] of Object.entries({
    XYGO_WEB_SESSION_IDLE_SEC: { minimum: 300, maximum: 86_400 },
    XYGO_WEB_SESSION_ABSOLUTE_SEC: { minimum: 900, maximum: 86_400 },
    XYGO_WEB_AUTH_TRANSACTION_TTL_SEC: { minimum: 60, maximum: 900 },
    XYGO_WEB_TOKEN_REQUEST_TIMEOUT_MS: { minimum: 1_000, maximum: 30_000 },
    XYGO_WEB_TOKEN_CLOCK_TOLERANCE_SEC: { minimum: 0, maximum: 120 },
    XYGO_WEB_TOKEN_RENEW_BEFORE_SEC: { minimum: 30, maximum: 600 }
  })) requireInteger(env, name, "web", bounds);
  if (Number(env.XYGO_WEB_SESSION_IDLE_SEC) >= Number(env.XYGO_WEB_SESSION_ABSOLUTE_SEC)) {
    fail("web", "XYGO_WEB_SESSION_IDLE_SEC must be less than XYGO_WEB_SESSION_ABSOLUTE_SEC.");
  }
  requireExact(env, "XYGO_WEB_REQUIRE_REFRESH_TOKEN", "true", "web");
}

export function assertProductionWorkerEnvironment(env = process.env) {
  if (!assertProductionBaseline(env, WORKER_REQUIRED_ENV_VARS, "worker")) return;
  requireHttpsUrl(env, "XYGO_WEB_APP_URL", "worker");
  assertBackendServices(env, "worker");
  for (const [name, bounds] of Object.entries(WORKER_NUMERIC_LIMITS)) {
    requireInteger(env, name, "worker", bounds);
  }
  if (Number(env.XYGO_WORKER_MAX_BACKOFF_MS) < Number(env.XYGO_WORKER_BASE_BACKOFF_MS)) {
    fail("worker", "XYGO_WORKER_MAX_BACKOFF_MS must be greater than or equal to XYGO_WORKER_BASE_BACKOFF_MS.");
  }
}
