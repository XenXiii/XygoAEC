import crypto from "node:crypto";

const AUTH_PROVIDERS = new Set(["password", "google", "microsoft", "yahoo", "enterprise_sso"]);
const PLAN_PRICES = Object.freeze({
  basic: { introductoryCents: 700, recurringCents: 2500 },
  premium: { introductoryCents: 700, recurringCents: 5000 },
  business: { introductoryCents: 4900, recurringCents: 25000 },
  enterprise: { introductoryCents: null, recurringCents: null }
});

function required(value, label) {
  if (typeof value !== "string" || value.trim() === "") throw new Error(`${label} is required.`);
  return value.trim();
}

function normalizedEmail(value) {
  const email = required(value, "Email").toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Email is invalid.");
  return email;
}

function keyBuffer(secret, label) {
  const value = required(secret, label);
  return crypto.createHash("sha256").update(value, "utf8").digest();
}

export function encryptPersonalData(value, encryptionSecret) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", keyBuffer(encryptionSecret, "Encryption secret"), iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([Buffer.from([1]), iv, tag, ciphertext]);
}

export function decryptPersonalData(payload, encryptionSecret) {
  if (!Buffer.isBuffer(payload) || payload.length < 30 || payload[0] !== 1) throw new Error("Encrypted payload is invalid.");
  const decipher = crypto.createDecipheriv("aes-256-gcm", keyBuffer(encryptionSecret, "Encryption secret"), payload.subarray(1, 13));
  decipher.setAuthTag(payload.subarray(13, 29));
  return JSON.parse(Buffer.concat([decipher.update(payload.subarray(29)), decipher.final()]).toString("utf8"));
}

export function personalDataLookupHash(value, lookupSecret) {
  return crypto.createHmac("sha256", keyBuffer(lookupSecret, "Lookup secret"))
    .update(required(value, "Lookup value").toLowerCase(), "utf8")
    .digest("hex");
}

export function prepareClientProfile({ email, name, phone = null, address = null, provider }, secrets) {
  if (!AUTH_PROVIDERS.has(provider)) throw new Error(`Unsupported authentication provider: ${provider}`);
  const cleanEmail = normalizedEmail(email);
  const cleanName = required(name, "Name");
  return {
    emailLookupHash: personalDataLookupHash(cleanEmail, secrets.lookupSecret),
    emailCiphertext: encryptPersonalData(cleanEmail, secrets.encryptionSecret),
    phoneLookupHash: phone ? personalDataLookupHash(phone, secrets.lookupSecret) : null,
    phoneCiphertext: phone ? encryptPersonalData(phone, secrets.encryptionSecret) : null,
    nameCiphertext: encryptPersonalData(cleanName, secrets.encryptionSecret),
    addressCiphertext: address ? encryptPersonalData(address, secrets.encryptionSecret) : null,
    provider,
    encryptionKeyVersion: 1
  };
}

export function planPricing(planCode) {
  const price = PLAN_PRICES[planCode];
  if (!price) throw new Error(`Unknown plan: ${planCode}`);
  return { planCode, ...price };
}

export function auditAccessFor({ resultType, subscriptionStatus }) {
  if (resultType === "free_solution") return "free";
  return subscriptionStatus === "active" || subscriptionStatus === "trialing" ? "paid" : "locked";
}

