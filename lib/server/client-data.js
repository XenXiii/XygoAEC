import crypto from "node:crypto";
import pg from "pg";

import { encryptPersonalData, personalDataLookupHash } from "../../packages/client-onboarding/src/index.js";

export function clientDataSecrets() {
  const encryptionSecret = process.env.XYGO_PII_ENCRYPTION_SECRET;
  const lookupSecret = process.env.XYGO_PII_LOOKUP_SECRET;
  if (!encryptionSecret || !lookupSecret) throw new Error("Client data encryption is not configured.");
  return { encryptionSecret, lookupSecret };
}

export function databaseUrl() {
  const value = process.env.XYGO_API_PG_DATABASE_URL || process.env.XYGO_API_PG_DATABASE_URL_UNPOOLED;
  if (!value) throw new Error("Database is not configured.");
  return value;
}

export async function withDatabase(operation) {
  const client = new pg.Client({ connectionString: databaseUrl() });
  await client.connect();
  try {
    return await operation(client);
  } finally {
    await client.end();
  }
}

export function normalizedEmail(value) {
  const email = String(value ?? "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) throw new Error("A valid email is required.");
  return email;
}

export function encryptedContact({ email, name = null }) {
  const secrets = clientDataSecrets();
  const normalized = normalizedEmail(email);
  return {
    emailLookupHash: personalDataLookupHash(normalized, secrets.lookupSecret),
    emailCiphertext: encryptPersonalData(normalized, secrets.encryptionSecret),
    nameCiphertext: name ? encryptPersonalData(String(name).trim().slice(0, 200), secrets.encryptionSecret) : null
  };
}

export function randomId(prefix) {
  return `${prefix}_${crypto.randomUUID()}`;
}

