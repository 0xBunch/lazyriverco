-- AlterTable
-- Note: Prisma's diff engine also emitted `ALTER COLUMN "tags" DROP DEFAULT`
-- here, plus unrelated DROP DEFAULTs on AgentRelationship/ClubhouseCanon/Lore.
-- Those are drift artifacts (prior CREATE TABLE statements declared DB-level
-- defaults that the Prisma schema never modeled). Stripped from this
-- migration to keep the PR scoped to calendar work. Drift tracked separately.
ALTER TABLE "CalendarEntry" ADD COLUMN     "body" TEXT,
ADD COLUMN     "videoEmbedUrl" TEXT;

-- CreateTable
CREATE TABLE "CalendarEntryMedia" (
    "id" TEXT NOT NULL,
    "calendarEntryId" TEXT NOT NULL,
    "mediaId" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "isCover" BOOLEAN NOT NULL DEFAULT false,
    "caption" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CalendarEntryMedia_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CalendarEntryMedia_calendarEntryId_position_idx" ON "CalendarEntryMedia"("calendarEntryId", "position");

-- CreateIndex
CREATE INDEX "CalendarEntryMedia_mediaId_idx" ON "CalendarEntryMedia"("mediaId");

-- CreateIndex
CREATE UNIQUE INDEX "CalendarEntryMedia_calendarEntryId_mediaId_key" ON "CalendarEntryMedia"("calendarEntryId", "mediaId");

-- AddForeignKey
ALTER TABLE "CalendarEntryMedia" ADD CONSTRAINT "CalendarEntryMedia_calendarEntryId_fkey" FOREIGN KEY ("calendarEntryId") REFERENCES "CalendarEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarEntryMedia" ADD CONSTRAINT "CalendarEntryMedia_mediaId_fkey" FOREIGN KEY ("mediaId") REFERENCES "Media"("id") ON DELETE CASCADE ON UPDATE CASCADE;
