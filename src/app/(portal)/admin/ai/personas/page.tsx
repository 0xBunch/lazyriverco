import { prisma } from "@/lib/prisma";
import { AgentForm } from "@/components/AgentForm";
import { reorderAgent, setDefaultAgent } from "./actions";

export const dynamic = "force-dynamic";

export default async function AdminAgentsPage() {
  const agents = await prisma.character.findMany({
    orderBy: [{ displayOrder: "asc" }, { displayName: "asc" }],
  });

  return (
    <div className="space-y-6">
      <p className="text-sm text-bone-300">
        Edit each agent&rsquo;s persona, model tier, and conversation
        posture. The persona bible is the load-bearing knob — every word
        flows from it. Model picks the Anthropic tier (Haiku / Sonnet /
        Opus) this agent runs on. Dialogue mode lifts the built-in
        length cap and lets the agent emit clickable follow-up chips
        when the topic has natural branches. Use the order arrows to
        rearrange how agents appear in the homepage picker, and the
        default radio to pick which one starts pre-selected.
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
        {agents.map((agent, index) => (
          <li
            key={agent.id}
            className="rounded-2xl border border-bone-700 bg-bone-900 p-6"
          >
            <OrderControls
              agentId={agent.id}
              isFirst={index === 0}
              isLast={index === agents.length - 1}
              isDefault={agent.isDefault}
            />
            <AgentForm
              mode="update"
              agent={{
                id: agent.id,
                name: agent.name,
                displayName: agent.displayName,
                systemPrompt: agent.systemPrompt,
                active: agent.active,
                avatarUrl: agent.avatarUrl,
                dialogueMode: agent.dialogueMode,
                model: agent.model,
              }}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Per-row controls for reordering and "make default" — sits above each
 *  AgentForm because (a) it's a separate concern from persona editing and
 *  (b) each control is its own <form action={…}> so it can't nest inside
 *  the AgentForm without violating the no-nested-forms rule. */
function OrderControls({
  agentId,
  isFirst,
  isLast,
  isDefault,
}: {
  agentId: string;
  isFirst: boolean;
  isLast: boolean;
  isDefault: boolean;
}) {
  return (
    <div className="mb-4 flex items-center justify-between border-b border-bone-800 pb-3">
      <div className="flex items-center gap-1">
        <form action={reorderAgent}>
          <input type="hidden" name="id" value={agentId} />
          <input type="hidden" name="direction" value="up" />
          <button
            type="submit"
            disabled={isFirst}
            aria-label="Move up"
            className="rounded-md border border-bone-700 bg-bone-950 px-2 py-1 text-xs text-bone-200 transition-colors hover:border-claude-500/60 hover:text-claude-50 disabled:cursor-not-allowed disabled:opacity-30"
          >
            ↑
          </button>
        </form>
        <form action={reorderAgent}>
          <input type="hidden" name="id" value={agentId} />
          <input type="hidden" name="direction" value="down" />
          <button
            type="submit"
            disabled={isLast}
            aria-label="Move down"
            className="rounded-md border border-bone-700 bg-bone-950 px-2 py-1 text-xs text-bone-200 transition-colors hover:border-claude-500/60 hover:text-claude-50 disabled:cursor-not-allowed disabled:opacity-30"
          >
            ↓
          </button>
        </form>
      </div>

      {isDefault ? (
        <span className="rounded-full border border-claude-500/40 bg-claude-500/10 px-3 py-1 text-[0.7rem] font-semibold uppercase tracking-[0.15em] text-claude-100">
          ★ Default
        </span>
      ) : (
        <form action={setDefaultAgent}>
          <input type="hidden" name="id" value={agentId} />
          <button
            type="submit"
            className="rounded-full border border-bone-700 bg-bone-950 px-3 py-1 text-[0.7rem] font-medium uppercase tracking-[0.15em] text-bone-300 transition-colors hover:border-claude-500/60 hover:text-claude-50"
          >
            Set as default
          </button>
        </form>
      )}
    </div>
  );
}
