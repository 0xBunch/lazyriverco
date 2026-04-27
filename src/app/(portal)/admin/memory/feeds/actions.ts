"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { pollFeed } from "@/lib/feed-poller";
import type { FeedKind } from "@prisma/client";

// Admin actions for /admin/memory/feeds. All actions follow the same shape:
//   - require ADMIN (middleware + role check — belt + suspenders)
//   - revalidatePath to refresh the list
//   - redirect back to /admin/memory/feeds with a ?msg= or ?error= flash so
//     the page can render the outcome without a client-side action
//     state hook (keeps the form invocations as plain `<form action>`
//     without wrapping in a client component)
//
// `pollFeedNow` is the interactive poll button. It's bounded by the
// same pollFeed() entry point the cron uses, so the advisory lock
// prevents an admin button + a cron tick from double-polling the
// same feed at the same second.

const MAX_NAME = 80;
const MAX_URL = 2048;
const VALID_KINDS = ["NEWS", "MEDIA"] as const satisfies readonly FeedKind[];

// ---------------------------------------------------------------------------

export async function createFeed(fd: FormData): Promise<void> {
  const admin = await requireAdmin();

  const name = (fd.get("name") ?? "").toString().trim().slice(0, MAX_NAME);
  const url = (fd.get("url") ?? "").toString().trim().slice(0, MAX_URL);
  const kindRaw = (fd.get("kind") ?? "").toString();
  const pollIntervalMin = Number(fd.get("pollIntervalMin") ?? 30);

  if (!name) return back({ error: "Name is required." });
  if (!url) return back({ error: "URL is required." });
  if (!/^https?:\/\/.+/i.test(url)) {
    return back({ error: "URL must start with http:// or https://" });
  }
  if (!VALID_KINDS.includes(kindRaw as FeedKind)) {
    return back({ error: "Kind must be NEWS or MEDIA." });
  }
  if (
    !Number.isFinite(pollIntervalMin) ||
    pollIntervalMin < 5 ||
    pollIntervalMin > 1440
  ) {
    return back({ error: "Poll interval must be between 5 and 1440 minutes." });
  }

  try {
    await prisma.feed.create({
      data: {
        name,
        url,
        kind: kindRaw as FeedKind,
        pollIntervalMin,
        ownerId: admin.id,
      },
    });
  } catch (e) {
    if (isPrismaUniqueViolation(e)) {
      return back({ error: "A feed with that URL already exists." });
    }
    console.error("createFeed failed", e);
    return back({ error: "Couldn't save the feed." });
  }

  revalidatePath("/admin/memory/feeds");
  return back({ msg: `Feed "${name}" created.` });
}

// ---------------------------------------------------------------------------

export async function toggleFeed(fd: FormData): Promise<void> {
  await requireAdmin();

  const id = (fd.get("id") ?? "").toString();
  if (!id) return back({ error: "Missing feed id." });

  const feed = await prisma.feed.findUnique({
    where: { id },
    select: { enabled: true, autoDisabledAt: true },
  });
  if (!feed) return back({ error: "Feed not found." });

  await prisma.feed.update({
    where: { id },
    data: {
      enabled: !feed.enabled,
      // Re-enabling a breaker-tripped feed should also clear the
      // auto-disable + failure counter so the next poll has a fresh
      // slate. Otherwise computeHealth stays FAILED forever.
      ...(feed.autoDisabledAt && !feed.enabled
        ? { autoDisabledAt: null, consecutivePollFailures: 0, lastError: null }
        : {}),
    },
  });
  revalidatePath("/admin/memory/feeds");
  return back({ msg: feed.enabled ? "Disabled." : "Enabled." });
}

// ---------------------------------------------------------------------------

export async function deleteFeed(fd: FormData): Promise<void> {
  await requireAdmin();

  const id = (fd.get("id") ?? "").toString();
  if (!id) return back({ error: "Missing feed id." });

  // Cascade: NewsItem + FeedPollLog rows tied to this feed are
  // ON DELETE CASCADE in the schema, so they drop with the row.
  // Media rows (MEDIA-kind ingests) are ON DELETE SET NULL — they
  // survive as plain curated library entries.
  try {
    await prisma.feed.delete({ where: { id } });
  } catch (e) {
    console.error("deleteFeed failed", e);
    return back({ error: "Couldn't delete the feed." });
  }
  revalidatePath("/admin/memory/feeds");
  return back({ msg: "Feed deleted." });
}

// ---------------------------------------------------------------------------

export async function pollFeedNow(fd: FormData): Promise<void> {
  await requireAdmin();

  const id = (fd.get("id") ?? "").toString();
  if (!id) return back({ error: "Missing feed id." });

  // Next.js `redirect()` throws NEXT_REDIRECT for control flow — it
  // MUST NOT be caught. Keep the try/catch tight around the actual
  // work; `return back(...)` (which calls redirect) lives outside.
  let outcome;
  try {
    outcome = await pollFeed(id);
  } catch (e) {
    console.error("pollFeedNow failed", e);
    return back({ error: "Poll failed — check server logs." });
  }
  revalidatePath("/admin/memory/feeds");
  return back({ msg: formatOutcome(outcome) });
}

// ---------------------------------------------------------------------------

function formatOutcome(
  o: Awaited<ReturnType<typeof pollFeed>>,
): string {
  switch (o.outcome) {
    case "success":
      return `Polled — ${o.inserted} new, ${o.skipped} skipped (${o.durationMs}ms).`;
    case "partial":
      return `Polled with ${o.errors.length} error${o.errors.length === 1 ? "" : "s"} — ${o.inserted} new, ${o.skipped} skipped.`;
    case "failure":
      return `Poll failed at ${o.error.stage}: ${o.error.message}`;
    case "skipped":
      return o.reason === "locked"
        ? "Another poll is already running for this feed."
        : "Window hasn't elapsed — try again shortly.";
  }
}

function back(flash: { msg?: string; error?: string }): never {
  const params = new URLSearchParams();
  if (flash.msg) params.set("msg", flash.msg);
  if (flash.error) params.set("error", flash.error);
  const qs = params.toString();
  redirect(qs ? `/admin/memory/feeds?${qs}` : "/admin/memory/feeds");
}

function isPrismaUniqueViolation(e: unknown): boolean {
  return (
    !!e &&
    typeof e === "object" &&
    "code" in e &&
    (e as { code: unknown }).code === "P2002"
  );
}
