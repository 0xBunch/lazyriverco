import { prisma } from "@/lib/prisma";
import { startOfUtcDay } from "@/lib/sports/wag-rotation";
import { setFeature } from "./actions";

export const dynamic = "force-dynamic";

type SearchParams = { msg?: string; error?: string };

const QUEUE_DAYS = 14; // today + next 13 = 14-day rolling window

export default async function AdminWagsQueuePage({
  searchParams,
}: {
  searchParams?: SearchParams;
}) {
  const flashMsg = searchParams?.msg;
  const flashError = searchParams?.error;

  const today = startOfUtcDay();
  const horizon = new Date(today);
  horizon.setUTCDate(horizon.getUTCDate() + QUEUE_DAYS);

  const [wags, features] = await Promise.all([
    prisma.sportsWag.findMany({
      where: { hidden: false },
      orderBy: [{ sport: "asc" }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        athleteName: true,
        sport: true,
        caption: true,
      },
    }),
    prisma.sportsWagFeature.findMany({
      where: { featureDate: { gte: today, lt: horizon } },
      include: { wag: { select: { name: true, sport: true, hidden: true } } },
    }),
  ]);

  const featuresByDate = new Map(
    features.map((f) => [f.featureDate.toISOString().slice(0, 10), f]),
  );

  const days = Array.from({ length: QUEUE_DAYS }, (_, i) => {
    const d = new Date(today);
    d.setUTCDate(d.getUTCDate() + i);
    return d;
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
        Pin a{" "}
        <a
          href="/admin/sports/wags"
          className="text-claude-300 underline decoration-claude-700 underline-offset-2 hover:text-claude-200"
        >
          rostered WAG
        </a>{" "}
        to a specific UTC date. The /sports landing reads{" "}
        <code className="rounded bg-bone-900 px-1.5 py-0.5 text-bone-200">
          where featureDate = today
        </code>
        ; days without a row render &ldquo;On break today.&rdquo; Caption
        defaults to the WAG&rsquo;s default caption — override here per
        feature if you want different copy on a given date.
      </p>

      {wags.length === 0 ? (
        <p className="rounded-2xl border border-bone-800 bg-bone-950 p-6 text-center text-sm italic text-bone-400">
          No WAGs in the roster yet. Add some at{" "}
          <a
            href="/admin/sports/wags"
            className="text-claude-300 underline decoration-claude-700 underline-offset-2 hover:text-claude-200"
          >
            /admin/sports/wags
          </a>{" "}
          first.
        </p>
      ) : (
        <ul className="space-y-2">
          {days.map((day) => {
            const iso = day.toISOString().slice(0, 10);
            const feature = featuresByDate.get(iso);
            const isToday = iso === today.toISOString().slice(0, 10);
            return (
              <li
                key={iso}
                className={`rounded-xl border p-4 ${
                  isToday
                    ? "border-claude-600/60 bg-claude-950/30"
                    : "border-bone-800 bg-bone-900"
                }`}
              >
                <form
                  action={setFeature}
                  className="flex flex-wrap items-center gap-3"
                >
                  <input type="hidden" name="featureDate" value={iso} />
                  <div className="w-32">
                    <p className="font-display text-sm font-semibold tabular-nums text-bone-50">
                      {formatDay(day)}
                    </p>
                    <p className="text-[0.7rem] uppercase tracking-widest text-bone-500">
                      {isToday ? "Today" : weekdayLabel(day)}
                    </p>
                  </div>
                  <select
                    name="wagId"
                    defaultValue={feature?.wagId ?? ""}
                    className={`flex-1 min-w-[12rem] ${inputCls}`}
                  >
                    <option value="">— On break —</option>
                    {wags.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.name} ({w.sport} · {w.athleteName})
                      </option>
                    ))}
                  </select>
                  <input
                    name="caption"
                    placeholder="Override caption (optional)"
                    maxLength={280}
                    defaultValue={feature?.caption ?? ""}
                    className={`flex-1 min-w-[14rem] ${inputCls}`}
                  />
                  <button type="submit" className={btnPrimaryCls}>
                    Save
                  </button>
                </form>
                {feature?.wag.hidden && (
                  <p className="mt-2 text-xs text-amber-300">
                    Scheduled WAG is currently hidden — landing will render
                    &ldquo;On break today&rdquo; until you unhide them.
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function formatDay(d: Date): string {
  // "Mon, Apr 28" — UTC-grounded so the displayed date matches what
  // the /sports page will pick up at UTC midnight.
  return d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

function weekdayLabel(d: Date): string {
  return d.toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" });
}

const inputCls =
  "rounded-lg border border-bone-700 bg-bone-950 px-3 py-2 text-sm text-bone-50 placeholder-bone-500 focus:border-claude-500 focus:outline-none focus:ring-1 focus:ring-claude-500";
const btnPrimaryCls =
  "rounded-lg bg-claude-600 px-4 py-2 text-sm font-medium text-bone-50 hover:bg-claude-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-claude-400";
