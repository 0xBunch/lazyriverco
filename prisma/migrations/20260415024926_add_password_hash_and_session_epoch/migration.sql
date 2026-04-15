-- AlterTable
ALTER TABLE "User" ADD COLUMN     "passwordHash" TEXT,
ADD COLUMN     "sessionEpoch" INTEGER NOT NULL DEFAULT 0;
