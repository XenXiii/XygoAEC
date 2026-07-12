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
  try {
    return JSON.parse(Buffer.from(segment, "base64url").toString("utf8"));
  } catch {
    throw new AuthError("malformed_token", `Could not decode JWT ${label}.`);
  }
}

function asAudienceSet(aud) {
  if (Array.isArray(aud)) {
    return new Set(aud);
  }
  return new Set(aud ? [aud] : []);
}

// verifyJwt(token, { keys, issuer, audience, now, clockToleranceSec })
// - keys: array of JWK public keys (from the issuer's JWKS)
// - returns the validated claims payload, or throws AuthError
export function verifyJwt(token, { keys = [], issuer, audience, now = Date.now(), clockToleranceSec = 60 } = {}) {
  if (typeof token !== "string" || token.split(".").length !== 3) {
    throw new AuthError("malformed_token", "Expected a compact JWS with three segments.");
  }

  const [headerB64, payloadB64, signatureB64] = token.split(".");
  const header = decodeSegment(headerB64, "header");
  const payload = decodeSegment(payloadB64, "payload");

  const hashAlg = ALG_TO_HASH[header.alg];
  if (!hashAlg) {
    throw new AuthError("unsupported_alg", `Unsupported or missing JWT alg: ${header.alg}.`);
  }

  const jwk = keys.find((key) => key.kid === header.kid) ?? (keys.length === 1 ? keys[0] : null);
  if (!jwk) {
    throw new AuthError("unknown_key", `No JWKS key matches kid: ${header.kid}.`);
  }

  let publicKey;
  try {
    publicKey = crypto.createPublicKey({ key: jwk, format: "jwk" });
  } catch {
    throw new AuthError("invalid_key", "JWKS key could not be imported.");
  }

  const signingInput = `${headerB64}.${payloadB64}`;
  const signature = Buffer.from(signatureB64, "base64url");
  const signatureValid = crypto.verify(hashAlg, Buffer.from(signingInput), publicKey, signature);
  if (!signatureValid) {
    throw new AuthError("bad_signature", "JWT signature verification failed.");
  }

  if (issuer && payload.iss !== issuer) {
    throw new AuthError("issuer_mismatch", `Unexpected token issuer: ${payload.iss}.`);
  }

  if (audience) {
    const audiences = asAudienceSet(payload.aud);
    if (!audiences.has(audience)) {
      throw new AuthError("audience_mismatch", "Token audience does not include this service.");
    }
  }

  const nowSec = Math.floor(now / 1000);
  if (typeof payload.exp === "number" && nowSec > payload.exp + clockToleranceSec) {
    throw new AuthError("token_expired", "Token has expired.");
  }
  if (typeof payload.nbf === "number" && nowSec + clockToleranceSec < payload.nbf) {
    throw new AuthError("token_not_yet_valid", "Token is not yet valid.");
  }

  return payload;
}
