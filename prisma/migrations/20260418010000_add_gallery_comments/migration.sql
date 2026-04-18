-- Gallery v1.2 — real comments on gallery items. Replaces the Message-LIKE-
-- scan "Thread" section in the UI (which stays as a demoted "Mentioned in
-- chats" panel) with a proper Comment row per utterance.
--
-- Soft-delete via deletedAt so tombstones render "[comment removed]" in the
-- UI. Replies deferred — no parentId in this migration; easy to add later.

-- CreateTable
CREATE TABLE "Comment" (
    "id" TEXT NOT NULL,
    "mediaId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Comment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex — primary read path: "all comments for this media, chronological".
CREATE INDEX "Comment_mediaId_createdAt_idx" ON "Comment"("mediaId", "createdAt");

-- AddForeignKey — cascade on Media hard-delete (rare; Media.status=DELETED
-- soft-delete doesn't touch this). userId defaults to NO ACTION so we don't
-- nuke comment history on a hypothetical user removal.
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_mediaId_fkey" FOREIGN KEY ("mediaId") REFERENCES "Media"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE NO ACTION ON UPDATE CASCADE;
