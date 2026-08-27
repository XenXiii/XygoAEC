import test from "node:test"; import assert from "node:assert/strict";
import { createMobilePkceTransaction, createWebSessionContract } from "../src/oidc-contracts.js";
const config={issuer:"https://tenant.auth0.com/",clientId:"client",audience:"https://api.xygo.pro",redirectUri:"https://xygo.pro/callback"};
test("web session contract uses secure cookies, state, nonce, and CSRF",()=>{const value=createWebSessionContract(config);assert.equal(value.cookie.httpOnly,true);assert.equal(value.cookie.secure,true);assert.equal(value.stateRequired,true);assert.ok(value.csrf.requiredFor.includes("POST"));});
test("mobile contract uses authorization code with S256 PKCE and secure storage",()=>{const value=createMobilePkceTransaction({...config,randomBytes:()=>Buffer.alloc(32,7)});assert.equal(value.responseType,"code");assert.equal(value.codeChallengeMethod,"S256");assert.notEqual(value.codeVerifier,value.codeChallenge);assert.match(value.scope,/offline_access/);});
