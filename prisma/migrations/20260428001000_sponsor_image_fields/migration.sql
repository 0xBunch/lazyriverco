-- PR C: banner-ad CMS for /sports. Adds optional banner image fields to
-- SportsSponsor (currently a text-only model) so an admin can upload an
-- IAB billboard or square asset; SponsorBreakRail renders the image when
-- present and the existing text treatment otherwise. The new columns are
-- all NULL-able with no default — pure catalog op, no row rewrite.
--
-- The CHECK constraint enforces the actions.ts validation in the database
-- as defense in depth: imageR2Key and imageShape must both be set or both
-- be null. Without it, a future code path that writes to SportsSponsor
-- could leak an inconsistent state. The image-altText is independent and
-- only requires being null-or-VARCHAR(280).
--
-- ACCESS EXCLUSIVE held for milliseconds; SportsSponsor is a tiny table
-- (~handful of rows), readers tolerate the brief pause.

SET lock_timeout      = '3s';
SET statement_timeout = '30s';

CREATE TYPE "SponsorImageShape" AS ENUM ('BILLBOARD', 'SQUARE');

ALTER TABLE "SportsSponsor"
  ADD COLUMN "imageR2Key"   TEXT,
  ADD COLUMN "imageAltText" VARCHAR(280),
  ADD COLUMN "imageShape"   "SponsorImageShape",
  ADD CONSTRAINT "SportsSponsor_image_consistency_check"
    CHECK (
      ("imageR2Key" IS NULL AND "imageShape" IS NULL)
      OR
      ("imageR2Key" IS NOT NULL AND "imageShape" IS NOT NULL)
    );
