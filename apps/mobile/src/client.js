export const SAFE_OFFLINE_OPERATIONS = new Set(["conversation_draft", "manual_metric_draft"]);

export function mobileConfig(env = process.env) {
  const values = {
    apiUrl: env.EXPO_PUBLIC_XYGO_API_URL,
    issuer: env.EXPO_PUBLIC_XYGO_OIDC_ISSUER,
    clientId: env.EXPO_PUBLIC_XYGO_OIDC_CLIENT_ID,
    audience: env.EXPO_PUBLIC_XYGO_OIDC_AUDIENCE
  };
  for (const [key, value] of Object.entries(values)) if (!value) throw new Error(`Mobile ${key} is not configured.`);
  if (!String(values.apiUrl).startsWith("https://")) throw new Error("Mobile API URL must use HTTPS.");
  return values;
}

export function mayQueueOffline(operation) { return SAFE_OFFLINE_OPERATIONS.has(operation); }

export function workspacePath(workspaceId, suffix) {
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(workspaceId ?? "")) throw new Error("Workspace id is invalid.");
  return `/v1/workspaces/${encodeURIComponent(workspaceId)}/${suffix.replace(/^\/+/, "")}`;
}

export function parseSseChunk(chunk) {
  return String(chunk).split("\n\n").filter(Boolean).map((block) => {
    const event = block.match(/^event:\s*(.+)$/m)?.[1];
    const data = block.match(/^data:\s*(.+)$/m)?.[1];
    if (!event || !data) return null;
    return { event, data: JSON.parse(data) };
  }).filter(Boolean);
}

export function billingHandoffUrl(siteUrl, workspaceId) {
  const url = new URL("/app", siteUrl);
  url.searchParams.set("workspace", workspaceId);
  url.searchParams.set("source", "mobile");
  return url.toString();
}
