import {
  decryptPersonalData,
  encryptPersonalData,
  personalDataLookupHash
} from "../../../packages/client-onboarding/src/index.js";
import { createAuditPlatformRepository } from "../../../packages/audit-platform/src/index.js";
import { createBillingRepository } from "../../../packages/billing/src/index.js";
import { createOnboardingRepository } from "../../../packages/onboarding-journey/src/index.js";
import { createPostgresAuditRepository } from "./audit/postgres.js";
import { createPostgresBillingRepository } from "./billing/postgres.js";
import { createPostgresOnboardingRepository } from "./onboarding/postgres.js";

function requiredSecret(env, name) {
  const value = env[name];
  if (typeof value !== "string" || value.length < 32) {
    throw new Error(`${name} must be configured with at least 32 characters.`);
  }
  return value;
}

export function createRuntimeRepositories({ env = process.env, coreRepository }) {
  const mode = env.XYGO_API_REPOSITORY_MODE ?? "sqlite";
  if (mode !== "postgres") {
    if ((env.NODE_ENV ?? "development") === "production") {
      throw new Error("Production requires XYGO_API_REPOSITORY_MODE=postgres.");
    }
    return {
      auditRepository: createAuditPlatformRepository(),
      billingRepository: createBillingRepository(),
      onboardingRepository: createOnboardingRepository(),
      persistent: false
    };
  }

  if (!coreRepository?.rawQuery) {
    throw new Error("PostgreSQL runtime repositories require the core rawQuery adapter.");
  }
  const encryptionSecret = requiredSecret(env, "XYGO_DATA_ENCRYPTION_SECRET");
  const lookupSecret = requiredSecret(env, "XYGO_DATA_LOOKUP_SECRET");
  const pool = { query: (text, params) => coreRepository.rawQuery(text, params) };
  return {
    auditRepository: createPostgresAuditRepository({
      pool,
      encryptJson: (value) => encryptPersonalData(value, encryptionSecret),
      decryptJson: (value) => decryptPersonalData(value, encryptionSecret),
      lookupHash: (value) => personalDataLookupHash(value, lookupSecret)
    }),
    billingRepository: createPostgresBillingRepository({ pool }),
    onboardingRepository: createPostgresOnboardingRepository({
      pool,
      encryptJson: (value) => encryptPersonalData(value, encryptionSecret),
      decryptJson: (value) => decryptPersonalData(value, encryptionSecret)
    }),
    persistent: true
  };
}
