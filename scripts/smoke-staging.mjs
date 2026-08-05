import dns from "node:dns/promises";
import { runStagingSmoke } from "../packages/staging-readiness/src/index.js";

const baseUrl = process.env.XYGO_STAGING_BASE_URL;
const expectedRelease = process.env.XYGO_STAGING_EXPECTED_RELEASE;
if (!baseUrl || !expectedRelease) {
  throw new Error("XYGO_STAGING_BASE_URL and XYGO_STAGING_EXPECTED_RELEASE are required");
}

const hostname = new URL(baseUrl).hostname;
const addresses = await dns.lookup(hostname, { all: true });
if (addresses.length === 0) throw new Error(`DNS did not resolve ${hostname}`);

const result = await runStagingSmoke({
  baseUrl,
  expectedRelease,
  tenantId: process.env.XYGO_STAGING_SMOKE_TENANT_ID,
  deniedTenantId: process.env.XYGO_STAGING_SMOKE_DENIED_TENANT_ID,
  accessToken: process.env.XYGO_STAGING_SMOKE_ACCESS_TOKEN
});

process.stdout.write(`${JSON.stringify({ ready: true, dnsAddresses: addresses.map(({ family }) => `IPv${family}`), ...result }, null, 2)}\n`);
