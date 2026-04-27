import Link from "next/link";

// /admin/sports — landing for the Sports umbrella. Two card groups:
//
//   1) Sports apps (MLF today; future drafts/contests slot in here).
//   2) Content management for the /sports public landing page —
//      curated WAG roster + daily feature queue, highlights, schedule,
//      sponsor rotation. Headlines flow through /admin/memory/feeds
//      (set category=SPORTS on a feed there); deliberate decision to
//      reuse the shipped feeds infra rather than fork.

const SPORTS_APPS = [
  {
    href: "/admin/sports/mlf",
    title: "MLF",
    body:
      "Mens League Fantasy — fantasy football for the friend group. Currently surfaces the rookie draft cockpit; player data, season-long contests, and the public sports-news feed will land here as siblings.",
  },
] as const;

const LANDING_CONTENT = [
  {
    href: "/admin/sports/wags",
    title: "WAG roster",
    body:
      "Curate the SportsWag pool — partner name, athlete, sport/team, image URL, IG handle, editorial caption. Soft-delete via Hidden toggle.",
  },
  {
    href: "/admin/sports/wags/queue",
    title: "WAG queue",
    body:
      "Pin a WAG to a specific date. Page shows today's row + the next 13 days; pick a roster entry per date. Empty days render \"On break today\" on the public page.",
  },
  {
    href: "/admin/sports/highlights",
    title: "Highlights",
    body:
      "YouTube highlight reel for the public landing. Paste a YouTube URL plus title/channel/sport; the public grid orders by sortOrder then publishedAt.",
  },
  {
    href: "/admin/sports/schedule",
    title: "Schedule",
    body:
      "Tonight's games + where to watch. Add a row per game (teams, kickoff time, network, watch URL); LIVE status pulses amber on the public hero.",
  },
  {
    href: "/admin/sports/sponsors",
    title: "Sponsors",
    body:
      "Fake-ad rotation surfaced in the hero presenter line and the mid-page broadcast-break rail. Active sponsors rotate by hashed UTC date — same brand all day, advances at midnight.",
  },
  {
    href: "/admin/memory/feeds",
    title: "Headlines (via Feeds)",
    body:
      "Sports headlines come from the shipped feeds infra. Add an RSS feed with category=SPORTS and a sport tag; items drop into the public Headlines rail on next poll.",
  },
] as const;

export default function AdminSportsLanding() {
  return (
    <div className="space-y-8">
      <section className="space-y-4">
        <p className="text-sm text-bone-300">
          Sports apps under the Lazy River umbrella. Today MLF is the only
          live app — more slot in as siblings of the card below.
        </p>
        <ul className="grid gap-3 sm:grid-cols-2">
          {SPORTS_APPS.map((card) => (
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
      </section>

      <section className="space-y-4">
        <header>
          <h2 className="font-display text-base font-semibold text-bone-50">
            /sports landing — content management
          </h2>
          <p className="mt-1 text-sm text-bone-300">
            Curate the modules that render on the public{" "}
            <Link
              href="/sports"
              className="text-claude-300 underline decoration-claude-700 underline-offset-2 hover:text-claude-200"
            >
              /sports
            </Link>{" "}
            front page.
          </p>
        </header>
        <ul className="grid gap-3 sm:grid-cols-2">
          {LANDING_CONTENT.map((card) => (
            <li
              key={card.href}
              className="rounded-2xl border border-bone-700 bg-bone-900 p-5"
            >
              <Link
                href={card.href}
                className="font-display text-base font-semibold text-bone-50 hover:text-claude-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-claude-500 focus-visible:ring-offset-2 focus-visible:ring-offset-bone-950"
              >
                {card.title} →
              </Link>
              <p className="mt-2 text-sm text-bone-300">{card.body}</p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
