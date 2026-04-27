import { prisma } from "@/lib/prisma";
import {
  createHighlight,
  deleteHighlight,
  toggleHighlightHidden,
} from "./actions";

export const dynamic = "force-dynamic";

type SearchParams = { msg?: string; error?: string };

const SPORTS = ["NFL", "NBA", "MLB", "NHL", "MLS", "UFC"] as const;

export default async function AdminSportsHighlightsPage({
  searchParams,
}: {
  searchParams?: SearchParams;
}) {
  const flashMsg = searchParams?.msg;
  const flashError = searchParams?.error;

  const highlights = await prisma.sportsHighlight.findMany({
    orderBy: [{ hidden: "asc" }, { sortOrder: "desc" }, { publishedAt: "desc" }],
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
        Curated YouTube highlight clips for the /sports page. Paste a YouTube
        URL (watch, share, shorts, or embed); the video ID + thumbnail are
        derived automatically. Title and channel are pasted manually for
        now — automated polling lands in a follow-up. Higher{" "}
        <strong className="font-semibold text-bone-100">sortOrder</strong>{" "}
        wins; ties broken by publish date.
      </p>

      <form
        action={createHighlight}
        className="space-y-3 rounded-2xl border border-bone-700 bg-bone-900 p-5"
      >
        <p className="font-display text-sm font-semibold text-bone-50">
          Add a highlight
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <input
            name="youtubeUrl"
            placeholder="YouTube URL or 11-char video ID"
            required
            className={`${inputCls} sm:col-span-2`}
          />
          <input
            name="title"
            placeholder="Title (e.g. Mahomes 4th & goal TD)"
            required
            maxLength={280}
            className={`${inputCls} sm:col-span-2`}
          />
          <input
            name="channel"
            placeholder="Channel (e.g. NFL)"
            required
            maxLength={120}
            className={inputCls}
          />
          <select name="sport" required defaultValue="NFL" className={inputCls}>
            {SPORTS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <input
            name="durationSec"
            type="number"
            min={0}
            placeholder="Duration in seconds (optional)"
            className={inputCls}
          />
          <input
            name="sortOrder"
            type="number"
            defaultValue={0}
            placeholder="Sort order (higher wins)"
            className={inputCls}
          />
        </div>
        <div className="flex justify-end">
          <button type="submit" className={btnPrimaryCls}>
            Add highlight
          </button>
        </div>
      </form>

      {highlights.length === 0 ? (
        <p className="rounded-2xl border border-bone-800 bg-bone-950 p-6 text-center text-sm italic text-bone-400">
          No highlights yet. Paste a YouTube URL above to get started.
        </p>
      ) : (
        <ul className="space-y-3">
          {highlights.map((h) => (
            <li
              key={h.id}
              className={`flex items-start gap-4 rounded-2xl border p-4 ${
                h.hidden
                  ? "border-bone-800 bg-bone-950 opacity-60"
                  : "border-bone-700 bg-bone-900"
              }`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={h.thumbUrl}
                alt=""
                className="aspect-video w-32 flex-shrink-0 rounded-md object-cover ring-1 ring-bone-800"
              />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-2">
                  <p className="font-display text-base font-semibold text-bone-50">
                    {h.title}
                  </p>
                  <span className="rounded-md bg-bone-800 px-2 py-0.5 text-[0.7rem] font-mono text-bone-300">
                    {h.sport}
                  </span>
                  {h.hidden && (
                    <span className="text-[0.7rem] uppercase tracking-widest text-bone-500">
                      Hidden
                    </span>
                  )}
                </div>
                <p className="mt-0.5 text-xs text-bone-400">
                  {h.channel} · sort {h.sortOrder} ·{" "}
                  <a
                    href={`https://www.youtube.com/watch?v=${h.youtubeVideoId}`}
                    target="_blank"
                    rel="noreferrer"
                    className="underline decoration-bone-700 underline-offset-2 hover:text-bone-200"
                  >
                    {h.youtubeVideoId}
                  </a>
                  {h.durationSec != null && ` · ${formatDuration(h.durationSec)}`}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <form action={toggleHighlightHidden}>
                    <input type="hidden" name="id" value={h.id} />
                    <button type="submit" className={btnCls}>
                      {h.hidden ? "Unhide" : "Hide"}
                    </button>
                  </form>
                  <form action={deleteHighlight}>
                    <input type="hidden" name="id" value={h.id} />
                    <button type="submit" className={btnDangerCls}>
                      Delete
                    </button>
                  </form>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

const inputCls =
  "rounded-lg border border-bone-700 bg-bone-950 px-3 py-2 text-sm text-bone-50 placeholder-bone-500 focus:border-claude-500 focus:outline-none focus:ring-1 focus:ring-claude-500";
const btnPrimaryCls =
  "rounded-lg bg-claude-600 px-4 py-2 text-sm font-medium text-bone-50 hover:bg-claude-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-claude-400";
const btnCls =
  "inline-flex items-center rounded-md border border-bone-700 bg-bone-800 px-3 py-1.5 text-xs font-medium text-bone-100 hover:bg-bone-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-claude-500";
const btnDangerCls =
  "inline-flex items-center rounded-md border border-red-900/50 bg-red-950/40 px-3 py-1.5 text-xs font-medium text-red-200 hover:bg-red-900/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500";
