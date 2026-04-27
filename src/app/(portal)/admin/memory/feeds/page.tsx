import { prisma } from "@/lib/prisma";
import { computeHealth } from "@/lib/feed-health";
import { HealthChip } from "@/components/HealthChip";
import {
  createFeed,
  deleteFeed,
  pollFeedNow,
  setFeedTags,
  toggleFeed,
} from "./actions";

export const dynamic = "force-dynamic";

type SearchParams = { msg?: string; error?: string };

export default async function AdminFeedsPage({
  searchParams,
}: {
  searchParams?: SearchParams;
}) {
  const flashMsg = searchParams?.msg;
  const flashError = searchParams?.error;

  const feeds = await prisma.feed.findMany({
    orderBy: [{ enabled: "desc" }, { createdAt: "desc" }],
    include: {
      _count: { select: { items: true, mediaItems: true, pollLogs: true } },
      owner: { select: { displayName: true } },
    },
  });

  return (
    <div className="space-y-6">
      {flashMsg && (
        <p className="rounded-lg border border-emerald-700/50 bg-emerald-900/30 px-4 py-2 text-sm text-emerald-200">
          {flashMsg}
        </p>
      )}
      {flashError && (
        <p className="rounded-lg border border-red-800/50 bg-red-900/30 px-4 py-2 text-sm text-red-200">
          {flashError}
        </p>
      )}

      <p className="text-sm text-bone-300">
        Automated feeds. <strong className="font-semibold text-bone-100">NEWS</strong>{" "}
        feeds drop RSS items into a separate news surface; <strong className="font-semibold text-bone-100">MEDIA</strong>{" "}
        feeds flow into the library (hidden from the default grid — flip the
        &ldquo;include auto-feed items&rdquo; toggle to see them). Poll cron
        runs every 15 min; you can also hit <em>Poll now</em> per feed. Feeds
        auto-disable after 5 consecutive failures — flip <em>Enabled</em>{" "}
        back on to clear the breaker.
      </p>

      {/* Create form */}
      <form
        action={createFeed}
        className="space-y-3 rounded-2xl border border-bone-700 bg-bone-900 p-5"
      >
        <p className="font-display text-sm font-semibold text-bone-50">
          Add a feed
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <input
            name="name"
            placeholder="Name (e.g. The Athletic — NFL)"
            required
            maxLength={80}
            className="rounded-lg border border-bone-700 bg-bone-950 px-3 py-2 text-sm text-bone-50 placeholder-bone-500 focus:border-claude-500 focus:outline-none focus:ring-1 focus:ring-claude-500"
          />
          <input
            name="url"
            type="url"
            placeholder="https://…/feed.xml"
            required
            maxLength={2048}
            className="rounded-lg border border-bone-700 bg-bone-950 px-3 py-2 text-sm text-bone-50 placeholder-bone-500 focus:border-claude-500 focus:outline-none focus:ring-1 focus:ring-claude-500"
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-[auto_auto_auto_auto_1fr]">
          <select
            name="kind"
            defaultValue="NEWS"
            aria-label="Feed kind"
            className="rounded-lg border border-bone-700 bg-bone-950 px-3 py-2 text-sm text-bone-50 focus:border-claude-500 focus:outline-none focus:ring-1 focus:ring-claude-500"
          >
            <option value="NEWS">NEWS</option>
            <option value="MEDIA">MEDIA</option>
          </select>
          <select
            name="category"
            defaultValue="GENERAL"
            aria-label="Feed category"
            className="rounded-lg border border-bone-700 bg-bone-950 px-3 py-2 text-sm text-bone-50 focus:border-claude-500 focus:outline-none focus:ring-1 focus:ring-claude-500"
          >
            <option value="GENERAL">GENERAL</option>
            <option value="SPORTS">SPORTS</option>
          </select>
          <select
            name="sport"
            defaultValue=""
            aria-label="Sport tag (optional, applied when category=SPORTS)"
            className="rounded-lg border border-bone-700 bg-bone-950 px-3 py-2 text-sm text-bone-50 focus:border-claude-500 focus:outline-none focus:ring-1 focus:ring-claude-500"
          >
            <option value="">— No sport —</option>
            <option value="NFL">NFL</option>
            <option value="NBA">NBA</option>
            <option value="MLB">MLB</option>
            <option value="NHL">NHL</option>
            <option value="MLS">MLS</option>
            <option value="UFC">UFC</option>
          </select>
          <input
            name="pollIntervalMin"
            type="number"
            defaultValue={30}
            min={5}
            max={1440}
            aria-label="Poll interval in minutes"
            className="w-24 rounded-lg border border-bone-700 bg-bone-950 px-3 py-2 text-sm text-bone-50 focus:border-claude-500 focus:outline-none focus:ring-1 focus:ring-claude-500"
          />
        </div>
        <div className="flex justify-end">
          <button
            type="submit"
            className="rounded-lg bg-claude-600 px-4 py-2 text-sm font-medium text-bone-50 hover:bg-claude-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-claude-400"
          >
            Add feed
          </button>
        </div>
      </form>

      {/* List */}
      {feeds.length === 0 ? (
        <p className="rounded-2xl border border-bone-800 bg-bone-950 p-6 text-center text-sm italic text-bone-400">
          No feeds yet. Add one above to get started.
        </p>
      ) : (
        <ul className="space-y-3">
          {feeds.map((feed) => {
            const health = computeHealth({
              enabled: feed.enabled,
              pollIntervalMin: feed.pollIntervalMin,
              lastPolledAt: feed.lastPolledAt,
              lastSuccessAt: feed.lastSuccessAt,
              lastItemAt: feed.lastItemAt,
              consecutivePollFailures: feed.consecutivePollFailures,
              autoDisabledAt: feed.autoDisabledAt,
            });
            const itemCount =
              feed.kind === "NEWS" ? feed._count.items : feed._count.mediaItems;
            const lastPolled = feed.lastPolledAt
              ? relativeTime(feed.lastPolledAt)
              : "never";
            const lastItem = feed.lastItemAt
              ? relativeTime(feed.lastItemAt)
              : "no items yet";
            return (
              <li
                key={feed.id}
                className="rounded-2xl border border-bone-700 bg-bone-900 p-5"
              >
                <div className="flex flex-wrap items-center gap-3">
                  <HealthChip
                    health={health}
                    title={feed.lastError ?? undefined}
                  />
                  <span className="rounded-md bg-bone-800 px-2 py-0.5 text-[0.7rem] font-mono text-bone-300">
                    {feed.kind}
                  </span>
                  <span
                    className={
                      feed.category === "SPORTS"
                        ? "rounded-md bg-sports-amber/15 px-2 py-0.5 text-[0.7rem] font-mono text-sports-amber"
                        : "rounded-md bg-bone-800 px-2 py-0.5 text-[0.7rem] font-mono text-bone-400"
                    }
                  >
                    {feed.category}
                    {feed.sport ? ` · ${feed.sport}` : ""}
                  </span>
                  <p className="font-display text-base font-semibold text-bone-50">
                    {feed.name}
                  </p>
                  <span className="text-xs text-bone-500">
                    · every {feed.pollIntervalMin}m
                  </span>
                </div>

                <p className="mt-1 truncate text-xs text-bone-400">
                  <a
                    href={feed.url}
                    target="_blank"
                    rel="noreferrer"
                    className="underline decoration-bone-700 underline-offset-2 hover:text-bone-200 hover:decoration-bone-500"
                  >
                    {feed.url}
                  </a>
                </p>

                <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-[0.75rem] sm:grid-cols-4">
                  <div>
                    <dt className="text-bone-500">Items</dt>
                    <dd className="tabular-nums text-bone-200">{itemCount}</dd>
                  </div>
                  <div>
                    <dt className="text-bone-500">Last polled</dt>
                    <dd className="tabular-nums text-bone-200">{lastPolled}</dd>
                  </div>
                  <div>
                    <dt className="text-bone-500">Newest item</dt>
                    <dd className="tabular-nums text-bone-200">{lastItem}</dd>
                  </div>
                  <div>
                    <dt className="text-bone-500">Polls logged</dt>
                    <dd className="tabular-nums text-bone-200">
                      {feed._count.pollLogs}
                    </dd>
                  </div>
                </dl>

                {feed.lastError && (
                  <p className="mt-3 rounded-md border border-red-900/50 bg-red-950/30 px-3 py-2 text-[0.75rem] text-red-200">
                    <span className="font-semibold">Last error:</span>{" "}
                    {feed.lastError}
                  </p>
                )}

                <div className="mt-4 flex flex-wrap gap-2">
                  <form action={pollFeedNow}>
                    <input type="hidden" name="id" value={feed.id} />
                    <button
                      type="submit"
                      className="rounded-md border border-bone-700 bg-bone-800 px-3 py-1.5 text-xs font-medium text-bone-100 hover:bg-bone-700"
                    >
                      Poll now
                    </button>
                  </form>
                  <form action={toggleFeed}>
                    <input type="hidden" name="id" value={feed.id} />
                    <button
                      type="submit"
                      className="rounded-md border border-bone-700 bg-bone-800 px-3 py-1.5 text-xs font-medium text-bone-100 hover:bg-bone-700"
                    >
                      {feed.enabled ? "Disable" : "Enable"}
                    </button>
                  </form>
                  <form action={setFeedTags} className="flex items-center gap-1">
                    <input type="hidden" name="id" value={feed.id} />
                    <select
                      name="category"
                      defaultValue={feed.category}
                      aria-label="Category"
                      className="rounded-md border border-bone-700 bg-bone-800 px-2 py-1 text-xs text-bone-100 focus:outline-none focus:ring-1 focus:ring-claude-500"
                    >
                      <option value="GENERAL">GENERAL</option>
                      <option value="SPORTS">SPORTS</option>
                    </select>
                    <select
                      name="sport"
                      defaultValue={feed.sport ?? ""}
                      aria-label="Sport tag"
                      className="rounded-md border border-bone-700 bg-bone-800 px-2 py-1 text-xs text-bone-100 focus:outline-none focus:ring-1 focus:ring-claude-500"
                    >
                      <option value="">— No sport —</option>
                      <option value="NFL">NFL</option>
                      <option value="NBA">NBA</option>
                      <option value="MLB">MLB</option>
                      <option value="NHL">NHL</option>
                      <option value="MLS">MLS</option>
                      <option value="UFC">UFC</option>
                    </select>
                    <button
                      type="submit"
                      className="rounded-md border border-bone-700 bg-bone-800 px-3 py-1.5 text-xs font-medium text-bone-100 hover:bg-bone-700"
                    >
                      Save tags
                    </button>
                  </form>
                  <form action={deleteFeed}>
                    <input type="hidden" name="id" value={feed.id} />
                    <button
                      type="submit"
                      className="rounded-md border border-red-900/50 bg-red-950/40 px-3 py-1.5 text-xs font-medium text-red-200 hover:bg-red-900/60"
                    >
                      Delete
                    </button>
                  </form>
                  <p className="ml-auto self-center text-[0.7rem] text-bone-500">
                    Owner: {feed.owner.displayName}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// Relative time label: "12 min ago", "3 days ago". Used for every
// timestamp on this page — keeping them relative saves the reader from
// doing TZ math mid-scan.
function relativeTime(d: Date): string {
  const diffMs = Date.now() - d.getTime();
  const abs = Math.abs(diffMs);
  const future = diffMs < 0;
  const mins = Math.round(abs / 60000);
  if (mins < 1) return future ? "in <1 min" : "just now";
  if (mins < 60) return future ? `in ${mins} min` : `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return future ? `in ${hours}h` : `${hours}h ago`;
  const days = Math.round(hours / 24);
  return future ? `in ${days}d` : `${days}d ago`;
}
