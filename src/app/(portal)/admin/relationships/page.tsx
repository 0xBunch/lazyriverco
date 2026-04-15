import { prisma } from "@/lib/prisma";
import { updateRelationship } from "./actions";

export const dynamic = "force-dynamic";

export default async function AdminRelationshipsPage() {
  const [agents, members, relationships] = await Promise.all([
    prisma.character.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, displayName: true },
    }),
    prisma.user.findMany({
      orderBy: [{ role: "asc" }, { displayName: "asc" }],
      select: { id: true, name: true, displayName: true },
    }),
    prisma.agentRelationship.findMany({
      select: { characterId: true, targetUserId: true, content: true },
    }),
  ]);

  // Index by composite key for O(1) lookup when rendering each cell.
  const lookup = new Map<string, string>();
  for (const r of relationships) {
    lookup.set(`${r.characterId}::${r.targetUserId}`, r.content);
  }

  return (
    <div className="space-y-8">
      <p className="text-sm text-bone-300">
        One free-form blurb per (agent, member) pair — what this specific
        agent thinks about this specific member. The blurb is injected
        into the agent&rsquo;s prompt only when this user is in the
        conversation. Empty cells stay out of the prompt entirely.
        Saving an empty cell deletes the row.
      </p>

      {agents.map((agent) => (
        <section
          key={agent.id}
          className="space-y-4 rounded-2xl border border-bone-700 bg-bone-900 p-6"
        >
          <header>
            <p className="font-display text-lg font-semibold text-bone-50">
              {agent.displayName}
            </p>
            <p className="text-xs uppercase tracking-wide text-bone-400">
              what @{agent.name} thinks about each member
            </p>
          </header>

          <ul className="grid gap-4 sm:grid-cols-2">
            {members.map((member) => {
              const key = `${agent.id}::${member.id}`;
              const content = lookup.get(key) ?? "";
              return (
                <li
                  key={key}
                  className="rounded-xl border border-bone-800 bg-bone-950 p-4"
                >
                  <form
                    action={updateRelationship}
                    className="space-y-2"
                  >
                    <input
                      type="hidden"
                      name="characterId"
                      value={agent.id}
                    />
                    <input
                      type="hidden"
                      name="targetUserId"
                      value={member.id}
                    />
                    <label
                      htmlFor={`rel-${key}`}
                      className="flex items-baseline justify-between gap-2"
                    >
                      <span className="text-sm font-medium text-bone-100">
                        {member.displayName}
                      </span>
                      <span className="text-[0.7rem] text-bone-500">
                        @{member.name}
                      </span>
                    </label>
                    <textarea
                      id={`rel-${key}`}
                      name="content"
                      defaultValue={content}
                      rows={4}
                      placeholder={`How does ${agent.displayName} feel about ${member.displayName}? Free-form. Leave blank to skip.`}
                      className="w-full rounded-lg border border-bone-700 bg-bone-900 px-3 py-2 text-sm text-bone-50 placeholder-bone-500 focus:border-claude-500 focus:outline-none focus:ring-1 focus:ring-claude-500"
                    />
                    <div className="flex items-center justify-between">
                      <span className="text-[0.7rem] text-bone-500">
                        {content.length} chars
                      </span>
                      <button
                        type="submit"
                        className="rounded-md border border-bone-700 bg-bone-800 px-3 py-1 text-xs font-medium text-bone-200 transition-colors hover:border-claude-500/60 hover:text-claude-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-claude-500 focus-visible:ring-offset-2 focus-visible:ring-offset-bone-950"
                      >
                        Save
                      </button>
                    </div>
                  </form>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
