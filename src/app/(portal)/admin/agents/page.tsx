import { prisma } from "@/lib/prisma";
import { createAgent, updateAgent } from "./actions";
import { SaveButton } from "@/components/SaveButton";
import { PromptSuggester } from "@/components/PromptSuggester";

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
        <p className="mb-4 mt-1 text-xs text-bone-400">
          Add a new character to the roster. Pick a short @handle, give it
          a name, and write (or AI-generate) its persona bible.
        </p>
        <form action={createAgent} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <label
                htmlFor="new-name"
                className="text-xs font-medium text-bone-200"
              >
                Slug (@handle)
              </label>
              <input
                id="new-name"
                name="name"
                type="text"
                required
                placeholder="e.g. barfdog"
                className="w-full rounded-lg border border-bone-700 bg-bone-950 px-3 py-2 text-sm text-bone-50 placeholder-bone-500 focus:border-claude-500 focus:outline-none focus:ring-1 focus:ring-claude-500"
              />
            </div>
            <div className="space-y-1">
              <label
                htmlFor="new-displayName"
                className="text-xs font-medium text-bone-200"
              >
                Display name
              </label>
              <input
                id="new-displayName"
                name="displayName"
                type="text"
                required
                placeholder='e.g. Joey "Barfdog" Freedman'
                className="w-full rounded-lg border border-bone-700 bg-bone-950 px-3 py-2 text-sm text-bone-50 placeholder-bone-500 focus:border-claude-500 focus:outline-none focus:ring-1 focus:ring-claude-500"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label
              htmlFor="new-systemPrompt"
              className="text-xs font-medium text-bone-200"
            >
              System prompt (persona bible)
            </label>
            <textarea
              id="new-systemPrompt"
              name="systemPrompt"
              rows={8}
              required
              placeholder="Write the character's persona — who they are, how they talk, what topics they're experts on, what makes them funny. Or type a few sentences and hit 'Suggest improvements' to let Claude flesh it out."
              className="w-full rounded-lg border border-bone-700 bg-bone-950 px-3 py-2 font-mono text-xs leading-relaxed text-bone-50 placeholder-bone-500 focus:border-claude-500 focus:outline-none focus:ring-1 focus:ring-claude-500"
            />
            <div className="flex justify-end">
              <PromptSuggester
                textareaId="new-systemPrompt"
                characterName="New agent"
              />
            </div>
          </div>

          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 text-xs text-bone-300">
              <input
                type="checkbox"
                name="active"
                defaultChecked
                className="h-4 w-4 rounded border-bone-600 bg-bone-950 text-claude-500 focus:ring-claude-500"
              />
              Active
            </label>
            <SaveButton label="Create Agent" />
          </div>
        </form>
      </div>

      {/* --- Existing agents --- */}
      <ul className="space-y-6">
        {agents.map((agent) => (
          <li
            key={agent.id}
            className="rounded-2xl border border-bone-700 bg-bone-900 p-6"
          >
            <form action={updateAgent} className="space-y-4">
              <input type="hidden" name="id" value={agent.id} />
              <header className="flex items-start justify-between gap-4">
                <div>
                  <p className="font-display text-lg font-semibold text-bone-50">
                    {agent.displayName}
                  </p>
                  <p className="text-xs uppercase tracking-wide text-bone-400">
                    @{agent.name}
                  </p>
                </div>
                <label className="flex items-center gap-2 text-xs text-bone-300">
                  <input
                    type="checkbox"
                    name="active"
                    defaultChecked={agent.active}
                    className="h-4 w-4 rounded border-bone-600 bg-bone-950 text-claude-500 focus:ring-claude-500"
                  />
                  Active
                </label>
              </header>

              <div className="space-y-1">
                <label
                  htmlFor={`displayName-${agent.id}`}
                  className="text-xs font-medium text-bone-200"
                >
                  Display name
                </label>
                <input
                  id={`displayName-${agent.id}`}
                  name="displayName"
                  type="text"
                  defaultValue={agent.displayName}
                  required
                  className="w-full rounded-lg border border-bone-700 bg-bone-950 px-3 py-2 text-sm text-bone-50 focus:border-claude-500 focus:outline-none focus:ring-1 focus:ring-claude-500"
                />
              </div>

              <div className="space-y-1">
                <label
                  htmlFor={`systemPrompt-${agent.id}`}
                  className="text-xs font-medium text-bone-200"
                >
                  System prompt (persona bible)
                </label>
                <textarea
                  id={`systemPrompt-${agent.id}`}
                  name="systemPrompt"
                  defaultValue={agent.systemPrompt}
                  rows={16}
                  required
                  className="w-full rounded-lg border border-bone-700 bg-bone-950 px-3 py-2 font-mono text-xs leading-relaxed text-bone-50 focus:border-claude-500 focus:outline-none focus:ring-1 focus:ring-claude-500"
                />
                <div className="flex items-center justify-between">
                  <p className="text-[0.7rem] text-bone-400">
                    {agent.systemPrompt.length} chars
                  </p>
                  <PromptSuggester
                    textareaId={`systemPrompt-${agent.id}`}
                    characterName={agent.displayName}
                  />
                </div>
              </div>

              <div className="flex justify-end">
                <SaveButton label={`Save ${agent.displayName}`} />
              </div>
            </form>
          </li>
        ))}
      </ul>
    </div>
  );
}
