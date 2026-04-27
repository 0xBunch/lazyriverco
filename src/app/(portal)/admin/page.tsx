import Link from "next/link";

const CARDS = [
  {
    href: "/admin/ai/personas",
    title: "Personas",
    body:
      "Edit each agent's persona bible, displayName, and active state. The bible is the single most load-bearing knob — it defines the voice the LLM speaks in.",
  },
  {
    href: "/admin/members/roster",
    title: "Members",
    body:
      "Curate per-member context: a free-form blurb plus structured fields (city, favorite team). Agents see this for everyone in the conversation.",
  },
  {
    href: "/admin/ai/opinions",
    title: "Opinions",
    body:
      "21 textareas — one per (agent × member) pair. Free-form takes that flavor how each agent talks to each specific member. The depth lever.",
  },
  {
    href: "/admin/memory/canon",
    title: "Canon",
    body:
      "The core identity — always injected into every agent prompt. Org hierarchy, essential context, the stuff every agent should know on every message.",
  },
  {
    href: "/admin/memory/lore",
    title: "Lore",
    body:
      "Topic-tagged knowledge chunks. Fantasy draft history, trip stories, roast archives — selectively injected when relevant to the conversation via a two-pass Haiku call.",
  },
  {
    href: "/admin/memory/library",
    title: "Library",
    body:
      "Bulk tools for the shared visual bank. Select rows to delete, hide, star for Hall of Fame, or add/remove tags in one shot. Drop photos directly to upload. Agents reach the same data via the library_search tool.",
  },
  {
    href: "/admin/memory/taxonomy",
    title: "Taxonomy",
    body:
      "Controlled vocabulary for the Gemini vision tagger. Preferred buckets (people / places / topics / vibes) nudge the model toward canonical slugs; the banned bucket strips a tag from every item and blocks future AI emission in one click.",
  },
  {
    href: "/admin/calendar",
    title: "Calendar",
    body:
      "Birthdays, cultural moments, trip dates. Auto-injected into agent prompts when the date is within a week. Recurrence support for annual events.",
  },
  {
    href: "/admin/ai/prompts",
    title: "Prompts",
    body:
      "Homepage dropdown groups — the claude.ai-style row beneath the prompt box. Each group (\u201CWrite\u201D, \u201CRoast\u201D) is a button; each item pastes its full prompt text into the input on click.",
  },
  {
    href: "/admin/draft",
    title: "Draft",
    body:
      "The Mens League Rookie Draft room — create a draft event, map managers to slots, curate the rookie pool, upload Goodell-box images, line up sponsors, and run the live commissioner cockpit.",
  },
];

export default function AdminLanding() {
  return (
    <div className="space-y-4">
      <p className="text-sm text-bone-300">
        Ten things you can curate. Canon, members, and opinions are
        always injected. Lore and media are selectively pulled in based on
        conversation topic. Calendar entries auto-appear near their dates.
        Taxonomy shapes how Gemini tags new library uploads. Prompts
        drives the homepage dropdown suggestions. Personas, Opinions, and
        Prompts live under the AI tab; Canon, Lore, Library, Taxonomy,
        and Feeds live under the Memory tab. Roster, Usage, and Pricing
        live under the Members tab.
      </p>
      <ul className="grid gap-3 sm:grid-cols-2">
        {CARDS.map((card) => (
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
