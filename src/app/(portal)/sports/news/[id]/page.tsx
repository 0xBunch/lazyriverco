import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { setNewsItemTags } from "./actions";
import { SPORTS_NEWS_TAGS } from "@/lib/sports/news-tags";

export const dynamic = "force-dynamic";

type SearchParams = { msg?: string; error?: string };

export default async function SportsNewsDetail({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams?: SearchParams;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/start");
  const isAdmin = user.role === "ADMIN";

  const item = await prisma.newsItem.findUnique({
    where: { id: params.id },
    include: { feed: { select: { name: true, category: true } } },
  });

  // Item must exist and belong to a SPORTS feed — leak check so a
  // direct /sports/news/[GENERAL-id] URL doesn't surface library
  // items on the sports surface.
  if (!item || item.feed.category !== "SPORTS" || item.hidden) {
    notFound();
  }

  // Related — same primary tag (or same sport if no tags), excluding
  // the current item. Cheap on the GIN index.
  const relatedWhere = item.tags.length > 0
    ? { tags: { has: item.tags[0] } }
    : item.sport
      ? { sport: item.sport }
      : null;
  const related = relatedWhere
    ? await prisma.newsItem.findMany({
        where: {
          ...relatedWhere,
          hidden: false,
          feed: { category: "SPORTS", enabled: true },
          NOT: { id: item.id },
        },
        orderBy: { publishedAt: "desc" },
        take: 5,
        include: { feed: { select: { name: true } } },
      })
    : [];

  const when = item.publishedAt ?? item.ingestedAt;
  const flashMsg = searchParams?.msg;
  const flashError = searchParams?.error;

  return (
    <main className="w-full">
      {/* Hero — full-bleed image when present, gradient placeholder when not */}
      {item.ogImageUrl ? (
        <section className="relative w-full overflow-hidden">
          <div
            aria-hidden="true"
            className="absolute inset-0"
            style={{
              backgroundImage: `url(${JSON.stringify(item.ogImageUrl).slice(1, -1)})`,
              backgroundSize: "cover",
              backgroundPosition: "center",
            }}
          />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={item.ogImageUrl}
            alt=""
            className="aspect-[16/8] w-full object-cover md:aspect-[16/6]"
          />
          <div
            aria-hidden="true"
            className="absolute inset-0 bg-gradient-to-t from-bone-950 via-bone-950/30 to-transparent"
          />
        </section>
      ) : (
        <section
          aria-hidden="true"
          className="relative w-full bg-gradient-to-br from-claude-950 via-bone-950 to-bone-900"
          style={{ minHeight: "30vh" }}
        />
      )}

      <div className="mx-auto max-w-3xl px-4 py-8 md:px-6 md:py-12">
        {flashMsg && (
          <p className="mb-4 rounded-lg border border-emerald-700/50 bg-emerald-900/30 px-4 py-2 text-sm text-emerald-200">
            {flashMsg}
          </p>
        )}
        {flashError && (
          <p className="mb-4 rounded-lg border border-red-800/50 bg-red-900/30 px-4 py-2 text-sm text-red-200">
            {flashError}
          </p>
        )}

        <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
          <Link
            href="/sports/news"
            className="font-display text-[10px] font-semibold uppercase tracking-[0.28em] text-claude-300 hover:text-claude-200"
          >
            ← Sports news
          </Link>
          <span aria-hidden="true" className="text-bone-700">·</span>
          <span className="font-display text-[10px] font-semibold uppercase tracking-[0.28em] text-bone-400">
            {item.feed.name}
          </span>
          <span aria-hidden="true" className="text-bone-700">·</span>
          <time
            dateTime={when.toISOString()}
            className="tabular-nums text-bone-400"
          >
            {when.toLocaleString("en-US", {
              weekday: "short",
              month: "short",
              day: "numeric",
              hour: "numeric",
              minute: "2-digit",
            })}
          </time>
          {item.sport && (
            <span className="rounded-full bg-bone-900 px-2 py-0.5 text-[10px] tracking-widest text-bone-200 ring-1 ring-bone-700">
              {item.sport}
            </span>
          )}
        </div>

        <h1 className="font-display text-3xl font-semibold tracking-tight text-bone-50 text-balance md:text-4xl lg:text-5xl">
          {item.title}
        </h1>
        {item.author && (
          <p className="mt-3 text-sm text-bone-400">By {item.author}</p>
        )}

        {item.tags.length > 0 && (
          <ul className="mt-5 flex flex-wrap gap-1.5">
            {item.tags.map((t) => (
              <li key={t}>
                <Link
                  href={`/sports/news?tag=${encodeURIComponent(t)}`}
                  className="inline-flex items-center rounded-full bg-bone-900 px-2.5 py-0.5 text-[11px] tracking-widest text-bone-200 ring-1 ring-bone-700 hover:bg-bone-800 hover:text-bone-100"
                >
                  {t}
                </Link>
              </li>
            ))}
          </ul>
        )}

        {item.excerpt && (
          <p className="mt-6 text-base leading-relaxed text-bone-200 text-pretty md:text-lg">
            {item.excerpt}
          </p>
        )}

        <div className="mt-8 flex flex-wrap items-center gap-3">
          <a
            href={item.originalUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-full bg-claude-600 px-5 py-2.5 text-sm font-medium text-bone-50 hover:bg-claude-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-claude-400"
          >
            Read full story on {item.feed.name}
            <span aria-hidden="true">↗</span>
          </a>
        </div>

        {/* Admin tag editor */}
        {isAdmin && (
          <section className="mt-10 rounded-2xl border border-bone-800 bg-bone-900/40 p-5">
            <h2 className="font-display text-[10px] font-semibold uppercase tracking-[0.28em] text-bone-400">
              Admin · Tags
            </h2>
            <form action={setNewsItemTags} className="mt-3 space-y-3">
              <input type="hidden" name="id" value={item.id} />
              <div className="flex flex-wrap gap-2">
                {SPORTS_NEWS_TAGS.map((tag) => {
                  const checked = item.tags.includes(tag);
                  return (
                    <label
                      key={tag}
                      className={
                        checked
                          ? "inline-flex cursor-pointer items-center gap-1.5 rounded-full bg-claude-900 px-3 py-1 text-xs text-claude-100 ring-1 ring-claude-700"
                          : "inline-flex cursor-pointer items-center gap-1.5 rounded-full bg-bone-900 px-3 py-1 text-xs text-bone-300 ring-1 ring-bone-800 hover:bg-bone-800 hover:text-bone-100"
                      }
                    >
                      <input
                        type="checkbox"
                        name="tags"
                        value={tag}
                        defaultChecked={checked}
                        className="sr-only peer"
                      />
                      <span aria-hidden="true">{checked ? "✓" : "+"}</span>
                      <span>{tag}</span>
                    </label>
                  );
                })}
              </div>
              <button
                type="submit"
                className="rounded-lg bg-claude-600 px-4 py-2 text-sm font-medium text-bone-50 hover:bg-claude-500"
              >
                Save tags
              </button>
            </form>
          </section>
        )}

        {/* Related */}
        {related.length > 0 && (
          <section className="mt-12 border-t border-bone-800 pt-8">
            <h2 className="font-display text-[10px] font-semibold uppercase tracking-[0.28em] text-bone-400">
              {item.tags.length > 0
                ? `More tagged ${item.tags[0]}`
                : `More ${item.sport ?? "sports"}`}
            </h2>
            <ul className="mt-4 space-y-1">
              {related.map((r) => (
                <li key={r.id}>
                  <Link
                    href={`/sports/news/${r.id}`}
                    className="group flex items-baseline gap-3 rounded-sm py-2 hover:bg-bone-900/30"
                  >
                    <span className="font-display text-[10px] font-semibold uppercase tracking-[0.28em] text-bone-500">
                      {r.feed.name}
                    </span>
                    <span className="font-display text-sm text-bone-100 group-hover:text-claude-100">
                      {r.title}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </main>
  );
}
