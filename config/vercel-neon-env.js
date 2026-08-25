const ALIASES = Object.freeze({
  XYGO_API_PG_URL: "XYGO_API_PG_POSTGRES_URL",
  XYGO_WEB_SESSION_PG_URL: "XYGO_API_PG_POSTGRES_URL"
});

export function withVercelNeonAliases(env = {}) {
  const normalized = { ...env };

  for (const [canonicalName, integrationName] of Object.entries(ALIASES)) {
    if (!normalized[canonicalName] && normalized[integrationName]) {
      normalized[canonicalName] = normalized[integrationName];
    }
  }

  return normalized;
}
