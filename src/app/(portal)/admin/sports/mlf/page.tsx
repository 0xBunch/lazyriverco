import Link from "next/link";

// /admin/sports/mlf — landing for MLF (Mens League Fantasy) admin
// surfaces. Today only the rookie draft cockpit lives under here, but
// this page is designed to grow as more MLF surfaces appear: season-
// long matchup admin, sports-news feed controller, player data
// editors, etc.

const MLF_SURFACES = [
  {
    href: "/admin/sports/mlf/draft",
    title: "Draft",
    body:
      "The Mens League Rookie Draft room — create a draft event, map managers to slots, curate the rookie pool, upload Goodell-box images, line up sponsors, and run the live commissioner cockpit.",
  },
] as const;

export default function AdminMlfLanding() {
  return (
    <div className="space-y-4">
      <p className="text-sm text-bone-300">
        MLF (Mens League Fantasy) admin surfaces. Today only the draft
        cockpit lives here.
      </p>
      <ul className="grid gap-3 sm:grid-cols-2">
        {MLF_SURFACES.map((card) => (
          <li
            key={card.href}
            className="rounded-2xl border border-bone-700 bg-bone-900 p-5"
          >
            <Link
              href={card.href}
              className="font-display text-lg font-semibold text-bone-50 hover:text-claude-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-claude-500 focus-visible:ring-offset-2 focus-visible:ring-offset-bone-950"
            >
              {card.title} →
            </Link>
            <p className="mt-2 text-sm text-bone-300">{card.body}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
