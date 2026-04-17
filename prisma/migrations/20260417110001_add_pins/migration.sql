-- Add Pin: user-scoped polymorphic pin record. Exactly one of
-- conversationId or characterId is non-null — enforced by a raw-SQL
-- CHECK constraint (XOR) below, matching the pattern Message uses for
-- channelId/conversationId. Prisma can't model CHECK in schema.prisma
-- but leaves raw-SQL CHECKs alone during introspection, so this
-- survives future `migrate dev` runs.
--
-- Only conversation pins are wired through the app today. The
-- character column is provisioned for a "starred agents" surface in a
-- later pass without needing a second migration.

-- CreateTable
CREATE TABLE "Pin" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "conversationId" TEXT,
    "characterId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Pin_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Pin_userId_createdAt_idx" ON "Pin"("userId", "createdAt" DESC);

-- CreateIndex
-- Idempotency: pinning the same conversation twice is a no-op. Note
-- nullable-column uniqueness semantics: (u, NULL) does not collide
-- with (u, NULL) in postgres, so the character pin and conversation
-- pin each need their own index.
CREATE UNIQUE INDEX "Pin_userId_conversationId_key" ON "Pin"("userId", "conversationId");

-- CreateIndex
CREATE UNIQUE INDEX "Pin_userId_characterId_key" ON "Pin"("userId", "characterId");

-- AddForeignKey
ALTER TABLE "Pin" ADD CONSTRAINT "Pin_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pin" ADD CONSTRAINT "Pin_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pin" ADD CONSTRAINT "Pin_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "Character"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- The load-bearing invariant: exactly one of conversationId/characterId
-- is set on every row. Every write site MUST honor this — pick one
-- discriminator per pin.
ALTER TABLE "Pin"
  ADD CONSTRAINT "Pin_exactly_one_target_chk"
  CHECK (
    ("conversationId" IS NOT NULL AND "characterId" IS NULL)
    OR ("conversationId" IS NULL AND "characterId" IS NOT NULL)
  );
