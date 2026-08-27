import test from "node:test";
import assert from "node:assert/strict";
import { verifyProductionConfig } from "../verify-production-config.mjs";

const valid = { NODE_ENV:"production",XYGO_AUTH_MODE:"oidc",XYGO_API_REPOSITORY_MODE:"postgres",XYGO_API_PG_URL:"postgres://db",XYGO_DATA_ENCRYPTION_SECRET:"e".repeat(32),XYGO_DATA_LOOKUP_SECRET:"l".repeat(32),XYGO_AUDIT_SIGNING_KEY:"a".repeat(32),XYGO_OIDC_ISSUER:"https://id.example/",XYGO_OIDC_AUDIENCE:"https://api.example",STRIPE_SECRET_KEY:"sk_live_placeholder",STRIPE_WEBHOOK_SECRET:"whsec_placeholder",STRIPE_BASIC_PRICE_ID:"price_basic",STRIPE_PREMIUM_PRICE_ID:"price_premium",STRIPE_BUSINESS_PRICE_ID:"price_business",XYGO_SITE_URL:"https://www.xygo.pro" };
test("complete production configuration passes the static gate",()=>assert.deepEqual(verifyProductionConfig(valid),{ready:true,errors:[]}));
test("test Stripe keys and local storage fail the production gate",()=>{const result=verifyProductionConfig({...valid,XYGO_API_REPOSITORY_MODE:"sqlite",STRIPE_SECRET_KEY:"sk_test_placeholder"});assert.equal(result.ready,false);assert.match(result.errors.join(" "),/postgres/);assert.match(result.errors.join(" "),/test keys/);});
