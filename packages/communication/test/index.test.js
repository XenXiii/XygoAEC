import test from "node:test";
import assert from "node:assert/strict";

import { createSyntheticSession } from "../../auth/src/synthetic-auth.js";
import {
  buildNotificationEvents,
  canAccessChannel,
  createAttachmentReference,
  createChannel,
  createChannelMembership,
  createMessageRevision,
  createNotificationPreference,
  markMessageRead,
  searchMessages,
  sendMessage
} from "../src/index.js";

test("channels reject unknown channel types", () => {
  assert.throws(
    () =>
      createChannel({
        id: "channel-a",
        tenantId: "tenant-a",
        name: "Bad",
        channelType: "spaceship",
        visibilityClass: "team_only",
        staged: true
      }),
    /Unknown channel type/
  );
});

test("private channels require membership", () => {
  const session = createSyntheticSession({
    sessionId: "s1",
    tenantId: "tenant-a",
    userId: "user-a",
    organizationRole: "employee",
    staged: true
  });
  const channel = createChannel({
    id: "channel-a",
    tenantId: "tenant-a",
    name: "Private DM",
    channelType: "direct_message",
    visibilityClass: "private",
    staged: true
  });

  const result = canAccessChannel({
    session,
    channel,
    memberships: []
  });

  assert.equal(result.allowed, false);
  assert.equal(result.reason, "private_membership_required");
});

test("project channels require project scope for send", () => {
  const session = createSyntheticSession({
    sessionId: "s1",
    tenantId: "tenant-a",
    userId: "user-a",
    organizationRole: "employee",
    allowedProjectIds: [],
    staged: true
  });
  const channel = createChannel({
    id: "channel-project-a",
    tenantId: "tenant-a",
    name: "Project A",
    channelType: "project_channel",
    visibilityClass: "project_only",
    projectId: "project-a",
    staged: true
  });
  const memberships = [
    createChannelMembership({
      id: "membership-a",
      tenantId: "tenant-a",
      channelId: channel.id,
      userId: "user-a",
      staged: true
    })
  ];

  assert.throws(
    () =>
      sendMessage({
        session,
        channel,
        channelMemberships: memberships,
        messageInput: {
          id: "message-a",
          body: "hello"
        }
      }),
    /project_scope_required/
  );
});

test("sendMessage creates message, audit event, outbox event, and notifications", () => {
  const session = createSyntheticSession({
    sessionId: "s1",
    tenantId: "tenant-a",
    userId: "user-a",
    organizationRole: "employee",
    allowedProjectIds: ["project-a"],
    staged: true
  });
  const channel = createChannel({
    id: "channel-project-a",
    tenantId: "tenant-a",
    name: "Project A",
    channelType: "project_channel",
    visibilityClass: "project_only",
    projectId: "project-a",
    staged: true
  });
  const memberships = [
    createChannelMembership({
      id: "membership-a",
      tenantId: "tenant-a",
      channelId: channel.id,
      userId: "user-a",
      staged: true
    }),
    createChannelMembership({
      id: "membership-b",
      tenantId: "tenant-a",
      channelId: channel.id,
      userId: "user-b",
      staged: true
    })
  ];
  const notificationPreferences = [
    createNotificationPreference({
      userId: "user-b",
      tenantId: "tenant-a"
    })
  ];
  const attachment = createAttachmentReference({
    id: "attachment-a",
    tenantId: "tenant-a",
    fileRecordId: "file-a"
  });

  const result = sendMessage({
    session,
    channel,
    channelMemberships: memberships,
    notificationPreferences,
    messageInput: {
      id: "message-a",
      body: "Need review from @user-b",
      attachments: [attachment]
    }
  });

  assert.equal(result.message.mentions[0], "user-b");
  assert.equal(result.auditEvent.action, "message.sent");
  assert.equal(result.outboxEvent.eventType, "communication.message.sent");
  assert.equal(result.notifications.length, 1);
  assert.equal(result.notifications[0].type, "mention");
});

test("message revisions keep revision history semantics", () => {
  const revised = createMessageRevision(
    {
      id: "message-a",
      body: "hello",
      mentions: [],
      revision: 1
    },
    "hello @user-b"
  );

  assert.equal(revised.revision, 2);
  assert.equal(revised.mentions[0], "user-b");
  assert.ok(revised.editedAt);
});

test("search does not leak restricted messages to non-members", () => {
  const privateChannel = createChannel({
    id: "channel-private-a",
    tenantId: "tenant-a",
    name: "Legal",
    channelType: "legal_restricted_channel",
    visibilityClass: "legal_restricted",
    staged: true
  });
  const publicChannel = createChannel({
    id: "channel-team-a",
    tenantId: "tenant-a",
    name: "Team",
    channelType: "team_channel",
    visibilityClass: "team_only",
    staged: true
  });
  const channelMap = new Map([
    [privateChannel.id, privateChannel],
    [publicChannel.id, publicChannel]
  ]);
  const session = createSyntheticSession({
    sessionId: "s1",
    tenantId: "tenant-a",
    userId: "user-a",
    organizationRole: "employee",
    staged: true
  });
  const memberships = [
    createChannelMembership({
      id: "membership-public-a",
      tenantId: "tenant-a",
      channelId: publicChannel.id,
      userId: "user-a",
      staged: true
    })
  ];
  const messages = [
    {
      id: "message-legal",
      tenantId: "tenant-a",
      channelId: privateChannel.id,
      senderUserId: "user-b",
      body: "confidential permit risk",
      mentions: [],
      attachments: [],
      references: [],
      revision: 1,
      deleted: false,
      staged: true
    },
    {
      id: "message-team",
      tenantId: "tenant-a",
      channelId: publicChannel.id,
      senderUserId: "user-b",
      body: "permit checklist shared",
      mentions: [],
      attachments: [],
      references: [],
      revision: 1,
      deleted: false,
      staged: true
    }
  ];

  const results = searchMessages({
    session,
    channelMap,
    channelMemberships: memberships,
    messages,
    query: "permit"
  });

  assert.equal(results.length, 1);
  assert.equal(results[0].id, "message-team");
});

test("muted channels do not notify unless directly mentioned", () => {
  const notifications = buildNotificationEvents({
    message: {
      id: "message-a",
      mentions: [],
      body: "status update"
    },
    channel: {
      id: "channel-a",
      tenantId: "tenant-a",
      channelType: "team_channel"
    },
    channelMemberships: [
      {
        channelId: "channel-a",
        userId: "user-b"
      }
    ],
    notificationPreferences: [
      createNotificationPreference({
        userId: "user-b",
        tenantId: "tenant-a",
        mutedChannelIds: ["channel-a"]
      })
    ],
    senderUserId: "user-a"
  });

  assert.equal(notifications.length, 0);
});

test("markMessageRead requires readable channel access", () => {
  const session = createSyntheticSession({
    sessionId: "s1",
    tenantId: "tenant-a",
    userId: "user-a",
    organizationRole: "employee",
    staged: true
  });
  const channel = createChannel({
    id: "channel-a",
    tenantId: "tenant-a",
    name: "Team",
    channelType: "team_channel",
    visibilityClass: "team_only",
    staged: true
  });

  const result = markMessageRead({
    session,
    message: { id: "message-a" },
    channel,
    channelMemberships: []
  });

  assert.equal(result.id, "read-message-a-user-a");
});
