const DEFAULT_BLOCKED_HOSTNAME_FRAGMENTS = [
  "autodesk.com",
  "procore.com",
  "trimble.com",
  "microsoft.com",
  "office.com",
  "quickbooks.com",
  "intuit.com",
  "production",
  "prod."
];

const DEFAULT_BLOCKED_CREDENTIAL_PATTERNS = [
  "sk_live_",
  "Bearer ",
  "client_secret",
  "refresh_token",
  "prod_"
];

export function getStagedMode(config = {}) {
  return config.STAGED_MODE !== false;
}

export function assertStagedMode(config = {}) {
  if (!getStagedMode(config)) {
    throw new Error("STAGED_MODE enforcement cannot be disabled in this repository.");
  }
}

export function assertNoProductionTarget(target, options = {}) {
  const blockedHostnameFragments =
    options.blockedHostnameFragments ?? DEFAULT_BLOCKED_HOSTNAME_FRAGMENTS;
  const normalized = String(target || "").toLowerCase();

  for (const fragment of blockedHostnameFragments) {
    if (normalized.includes(fragment.toLowerCase())) {
      throw new Error(`Blocked potential production target: ${target}`);
    }
  }
}

export function assertNoLiveCredentialValue(value, options = {}) {
  const blockedCredentialPatterns =
    options.blockedCredentialPatterns ?? DEFAULT_BLOCKED_CREDENTIAL_PATTERNS;
  const normalized = String(value || "");

  for (const pattern of blockedCredentialPatterns) {
    if (normalized.includes(pattern)) {
      throw new Error(`Blocked potential live credential pattern: ${pattern}`);
    }
  }
}

export function assertStagedOutboundOperation(operation) {
  if (!operation || typeof operation !== "object") {
    throw new Error("Operation metadata is required.");
  }

  assertStagedMode(operation.config);
  assertNoProductionTarget(operation.target);

  if (operation.credentialValue) {
    assertNoLiveCredentialValue(operation.credentialValue);
  }

  if (operation.method && !["GET", "HEAD"].includes(operation.method)) {
    throw new Error(`Blocked outbound write-like method in staged mode: ${operation.method}`);
  }

  return {
    allowed: true,
    staged: true
  };
}

export function createPolicyViolationRecord(input) {
  return {
    type: "staged_policy_violation",
    target: input?.target ?? null,
    reason: input?.reason ?? "unknown",
    occurredAt: input?.occurredAt ?? new Date().toISOString(),
    staged: true
  };
}
