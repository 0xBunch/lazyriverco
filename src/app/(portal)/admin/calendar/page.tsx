import { prisma } from "@/lib/prisma";
import {
  createCalendarEntry,
  updateCalendarEntry,
  deleteCalendarEntry,
} from "./actions";
import { SaveButton } from "@/components/SaveButton";

export const dynamic = "force-dynamic";

function formatDate(d: Date): string {
  return d.toISOString().split("T")[0] ?? "";
}

export default async function AdminCalendarPage() {
  const entries = await prisma.calendarEntry.findMany({
    orderBy: { date: "asc" },
  });

  return (
    <div className="space-y-6">
      <p className="text-sm text-bone-300">
        Birthdays, cultural moments, trip dates. Auto-injected into agent
        prompts when the date is within a week. Annual entries repeat
        every year (birthdays); one-time entries fire once.
      </p>

      {/* --- Add new --- */}
      <div className="rounded-2xl border border-dashed border-bone-600 bg-bone-900/50 p-6">
        <h2 className="font-display text-lg font-semibold text-bone-50">
          Add Date
        </h2>
        <form action={createCalendarEntry} className="mt-4 space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1">
              <label htmlFor="new-title" className="text-xs font-medium text-bone-200">
                Title
              </label>
              <input
                id="new-title"
                name="title"
                type="text"
                required
                placeholder="Billy's Birthday"
                className="w-full rounded-lg border border-bone-700 bg-bone-950 px-3 py-2 text-sm text-bone-50 placeholder-bone-500 focus:border-claude-500 focus:outline-none focus:ring-1 focus:ring-claude-500"
              />
            </div>
            <div className="space-y-1">
              <label htmlFor="new-date" className="text-xs font-medium text-bone-200">
                Date
              </label>
              <input
                id="new-date"
                name="date"
                type="date"
                required
                className="w-full rounded-lg border border-bone-700 bg-bone-950 px-3 py-2 text-sm text-bone-50 focus:border-claude-500 focus:outline-none focus:ring-1 focus:ring-claude-500"
              />
            </div>
            <div className="space-y-1">
              <label htmlFor="new-recurrence" className="text-xs font-medium text-bone-200">
                Recurrence
              </label>
              <select
                id="new-recurrence"
                name="recurrence"
                className="w-full rounded-lg border border-bone-700 bg-bone-950 px-3 py-2 text-sm text-bone-100 focus:border-claude-500 focus:outline-none focus:ring-1 focus:ring-claude-500"
              >
                <option value="none">One-time</option>
                <option value="annual">Annual (repeats every year)</option>
              </select>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <label htmlFor="new-tags" className="text-xs font-medium text-bone-200">
                Tags (comma-separated)
              </label>
              <input
                id="new-tags"
                name="tags"
                type="text"
                placeholder="billy, birthday"
                className="w-full rounded-lg border border-bone-700 bg-bone-950 px-3 py-2 text-sm text-bone-50 placeholder-bone-500 focus:border-claude-500 focus:outline-none focus:ring-1 focus:ring-claude-500"
              />
            </div>
            <div className="space-y-1">
              <label htmlFor="new-description" className="text-xs font-medium text-bone-200">
                Description (optional)
              </label>
              <input
                id="new-description"
                name="description"
                type="text"
                placeholder="Turning 35, roast-worthy"
                className="w-full rounded-lg border border-bone-700 bg-bone-950 px-3 py-2 text-sm text-bone-50 placeholder-bone-500 focus:border-claude-500 focus:outline-none focus:ring-1 focus:ring-claude-500"
              />
            </div>
          </div>

          <div className="flex justify-end">
            <SaveButton label="Add Date" />
          </div>
        </form>
      </div>

      {/* --- Existing entries --- */}
      {entries.length === 0 ? (
        <p className="text-sm italic text-bone-500">No dates yet.</p>
      ) : (
        <ul className="space-y-3">
          {entries.map((entry) => (
            <li
              key={entry.id}
              className="rounded-2xl border border-bone-700 bg-bone-900 p-4"
            >
              <form action={updateCalendarEntry} className="space-y-3">
                <input type="hidden" name="id" value={entry.id} />
                <div className="grid gap-3 sm:grid-cols-4">
                  <input
                    name="title"
                    defaultValue={entry.title}
                    required
                    className="rounded-lg border border-bone-700 bg-bone-950 px-3 py-1.5 text-sm font-semibold text-bone-50 focus:border-claude-500 focus:outline-none focus:ring-1 focus:ring-claude-500"
                  />
                  <input
                    name="date"
                    type="date"
                    defaultValue={formatDate(entry.date)}
                    required
                    className="rounded-lg border border-bone-700 bg-bone-950 px-3 py-1.5 text-sm text-bone-100 focus:border-claude-500 focus:outline-none focus:ring-1 focus:ring-claude-500"
                  />
                  <select
                    name="recurrence"
                    defaultValue={entry.recurrence}
                    className="rounded-lg border border-bone-700 bg-bone-950 px-3 py-1.5 text-sm text-bone-100 focus:border-claude-500 focus:outline-none focus:ring-1 focus:ring-claude-500"
                  >
                    <option value="none">One-time</option>
                    <option value="annual">Annual</option>
                  </select>
                  <input
                    name="tags"
                    defaultValue={entry.tags.join(", ")}
                    placeholder="tags"
                    className="rounded-lg border border-bone-700 bg-bone-950 px-3 py-1.5 text-xs text-bone-200 focus:border-claude-500 focus:outline-none focus:ring-1 focus:ring-claude-500"
                  />
                </div>

                <input
                  name="description"
                  defaultValue={entry.description ?? ""}
                  placeholder="Description (optional)"
                  className="w-full rounded-lg border border-bone-700 bg-bone-950 px-3 py-1.5 text-xs text-bone-200 focus:border-claude-500 focus:outline-none focus:ring-1 focus:ring-claude-500"
                />

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {entry.recurrence === "annual" && (
                      <span className="rounded-full bg-claude-500/20 px-2 py-0.5 text-[0.6rem] font-semibold uppercase tracking-wide text-claude-200">
                        Repeats annually
                      </span>
                    )}
                  </div>
                  <div className="flex gap-2">
                    {/* Delete uses formAction to override the parent form's
                        action. Avoids nested <form>s (invalid HTML — browsers
                        silently drop the inner form, which was why Delete
                        appeared to do nothing and instead re-saved the row). */}
                    <button
                      type="submit"
                      formAction={deleteCalendarEntry}
                      className="rounded-lg border border-bone-700 bg-bone-800 px-3 py-1.5 text-xs font-medium text-red-300 transition-colors hover:border-red-500/60 hover:text-red-200"
                    >
                      Delete
                    </button>
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
