import crypto from "node:crypto";

// Minimal, dependency-free JWT (RS256/384/512) verification against a JWKS.
// Works with any managed OIDC provider (Auth0/Clerk/Cognito): fetch the issuer's
// JWKS and pass the keys in. Verification is a pure function so it can be tested
// fully offline with a locally generated key pair.

export class AuthError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "AuthError";
    this.code = code;
  }
}

const ALG_TO_HASH = {
  RS256: "RSA-SHA256",
  RS384: "RSA-SHA384",
  RS512: "RSA-SHA512"
};

function decodeSegment(segment, label) {
  let decoded;
  try {
    decoded = JSON.parse(Buffer.from(segment, "base64url").toString("utf8"));
  } catch {
    throw new AuthError("malformed_token", `Could not decode JWT ${label}.`);
  }
  if (!decoded || typeof decoded !== "object" || Array.isArray(decoded)) {
    throw new AuthError("malformed_token", `JWT ${label} must be a JSON object.`);
  }
  return decoded;
}

function asAudienceSet(aud) {
  if (Array.isArray(aud)) {
    return new Set(aud);
  }
  return new Set(aud ? [aud] : []);
}

// verifyJwt(token, { keys, issuer, audience, allowedAlgorithms, now, clockToleranceSec })
// - keys: array of JWK public keys (from the issuer's JWKS)
// - returns the validated claims payload, or throws AuthError
export function verifyJwt(token, {
  keys = [],
  issuer,
  audience,
  allowedAlgorithms = ["RS256"],
  now = Date.now(),
  clockToleranceSec = 60
} = {}) {
  if (typeof token !== "string" || token.split(".").length !== 3) {
    throw new AuthError("malformed_token", "Expected a compact JWS with three segments.");
  }

  if (typeof issuer !== "string" || !issuer || typeof audience !== "string" || !audience) {
    throw new AuthError("verification_config", "JWT verification requires an issuer and audience.");
  }
  if (!Array.isArray(keys)) {
    throw new AuthError("verification_config", "JWT verification requires a JWKS key array.");
  }
  if (!Array.isArray(allowedAlgorithms) || allowedAlgorithms.length === 0) {
    throw new AuthError("verification_config", "JWT verification requires at least one allowed algorithm.");
  }
  if (!Number.isFinite(now) || !Number.isFinite(clockToleranceSec) || clockToleranceSec < 0) {
    throw new AuthError("verification_config", "JWT verification time settings are invalid.");
  }

  const [headerB64, payloadB64, signatureB64] = token.split(".");
  const header = decodeSegment(headerB64, "header");
  const payload = decodeSegment(payloadB64, "payload");

  const hashAlg = ALG_TO_HASH[header.alg];
  if (!hashAlg) {
    throw new AuthError("unsupported_alg", `Unsupported or missing JWT alg: ${header.alg}.`);
  }
  if (!allowedAlgorithms.includes(header.alg)) {
    throw new AuthError("disallowed_alg", `JWT alg is not allowed for this issuer: ${header.alg}.`);
  }

  if (typeof header.kid !== "string" || !header.kid.trim()) {
    throw new AuthError("missing_key_id", "JWT header is missing a key id (kid).");
  }

  const matchingKeys = keys.filter((key) => key && typeof key === "object" && key.kid === header.kid);
  if (matchingKeys.length === 0) {
    throw new AuthError("unknown_key", `No JWKS key matches kid: ${header.kid}.`);
  }
  if (matchingKeys.length !== 1) {
    throw new AuthError("ambiguous_key", `Multiple JWKS keys match kid: ${header.kid}.`);
  }
  const jwk = matchingKeys[0];
  if (jwk.kty !== "RSA" || (jwk.use && jwk.use !== "sig")) {
    throw new AuthError("invalid_key", "JWKS key is not an RSA signing key.");
  }
  if (jwk.alg && jwk.alg !== header.alg) {
    throw new AuthError("key_alg_mismatch", "JWT algorithm does not match the JWKS key algorithm.");
  }
  if (Array.isArray(jwk.key_ops) && !jwk.key_ops.includes("verify")) {
    throw new AuthError("invalid_key", "JWKS key is not authorized for signature verification.");
  }

  let publicKey;
  try {
    publicKey = crypto.createPublicKey({ key: jwk, format: "jwk" });
  } catch {
    throw new AuthError("invalid_key", "JWKS key could not be imported.");
  }

  const signingInput = `${headerB64}.${payloadB64}`;
  const signature = Buffer.from(signatureB64, "base64url");
  let signatureValid;
  try {
    signatureValid = crypto.verify(hashAlg, Buffer.from(signingInput), publicKey, signature);
  } catch {
    throw new AuthError("invalid_key", "JWKS key could not verify this signature.");
  }
  if (!signatureValid) {
    throw new AuthError("bad_signature", "JWT signature verification failed.");
  }

  if (payload.iss !== issuer) {
    throw new AuthError("issuer_mismatch", `Unexpected token issuer: ${payload.iss}.`);
  }

  const audiences = asAudienceSet(payload.aud);
  if (!audiences.has(audience)) {
    throw new AuthError("audience_mismatch", "Token audience does not include this service.");
  }

  const nowSec = Math.floor(now / 1000);
  if (!Number.isFinite(payload.exp)) {
    throw new AuthError("invalid_expiration", "Token requires a numeric expiration claim (exp).");
  }
  if (nowSec >= payload.exp + clockToleranceSec) {
    throw new AuthError("token_expired", "Token has expired.");
  }
  if (payload.nbf !== undefined) {
    if (!Number.isFinite(payload.nbf)) {
      throw new AuthError("invalid_not_before", "Token not-before claim (nbf) must be numeric.");
    }
    if (nowSec + clockToleranceSec < payload.nbf) {
      throw new AuthError("token_not_yet_valid", "Token is not yet valid.");
    }
  }

  return payload;
}
