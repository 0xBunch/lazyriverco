// Channel constants. v1 ships a single channel — `mensleague`, the main
// lane of the clubhouse. The schema is multi-channel-ready (see Channel,
// AgentChannel, Message.channelId in prisma/schema.prisma) but no UI for
// switching exists yet.
//
// The default channel's UUID is hardcoded here AND in the seed migration
// (prisma/migrations/20260415162547_add_channels_member_facts_relationships_canon/migration.sql).
// They MUST stay in sync. Pragmatic over a runtime DB lookup: the value
// never changes between deploys, and avoiding the round-trip per message
// keeps the chat write path cheap.

export const DEFAULT_CHANNEL_SLUG = "mensleague" as const;
export const DEFAULT_CHANNEL_ID = "449457c4-7a9a-40f6-9634-b146be5580f3" as const;
