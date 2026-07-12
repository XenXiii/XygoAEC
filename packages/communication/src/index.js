import { assertProjectAccess, assertSessionTenantAccess } from "../../auth/src/synthetic-auth.js";
import { createAuditEvent, createOutboxEvent } from "../../audit/src/foundation.js";
import { canPerform } from "../../authorization/src/policy.js";

const CHANNEL_TYPE_SET = new Set([
  "direct_message",
  "group_message",
  "team_channel",
  "department_channel",
  "cross_team_channel",
  "project_channel",
  "discipline_channel",
  "coordination_channel",
  "executive_channel",
  "finance_restricted_channel",
  "legal_restricted_channel",
  "announcement_channel"
]);

const VISIBILITY_CLASS_SET = new Set([
  "private",
  "participant_only",
  "team_only",
  "department_only",
  "project_only",
  "discipline_restricted",
  "restricted_control",
  "finance_restricted",
  "legal_restricted",
  "executive_oversight",
  "company_public_summary"
]);

function requiredString(value, label) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${label} is required.`);
  }
}

function requiredArray(value, label) {
  if (!Array.isArray(value)) {
    throw new Error(`${label} must be an array.`);
  }
}

function assertAllowedChannelType(channelType) {
  if (!CHANNEL_TYPE_SET.has(channelType)) {
    throw new Error(`Unknown channel type: ${channelType}`);
  }
}

function assertAllowedVisibilityClass(visibilityClass) {
  if (!VISIBILITY_CLASS_SET.has(visibilityClass)) {
    throw new Error(`Unknown visibility class: ${visibilityClass}`);
  }
}

function makeId(prefix, value) {
  return `${prefix}-${value}`;
}

export function createChannel(input) {
  requiredString(input?.id, "Channel id");
  requiredString(input?.tenantId, "Channel tenantId");
  requiredString(input?.name, "Channel name");
  requiredString(input?.channelType, "Channel channelType");
  requiredString(input?.visibilityClass, "Channel visibilityClass");

  assertAllowedChannelType(input.channelType);
  assertAllowedVisibilityClass(input.visibilityClass);

  if (input?.staged !== true) {
    throw new Error("Channels must be staged synthetic records.");
  }

  return {
    id: input.id,
    tenantId: input.tenantId,
    name: input.name,
    channelType: input.channelType,
    visibilityClass: input.visibilityClass,
    projectId: input.projectId ?? null,
    teamId: input.teamId ?? null,
    departmentId: input.departmentId ?? null,
    createdBy: input.createdBy ?? "system",
    staged: true
  };
}

export function createChannelMembership(input) {
  requiredString(input?.id, "Channel membership id");
  requiredString(input?.tenantId, "Channel membership tenantId");
  requiredString(input?.channelId, "Channel membership channelId");
  requiredString(input?.userId, "Channel membership userId");

  if (input?.staged !== true) {
    throw new Error("Channel memberships must be staged synthetic records.");
  }

  return {
    id: input.id,
    tenantId: input.tenantId,
    channelId: input.channelId,
    userId: input.userId,
    membershipRole: input.membershipRole ?? "member",
    staged: true
  };
}

export function createNotificationPreference(input) {
  requiredString(input?.userId, "Notification preference userId");
  requiredString(input?.tenantId, "Notification preference tenantId");

  return {
    userId: input.userId,
    tenantId: input.tenantId,
    mutedChannelIds: input.mutedChannelIds ?? [],
    announcementNotifications: input.announcementNotifications ?? true,
    mentionNotifications: input.mentionNotifications ?? true,
    staged: true
  };
}

export function parseMentions(body) {
  requiredString(body, "Message body");
  const matches = body.match(/@([a-z0-9._-]+)/gi) ?? [];
  return matches.map((match) => match.slice(1).toLowerCase());
}

export function createAttachmentReference(input) {
  requiredString(input?.id, "Attachment id");
  requiredString(input?.tenantId, "Attachment tenantId");
  requiredString(input?.fileRecordId, "Attachment fileRecordId");

  return {
    id: input.id,
    tenantId: input.tenantId,
    fileRecordId: input.fileRecordId,
    fileClass: input.fileClass ?? "general_document",
    staged: true
  };
}

export function createMessage(input) {
  requiredString(input?.id, "Message id");
  requiredString(input?.tenantId, "Message tenantId");
  requiredString(input?.channelId, "Message channelId");
  requiredString(input?.senderUserId, "Message senderUserId");
  requiredString(input?.body, "Message body");
  requiredArray(input?.attachments ?? [], "Message attachments");

  return {
    id: input.id,
    tenantId: input.tenantId,
    channelId: input.channelId,
    senderUserId: input.senderUserId,
    body: input.body,
    threadRootId: input.threadRootId ?? null,
    mentions: parseMentions(input.body),
    attachments: input.attachments ?? [],
    references: input.references ?? [],
    revision: input.revision ?? 1,
    deleted: false,
    staged: true
  };
}

export function createMessageRevision(message, updatedBody) {
  requiredString(updatedBody, "Updated message body");

  return {
    ...message,
    body: updatedBody,
    mentions: parseMentions(updatedBody),
    revision: message.revision + 1,
    editedAt: new Date().toISOString()
  };
}

function findChannelMembership(channelMemberships, channelId, userId) {
  return channelMemberships.find(
    (membership) => membership.channelId === channelId && membership.userId === userId
  );
}

function baseCommunicationDecision({ session, channel, action, projectRole }) {
  return canPerform({
    tenantId: session.tenantId,
    resourceTenantId: channel.tenantId,
    organizationRole: session.organizationRole,
    projectRole,
    resource:
      channel.channelType === "announcement_channel" ? "announcement_channel" : "channel",
    action,
    visibilityClass: channel.visibilityClass
  });
}

export function canAccessChannel({ session, channel, memberships }) {
  assertSessionTenantAccess(session, channel.tenantId);
  const membership = findChannelMembership(memberships, channel.id, session.userId);

  if (channel.visibilityClass === "private" && !membership) {
    return {
      allowed: false,
      reason: "private_membership_required"
    };
  }

  const projectRole = session.projectRoles.find((entry) => entry.projectId === channel.projectId)?.role;
  const decision = baseCommunicationDecision({
    session,
    channel,
    action: "read",
    projectRole
  });

  if (!decision.allowed) {
    return decision;
  }

  if (
    channel.visibilityClass === "project_only" &&
    channel.projectId &&
    !session.allowedProjectIds.includes(channel.projectId)
  ) {
    return {
      allowed: false,
      reason: "project_scope_required"
    };
  }

  if (
    ["finance_restricted", "legal_restricted", "restricted_control"].includes(
      channel.visibilityClass
    ) &&
    !membership
  ) {
    return {
      allowed: false,
      reason: "restricted_membership_required"
    };
  }

  return {
    allowed: true,
    reason: "allowed"
  };
}

export function sendMessage({
  session,
  channel,
  channelMemberships,
  messageInput,
  notificationPreferences = []
}) {
  const channelDecision = canAccessChannel({
    session,
    channel,
    memberships: channelMemberships
  });

  if (!channelDecision.allowed) {
    throw new Error(`Message send denied: ${channelDecision.reason}`);
  }

  if (channel.projectId) {
    assertProjectAccess(session, channel.projectId);
  }

  const message = createMessage({
    ...messageInput,
    tenantId: channel.tenantId,
    channelId: channel.id,
    senderUserId: session.userId
  });

  const auditEvent = createAuditEvent({
    tenantId: channel.tenantId,
    actorType: "user",
    actorId: session.userId,
    action: "message.sent",
    resourceType: "message",
    resourceId: message.id
  });

  const outboxEvent = createOutboxEvent({
    eventType: "communication.message.sent",
    aggregateType: "message",
    aggregateId: message.id,
    tenantId: channel.tenantId,
    payload: {
      channelId: channel.id,
      mentions: message.mentions
    }
  });

  const notifications = buildNotificationEvents({
    message,
    channel,
    channelMemberships,
    notificationPreferences,
    senderUserId: session.userId
  });

  return {
    message,
    auditEvent,
    outboxEvent,
    notifications
  };
}

export function buildNotificationEvents({
  message,
  channel,
  channelMemberships,
  notificationPreferences,
  senderUserId
}) {
  const recipientIds = new Set();

  for (const membership of channelMemberships) {
    if (membership.channelId !== channel.id || membership.userId === senderUserId) {
      continue;
    }

    const preference =
      notificationPreferences.find((item) => item.userId === membership.userId) ?? null;

    const channelMuted = preference?.mutedChannelIds?.includes(channel.id) === true;
    const mentioned = message.mentions.includes(membership.userId.toLowerCase());

    if (channelMuted && !mentioned) {
      continue;
    }

    if (channel.channelType === "announcement_channel" && preference?.announcementNotifications === false) {
      continue;
    }

    recipientIds.add(membership.userId);
  }

  return Array.from(recipientIds).map((userId) => ({
    id: makeId("notification", `${message.id}-${userId}`),
    tenantId: channel.tenantId,
    userId,
    channelId: channel.id,
    messageId: message.id,
    type: message.mentions.includes(userId.toLowerCase()) ? "mention" : "channel_message",
    staged: true
  }));
}

export function searchMessages({ session, channelMap, channelMemberships, messages, query }) {
  requiredString(query, "Search query");
  const normalizedQuery = query.toLowerCase();

  return messages.filter((message) => {
    const channel = channelMap.get(message.channelId);
    if (!channel) {
      return false;
    }

    const access = canAccessChannel({
      session,
      channel,
      memberships: channelMemberships
    });

    if (!access.allowed) {
      return false;
    }

    return message.body.toLowerCase().includes(normalizedQuery);
  });
}

export function markMessageRead({ session, message, channel, channelMemberships }) {
  const access = canAccessChannel({
    session,
    channel,
    memberships: channelMemberships
  });

  if (!access.allowed) {
    throw new Error(`Read state update denied: ${access.reason}`);
  }

  return {
    id: makeId("read", `${message.id}-${session.userId}`),
    tenantId: channel.tenantId,
    channelId: channel.id,
    messageId: message.id,
    userId: session.userId,
    staged: true
  };
}
