import Link from "next/link";

const CARDS = [
  {
    href: "/admin/agents",
    title: "Agents",
    body:
      "Edit each agent's persona bible, displayName, and active state. The bible is the single most load-bearing knob — it defines the voice the LLM speaks in.",
  },
  {
    href: "/admin/members",
    title: "Members",
    body:
      "Curate per-member context: a free-form blurb plus structured fields (city, favorite team). Agents see this for everyone in the conversation.",
  },
  {
    href: "/admin/relationships",
    title: "Relationships",
    body:
      "21 textareas — one per (agent × member) pair. Free-form takes that flavor how each agent talks to each specific member. The depth lever.",
  },
  {
    href: "/admin/canon",
    title: "Canon",
    body:
      "The broader Mens League lore. League history, running inside jokes, rivalries, anything an agent should reference. One big text doc, prepended to every agent prompt.",
  },
];

export default function AdminLanding() {
  return (
    <div className="space-y-4">
      <p className="text-sm text-bone-300">
        Five things you can curate. The agents read all of them on every
        message — empty fields just don&rsquo;t appear in the prompt, so you
        can build the personality up incrementally.
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
