import Link from "next/link";
import { redirect } from "next/navigation";
import { IconBallAmericanFootball } from "@tabler/icons-react";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

// Sports dashboard — parent surface for every sport module (MLF fantasy
// football today, future NBA/MLB/etc. modules). Placeholder card grid
// for now; a richer at-a-glance dashboard (scores, standings, injury
// alerts, next matchup) lands in a follow-up.

type SportCard = {
  href: string;
  label: string;
  tagline: string;
  Icon: typeof IconBallAmericanFootball;
  available: boolean;
};

const SPORTS: SportCard[] = [
  {
    href: "/sports/mlf",
    label: "MLF",
    tagline: "Men's League · Sleeper fantasy football",
    Icon: IconBallAmericanFootball,
    available: true,
  },
];

export default async function SportsDashboardPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/start");

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 md:px-6 md:py-10">
      <header className="mb-6 md:mb-8">
        <h1 className="font-display text-2xl font-semibold tracking-tight text-bone-50 text-balance">
          Sports
        </h1>
        <p className="mt-1 text-sm text-bone-300 text-pretty">
          Every league, roster, and box score the clubhouse cares about. More
          sports arrive as we wire them up.
        </p>
      </header>

      <ul className="grid gap-3 md:grid-cols-2">
        {SPORTS.map((s) =>
          s.available ? (
            <li key={s.href}>
              <Link
                href={s.href}
                className="group flex items-start gap-3 rounded-xl border border-bone-800 bg-bone-900/40 p-4 transition-colors hover:border-bone-700 hover:bg-bone-900/70 focus:outline-none focus-visible:ring-2 focus-visible:ring-claude-500"
              >
                <span
                  aria-hidden="true"
                  className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-lg border border-bone-700 bg-bone-950 text-bone-200 group-hover:text-bone-50"
                >
                  <s.Icon size={22} stroke={1.5} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-display text-base font-semibold text-bone-50">
                    {s.label}
                  </span>
                  <span className="mt-0.5 block text-sm text-bone-400">
                    {s.tagline}
                  </span>
                </span>
                <span
                  aria-hidden="true"
                  className="self-center text-bone-500 transition-colors group-hover:text-bone-200"
                >
                  →
                </span>
              </Link>
            </li>
          ) : (
            <li key={s.href}>
              <div
                aria-disabled="true"
                className="flex items-start gap-3 rounded-xl border border-dashed border-bone-800 bg-bone-900/20 p-4 opacity-60"
              >
                <span
                  aria-hidden="true"
                  className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-lg border border-bone-800 bg-bone-950 text-bone-500"
                >
                  <s.Icon size={22} stroke={1.5} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-display text-base font-semibold text-bone-300">
                    {s.label}
                  </span>
                  <span className="mt-0.5 block text-sm text-bone-500">
                    {s.tagline}
                  </span>
                </span>
                <span className="self-center text-[10px] uppercase tracking-widest text-bone-500">
                  Soon
                </span>
              </div>
            </li>
          ),
        )}
      </ul>
    </div>
  );
}
