import test from "node:test";
import assert from "node:assert/strict";

import {
  auditAccessFor,
  decryptPersonalData,
  encryptPersonalData,
  personalDataLookupHash,
  planPricing,
  prepareClientProfile
} from "../src/index.js";

const secrets = { encryptionSecret: "test-encryption-secret", lookupSecret: "test-lookup-secret" };

test("personal data encrypts with authenticated encryption", () => {
  const value = { street: "123 Main St", city: "Miami" };
  const encrypted = encryptPersonalData(value, secrets.encryptionSecret);
  assert.notEqual(encrypted.toString("utf8"), JSON.stringify(value));
  assert.deepEqual(decryptPersonalData(encrypted, secrets.encryptionSecret), value);
  const tampered = Buffer.from(encrypted);
  tampered[tampered.length - 1] ^= 1;
  assert.throws(() => decryptPersonalData(tampered, secrets.encryptionSecret));
});

test("lookup hashes normalize email without exposing it", () => {
  const first = personalDataLookupHash("Owner@Example.com", secrets.lookupSecret);
  const second = personalDataLookupHash("owner@example.com", secrets.lookupSecret);
  assert.equal(first, second);
  assert.equal(first.length, 64);
  assert.equal(first.includes("owner"), false);
});

test("client profile validates providers and encrypts direct identifiers", () => {
  const profile = prepareClientProfile({
    email: "Owner@Example.com",
    name: "Avery Owner",
    phone: "+1 305 555 0100",
    address: { street: "123 Main St" },
    provider: "google"
  }, secrets);
  assert.equal(profile.provider, "google");
  assert.equal(decryptPersonalData(profile.emailCiphertext, secrets.encryptionSecret), "owner@example.com");
  assert.throws(() => prepareClientProfile({ email: "bad", name: "A", provider: "unknown" }, secrets));
});

test("launch pricing and free-result gate match the approved funnel", () => {
  assert.deepEqual(planPricing("basic"), { planCode: "basic", introductoryCents: 700, recurringCents: 2500 });
  assert.deepEqual(planPricing("premium"), { planCode: "premium", introductoryCents: 700, recurringCents: 5000 });
  assert.deepEqual(planPricing("business"), { planCode: "business", introductoryCents: 4900, recurringCents: 25000 });
  assert.equal(auditAccessFor({ resultType: "free_solution", subscriptionStatus: null }), "free");
  assert.equal(auditAccessFor({ resultType: "finding", subscriptionStatus: null }), "locked");
  assert.equal(auditAccessFor({ resultType: "finding", subscriptionStatus: "active" }), "paid");
});

