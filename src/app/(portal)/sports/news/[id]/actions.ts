"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { SPORTS_NEWS_TAGS, type SportsNewsTag } from "@/lib/sports/news-tags";

const VALID_TAGS = new Set<string>(SPORTS_NEWS_TAGS);

/**
 * Replace the tag set on a NewsItem. Admin-only. Validates each
 * incoming value against the SPORTS_NEWS_TAGS preset — admin-added
 * "custom" tags would need their own surface (not in scope yet).
 */
export async function setNewsItemTags(fd: FormData): Promise<void> {
  await requireAdmin();

  const id = (fd.get("id") ?? "").toString();
  if (!id) return back(id, { error: "Missing item id." });

  // FormData.getAll returns each `name="tags"` checkbox value the
  // browser submitted as checked.
  const raw = fd.getAll("tags").map((v) => v.toString());
  const tags = Array.from(new Set(raw)).filter((t): t is SportsNewsTag =>
    VALID_TAGS.has(t),
  );

  await prisma.newsItem.update({
    where: { id },
    data: { tags },
  });
  revalidatePath(`/sports/news/${id}`);
  revalidatePath("/sports/news");
  return back(id, { msg: tags.length === 0 ? "Tags cleared." : `Saved ${tags.length} tag${tags.length === 1 ? "" : "s"}.` });
}

/**
 * Toggle hidden flag on a NewsItem. Admin-only. Hidden items are
 * filtered out of the public /sports HeadlinesRail and /sports/news
 * index. Detail page still resolves so admins can flip them back.
 */
export async function toggleNewsItemHidden(fd: FormData): Promise<void> {
  await requireAdmin();

  const id = (fd.get("id") ?? "").toString();
  if (!id) return back(id, { error: "Missing item id." });

  const item = await prisma.newsItem.findUnique({
    where: { id },
    select: { hidden: true, title: true },
  });
  if (!item) return back(id, { error: "Item not found." });

  await prisma.newsItem.update({
    where: { id },
    data: { hidden: !item.hidden },
  });
  revalidatePath(`/sports/news/${id}`);
  revalidatePath("/sports/news");
  revalidatePath("/sports");
  return back(id, {
    msg: item.hidden ? "Unhidden — back on the public list." : "Hidden from the public list.",
  });
}

/**
 * Hard delete a NewsItem. Admin-only. Use sparingly — for items that
 * shouldn't have been polled at all (spam, duplicates the dedup
 * missed). Soft-hide via toggleNewsItemHidden is the usual path.
 *
 * After delete, redirect to the index since the detail URL will 404.
 */
export async function deleteNewsItem(fd: FormData): Promise<void> {
  await requireAdmin();

  const id = (fd.get("id") ?? "").toString();
  if (!id) {
    const params = new URLSearchParams({ error: "Missing item id." });
    redirect(`/sports/news?${params.toString()}`);
  }

  try {
    await prisma.newsItem.delete({ where: { id } });
  } catch (e) {
    console.error("deleteNewsItem failed", e);
    return back(id, { error: "Couldn't delete the item." });
  }
  revalidatePath("/sports/news");
  revalidatePath("/sports");
  const params = new URLSearchParams({ msg: "Story deleted." });
  redirect(`/sports/news?${params.toString()}`);
}

function back(
  id: string,
  flash: { msg?: string; error?: string },
): never {
  const params = new URLSearchParams();
  if (flash.msg) params.set("msg", flash.msg);
  if (flash.error) params.set("error", flash.error);
  const qs = params.toString();
  redirect(qs ? `/sports/news/${id}?${qs}` : `/sports/news/${id}`);
}
