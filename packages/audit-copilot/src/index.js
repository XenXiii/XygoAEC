const FIELDS = new Set(["message", "questions", "facts", "evidenceRefs", "canvasUpdates", "recommendationUpdates", "approvalRequests"]);
export function validateCopilotOutput(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Copilot output must be an object.");
  for (const key of Object.keys(input)) if (!FIELDS.has(key)) throw new Error(`Unknown copilot output field: ${key}`);
  if (typeof input.message !== "string" || !input.message.trim()) throw new Error("Copilot message is required.");
  const output = { message: input.message, questions: input.questions ?? [], facts: input.facts ?? [], evidenceRefs: input.evidenceRefs ?? [], canvasUpdates: input.canvasUpdates ?? [], recommendationUpdates: input.recommendationUpdates ?? [], approvalRequests: input.approvalRequests ?? [] };
  for (const [key, value] of Object.entries(output)) if (key !== "message" && !Array.isArray(value)) throw new Error(`${key} must be an array.`);
  return Object.freeze(output);
}

export function authorizeToolInvocation(invocation, { allowedTools, workspaceId, requiresApproval = [] }) {
  if (!allowedTools.includes(invocation.tool)) return { allowed: false, reason: "tool_not_allowlisted" };
  if (invocation.workspaceId !== workspaceId) return { allowed: false, reason: "workspace_mismatch" };
  if (requiresApproval.includes(invocation.tool) && invocation.approvalStatus !== "approved") return { allowed: false, reason: "human_approval_required" };
  if (!invocation.idempotencyKey) return { allowed: false, reason: "idempotency_key_required" };
  return { allowed: true, reason: "allowed" };
}
