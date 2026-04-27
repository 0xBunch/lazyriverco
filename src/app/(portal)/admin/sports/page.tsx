import Link from "next/link";

// /admin/sports — landing for the Sports umbrella. Today only MLF
// (Mens League Fantasy / fantasy football) lives here, but this page
// is designed to grow as more sports apps appear (rookie drafts for
// other sports, season-long contests, prop trackers, whatever's next).
// The card pattern matches the top-level /admin Overview so a future
// addition is a one-line change to the SPORTS array.

const SPORTS = [
  {
    href: "/admin/sports/mlf",
    title: "MLF",
    body:
      "Mens League Fantasy — fantasy football for the friend group. Currently surfaces the rookie draft cockpit; player data, season-long contests, and the public sports-news feed will land here as siblings.",
  },
] as const;

export default function AdminSportsLanding() {
  return (
    <div className="space-y-4">
      <p className="text-sm text-bone-300">
        Sports apps under the Lazy River umbrella. Today MLF is the only
        live surface — more apps slot in as siblings of the card below.
      </p>
      <ul className="grid gap-3 sm:grid-cols-2">
        {SPORTS.map((card) => (
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
