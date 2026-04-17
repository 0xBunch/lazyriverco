import { prisma } from "@/lib/prisma";
import { AgentForm } from "@/components/AgentForm";

export const dynamic = "force-dynamic";

export default async function AdminAgentsPage() {
  const agents = await prisma.character.findMany({
    orderBy: { name: "asc" },
  });

  return (
    <div className="space-y-6">
      <p className="text-sm text-bone-300">
        Edit each agent&rsquo;s persona bible and active state. The system
        prompt is the load-bearing knob — every word the agent says
        flows from it. The standard &ldquo;respond in character / 1-3
        sentences / texting in a group chat&rdquo; tail is appended
        automatically.
      </p>

      {/* --- Create new agent --- */}
      <div className="rounded-2xl border border-dashed border-bone-600 bg-bone-900/50 p-6">
        <h2 className="font-display text-lg font-semibold text-bone-50">
          Create New Agent
        </h2>
        <p className="mb-4 mt-1 text-xs text-bone-300">
          Add a new character to the roster. Pick a short @handle, give it
          a name, and write (or AI-generate) its persona bible.
        </p>
        <AgentForm mode="create" />
      </div>

      {/* --- Existing agents --- */}
      <ul className="space-y-6">
        {agents.map((agent) => (
          <li
            key={agent.id}
            className="rounded-2xl border border-bone-700 bg-bone-900 p-6"
          >
            <AgentForm
              mode="update"
              agent={{
                id: agent.id,
                name: agent.name,
                displayName: agent.displayName,
                systemPrompt: agent.systemPrompt,
                active: agent.active,
              }}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}
