#!/usr/bin/env node
import { createPostgresRepository } from "../apps/api/src/repositories/postgres.js";

function valueAfter(flag) {
  const indexes = process.argv.flatMap((value, index) => value === flag ? [index] : []);
  if (indexes.length !== 1) return null;
  const value = process.argv[indexes[0] + 1];
  return value && !value.startsWith("--") ? value : null;
}

if (!process.argv.includes("--approve-managed-idp-binding")) {
  throw new Error(
    "Refusing to bind identity without --approve-managed-idp-binding. Verify the provider invite and immutable subject first."
  );
}
if (!process.env.XYGO_API_PG_URL) {
  throw new Error("XYGO_API_PG_URL is required. Identity bindings only write to the canonical Postgres repository.");
}
if (!process.env.XYGO_OIDC_ISSUER) {
  throw new Error("XYGO_OIDC_ISSUER is required and must exactly match the token issuer.");
}
if (!process.env.XYGO_WEB_APP_URL) {
  throw new Error("XYGO_WEB_APP_URL is required so the binding transaction can queue the activation message.");
}

const tenantId = valueAfter("--tenant-id");
const email = valueAfter("--email");
const subject = valueAfter("--subject");
const actorId = valueAfter("--actor-id");
if (!tenantId || !email || !subject || !actorId) {
  throw new Error(
    "Usage: npm run bind:oidc-user -- --tenant-id <id> --email <email> --subject <provider-sub> --actor-id <operator> --approve-managed-idp-binding"
  );
}

const repository = createPostgresRepository({
  connectionString: process.env.XYGO_API_PG_URL,
  auditSigningKey: process.env.XYGO_AUDIT_SIGNING_KEY ?? null,
  webAppUrl: process.env.XYGO_WEB_APP_URL
});

try {
  const result = await repository.bindOidcIdentity({
    tenantId,
    email,
    issuer: process.env.XYGO_OIDC_ISSUER,
    subject,
    actorId
  });
  process.stdout.write(`${JSON.stringify({
    created: result.created,
    identityId: result.identity.id,
    tenantId: result.identity.tenantId,
    userId: result.identity.userId
  }, null, 2)}\n`);
} finally {
  await repository.close();
}
