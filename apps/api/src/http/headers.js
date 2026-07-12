// Security + CORS headers applied to every API response. The API only ever
// returns JSON (or SSE), so the CSP is maximally restrictive and caching is off.
// HSTS is inert over plain HTTP and takes effect once served behind TLS.
export const SECURITY_HEADERS = {
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
  "referrer-policy": "no-referrer",
  "content-security-policy": "default-src 'none'; frame-ancestors 'none'",
  "strict-transport-security": "max-age=63072000; includeSubDomains",
  "cache-control": "no-store"
};

export const CORS_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization,content-type,x-staged-tenant-id,x-staged-user-id",
  "access-control-allow-methods": "GET,POST,OPTIONS"
};

export const STAGED_HEADER = { "x-xygo-staged-mode": "true" };

// Baseline headers for JSON responses (excludes content-type so callers set it).
export function baseResponseHeaders(extra = {}) {
  return { ...SECURITY_HEADERS, ...CORS_HEADERS, ...STAGED_HEADER, ...extra };
}
