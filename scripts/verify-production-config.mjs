const required = [
  "XYGO_API_PG_URL", "XYGO_DATA_ENCRYPTION_SECRET", "XYGO_DATA_LOOKUP_SECRET", "XYGO_AUDIT_SIGNING_KEY",
  "XYGO_OIDC_ISSUER", "XYGO_OIDC_AUDIENCE", "STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET",
  "STRIPE_BASIC_PRICE_ID", "STRIPE_PREMIUM_PRICE_ID", "STRIPE_BUSINESS_PRICE_ID", "XYGO_SITE_URL"
];

export function verifyProductionConfig(env = process.env) {
  const errors = [];
  if (env.NODE_ENV !== "production") errors.push("NODE_ENV must be production.");
  if (env.XYGO_AUTH_MODE !== "oidc") errors.push("XYGO_AUTH_MODE must be oidc.");
  if (env.XYGO_API_REPOSITORY_MODE !== "postgres") errors.push("XYGO_API_REPOSITORY_MODE must be postgres.");
  for (const name of required) if (!env[name]) errors.push(`${name} is missing.`);
  for (const name of ["XYGO_DATA_ENCRYPTION_SECRET", "XYGO_DATA_LOOKUP_SECRET", "XYGO_AUDIT_SIGNING_KEY"]) if (env[name] && env[name].length < 32) errors.push(`${name} must have at least 32 characters.`);
  if (env.STRIPE_SECRET_KEY?.startsWith("sk_test_")) errors.push("Stripe test keys are forbidden in production.");
  if (env.STRIPE_SECRET_KEY && !env.STRIPE_SECRET_KEY.startsWith("sk_live_")) errors.push("STRIPE_SECRET_KEY is not a recognized live key.");
  if (env.XYGO_SITE_URL && !env.XYGO_SITE_URL.startsWith("https://")) errors.push("XYGO_SITE_URL must use HTTPS.");
  if (env.XYGO_OIDC_ISSUER && !env.XYGO_OIDC_ISSUER.startsWith("https://")) errors.push("XYGO_OIDC_ISSUER must use HTTPS.");
  return { ready: errors.length === 0, errors };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = verifyProductionConfig();
  console.log(JSON.stringify(result, null, 2));
  process.exitCode = result.ready ? 0 : 1;
}
