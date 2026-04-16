import { prisma } from "@/lib/prisma";
import { createLore, updateLore, deleteLore } from "./actions";
import { SaveButton } from "@/components/SaveButton";

export const dynamic = "force-dynamic";

export default async function AdminLorePage() {
  const entries = await prisma.lore.findMany({
    orderBy: [{ isCore: "desc" }, { sortOrder: "asc" }, { createdAt: "desc" }],
  });

  return (
    <div className="space-y-6">
      <p className="text-sm text-bone-300">
        Topic-tagged knowledge chunks. Agents pull in relevant entries
        based on the conversation topic via a two-pass Haiku selection
        call. Core entries are always injected regardless of topic.
      </p>

      {/* --- Create new --- */}
      <div className="rounded-2xl border border-dashed border-bone-600 bg-bone-900/50 p-6">
        <h2 className="font-display text-lg font-semibold text-bone-50">
          Add Lore Entry
        </h2>
        <form action={createLore} className="mt-4 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <label htmlFor="new-topic" className="text-xs font-medium text-bone-200">
                Topic
              </label>
              <input
                id="new-topic"
                name="topic"
                type="text"
                required
                placeholder="e.g. Fantasy Draft History"
                className="w-full rounded-lg border border-bone-700 bg-bone-950 px-3 py-2 text-sm text-bone-50 placeholder-bone-500 focus:border-claude-500 focus:outline-none focus:ring-1 focus:ring-claude-500"
              />
            </div>
            <div className="space-y-1">
              <label htmlFor="new-tags" className="text-xs font-medium text-bone-200">
                Tags (comma-separated)
              </label>
              <input
                id="new-tags"
                name="tags"
                type="text"
                placeholder="fantasy, draft, joey, trades"
                className="w-full rounded-lg border border-bone-700 bg-bone-950 px-3 py-2 text-sm text-bone-50 placeholder-bone-500 focus:border-claude-500 focus:outline-none focus:ring-1 focus:ring-claude-500"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label htmlFor="new-content" className="text-xs font-medium text-bone-200">
              Content
            </label>
            <textarea
              id="new-content"
              name="content"
              rows={6}
              required
              placeholder="The knowledge this entry contains. Keep it focused on one topic — agents get this injected verbatim when the Haiku selection picks it."
              className="w-full rounded-lg border border-bone-700 bg-bone-950 px-3 py-2 font-mono text-xs leading-relaxed text-bone-50 placeholder-bone-500 focus:border-claude-500 focus:outline-none focus:ring-1 focus:ring-claude-500"
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 text-xs text-bone-300">
                <input
                  type="checkbox"
                  name="isCore"
                  className="h-4 w-4 rounded border-bone-600 bg-bone-950 text-claude-500 focus:ring-claude-500"
                />
                Core (always injected)
              </label>
              <div className="flex items-center gap-2">
                <label htmlFor="new-sortOrder" className="text-xs text-bone-400">
                  Sort order
                </label>
                <input
                  id="new-sortOrder"
                  name="sortOrder"
                  type="number"
                  defaultValue={0}
                  className="w-16 rounded-lg border border-bone-700 bg-bone-950 px-2 py-1 text-xs text-bone-50 focus:border-claude-500 focus:outline-none focus:ring-1 focus:ring-claude-500"
                />
              </div>
            </div>
            <SaveButton label="Add Entry" />
          </div>
        </form>
      </div>

      {/* --- Existing entries --- */}
      {entries.length === 0 ? (
        <p className="text-sm italic text-bone-500">No lore entries yet.</p>
      ) : (
        <ul className="space-y-4">
          {entries.map((entry) => (
            <li
              key={entry.id}
              className="rounded-2xl border border-bone-700 bg-bone-900 p-5"
            >
              <form action={updateLore} className="space-y-3">
                <input type="hidden" name="id" value={entry.id} />
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 space-y-3">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <input
                        name="topic"
                        defaultValue={entry.topic}
                        required
                        className="rounded-lg border border-bone-700 bg-bone-950 px-3 py-1.5 text-sm font-semibold text-bone-50 focus:border-claude-500 focus:outline-none focus:ring-1 focus:ring-claude-500"
                      />
                      <input
                        name="tags"
                        defaultValue={entry.tags.join(", ")}
                        placeholder="tags"
                        className="rounded-lg border border-bone-700 bg-bone-950 px-3 py-1.5 text-xs text-bone-200 focus:border-claude-500 focus:outline-none focus:ring-1 focus:ring-claude-500"
                      />
                    </div>
                    <textarea
                      name="content"
                      defaultValue={entry.content}
                      rows={4}
                      required
                      className="w-full rounded-lg border border-bone-700 bg-bone-950 px-3 py-2 font-mono text-xs leading-relaxed text-bone-50 focus:border-claude-500 focus:outline-none focus:ring-1 focus:ring-claude-500"
                    />
                  </div>
                  {entry.isCore && (
                    <span className="shrink-0 rounded-full bg-claude-500/20 px-2 py-0.5 text-[0.6rem] font-semibold uppercase tracking-wide text-claude-200">
                      Core
                    </span>
                  )}
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <label className="flex items-center gap-2 text-xs text-bone-300">
                      <input
                        type="checkbox"
                        name="isCore"
                        defaultChecked={entry.isCore}
                        className="h-4 w-4 rounded border-bone-600 bg-bone-950 text-claude-500 focus:ring-claude-500"
                      />
                      Core
                    </label>
                    <input
                      name="sortOrder"
                      type="number"
                      defaultValue={entry.sortOrder}
                      className="w-16 rounded-lg border border-bone-700 bg-bone-950 px-2 py-1 text-xs text-bone-50 focus:border-claude-500 focus:outline-none focus:ring-1 focus:ring-claude-500"
                    />
                    <span className="text-[0.65rem] text-bone-500">
                      {entry.content.length} chars
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <form action={deleteLore}>
                      <input type="hidden" name="id" value={entry.id} />
                      <button
                        type="submit"
                        className="rounded-lg border border-bone-700 bg-bone-800 px-3 py-1.5 text-xs font-medium text-red-300 transition-colors hover:border-red-500/60 hover:text-red-200"
                      >
                        Delete
                      </button>
                    </form>
                    <SaveButton label="Save" />
                  </div>
                </div>
              </form>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
