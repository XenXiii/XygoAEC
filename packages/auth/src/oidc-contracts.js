import crypto from "node:crypto";

function base64url(buffer) { return Buffer.from(buffer).toString("base64url"); }

export function createWebSessionContract({ issuer, clientId, audience, redirectUri }) {
  for (const [key, value] of Object.entries({ issuer, clientId, audience, redirectUri })) if (!value) throw new Error(`${key} is required.`);
  return Object.freeze({
    authorizationEndpoint: `${issuer.replace(/\/$/, "")}/authorize`, clientId, audience, redirectUri,
    responseType: "code", scope: "openid profile email", stateRequired: true, nonceRequired: true,
    cookie: { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAgeSeconds: 8 * 60 * 60 },
    csrf: { method: "double-submit", requiredFor: ["POST", "PUT", "PATCH", "DELETE"] }
  });
}

export function createMobilePkceTransaction({ issuer, clientId, audience, redirectUri, randomBytes = crypto.randomBytes }) {
  const verifier = base64url(randomBytes(32));
  const challenge = base64url(crypto.createHash("sha256").update(verifier).digest());
  return Object.freeze({
    authorizationUrl: `${issuer.replace(/\/$/, "")}/authorize`, tokenUrl: `${issuer.replace(/\/$/, "")}/oauth/token`,
    clientId, audience, redirectUri, responseType: "code", scope: "openid profile email offline_access",
    codeVerifier: verifier, codeChallenge: challenge, codeChallengeMethod: "S256",
    secureStorage: "platform_keychain_or_keystore", refreshTokenRotationRequired: true
  });
}
