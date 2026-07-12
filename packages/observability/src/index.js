import { verifyAuditChain } from "../../audit/src/foundation.js";

export function createLoadScenario(input) {
  return {
    name: input.name,
    tenantCount: input.tenantCount,
    userCount: input.userCount,
    projectCount: input.projectCount,
    messageCount: input.messageCount,
    concurrentReviewSessions: input.concurrentReviewSessions,
    staged: true
  };
}

export function summarizeQueueHealth(queues) {
  return {
    queueCount: queues.length,
    backlogSize: queues.reduce((sum, queue) => sum + (queue.items?.length ?? 0), 0),
    staged: true
  };
}

export function verifyAuditHealth(events) {
  const result = verifyAuditChain(events);
  return {
    ...result,
    checkedEventCount: events.length,
    staged: true
  };
}
