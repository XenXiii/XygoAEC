export const PRIMARY_TABS = Object.freeze(["Chat", "Business", "Actions"]);
export const ACCOUNT_SCREENS = Object.freeze(["SignIn", "WorkspaceSelection", "Onboarding", "Integrations", "Import", "AuditProgress", "FreeResult", "BillingHandoff", "Notifications", "Profile", "Team", "Security", "Privacy"]);
export const OFFLINE_ALLOWED = new Set(["conversation_draft", "manual_metric_draft"]);
export function mayQueueOffline(operation) { return OFFLINE_ALLOWED.has(operation); }
export const BILLING_POLICY = Object.freeze({ mode: "external_account_handoff", embeddedStripeCheckout: false, note: "Digital subscription purchase requires store-policy review before in-app enablement." });
