# Phase 2 Communication Data Dictionary

## Channel

- `id`
- `tenantId`
- `name`
- `channelType`
- `visibilityClass`
- `projectId`
- `teamId`
- `departmentId`
- `createdBy`
- `staged`

## ChannelMembership

- `id`
- `tenantId`
- `channelId`
- `userId`
- `membershipRole`
- `staged`

## Message

- `id`
- `tenantId`
- `channelId`
- `senderUserId`
- `body`
- `threadRootId`
- `mentions`
- `attachments`
- `references`
- `revision`
- `deleted`
- `staged`

## AttachmentReference

- `id`
- `tenantId`
- `fileRecordId`
- `fileClass`
- `staged`

## NotificationPreference

- `userId`
- `tenantId`
- `mutedChannelIds`
- `announcementNotifications`
- `mentionNotifications`
- `staged`

## ReadState

- `id`
- `tenantId`
- `channelId`
- `messageId`
- `userId`
- `staged`
