import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { SaveButton } from "@/components/SaveButton";
import { CalendarEntryMediaSection } from "@/components/CalendarEntryMediaSection";
import {
  updateCalendarEntry,
  deleteCalendarEntry,
  detachMediaFromCalendarEntry,
  setCalendarEntryCoverMedia,
} from "../actions";

// Admin detail page for a single CalendarEntry. The parent /admin/calendar
// list stays scan-friendly (title/date/tags edits inline); this page is
// where an admin writes the long-form body, pastes a video URL, and
// manages the photo gallery. Separation keeps the list from becoming a
// vertical monster.

export const dynamic = "force-dynamic";

function formatDate(d: Date): string {
  return d.toISOString().split("T")[0] ?? "";
}

type Params = { id: string };

export default async function AdminCalendarEntryPage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { id } = await params;

  const entry = await prisma.calendarEntry.findUnique({
    where: { id },
    include: {
      media: {
        orderBy: [{ position: "asc" }, { createdAt: "asc" }],
        include: {
          media: {
            select: {
              id: true,
              url: true,
              mimeType: true,
              caption: true,
              status: true,
            },
          },
        },
      },
    },
  });

  if (!entry) notFound();

  // Only READY attachments are surfaced to the admin manager — PENDING
  // rows mid-upload stay invisible here to avoid confusing the UX.
  const readyAttachments = entry.media
    .filter((a) => a.media.status === "READY")
    .map((a) => ({
      id: a.id,
      position: a.position,
      isCover: a.isCover,
      caption: a.caption,
      media: {
        id: a.media.id,
        url: a.media.url,
        mimeType: a.media.mimeType,
        caption: a.media.caption,
      },
    }));

  return (
    <div className="space-y-8">
      <nav className="text-xs uppercase tracking-[0.2em] text-bone-400">
        <Link
          href="/admin/calendar"
          className="transition-colors hover:text-bone-200"
        >
          ← All dates
        </Link>
      </nav>

      <header>
        <p className="text-xs uppercase tracking-[0.2em] text-claude-300">
          Edit date
        </p>
        <h1 className="font-display text-3xl font-semibold tracking-tight text-bone-50">
          {entry.title}
        </h1>
        <p className="mt-1 text-xs text-bone-400">
          <Link
            href={`/calendar/${entry.id}`}
            className="underline decoration-claude-500/40 underline-offset-2 hover:text-bone-200 hover:decoration-claude-300"
          >
            View public detail page →
          </Link>
        </p>
      </header>

      {/* --- Editable fields --- */}
      <section>
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-bone-300">
          Details
        </h2>
        <form
          action={updateCalendarEntry}
          className="space-y-4 rounded-2xl border border-bone-700 bg-bone-900 p-4"
        >
          <input type="hidden" name="id" value={entry.id} />

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1">
              <label
                htmlFor="edit-title"
                className="text-xs font-medium text-bone-200"
              >
                Title
              </label>
              <input
                id="edit-title"
                name="title"
                type="text"
                defaultValue={entry.title}
                required
                className="w-full rounded-lg border border-bone-700 bg-bone-950 px-3 py-2 text-sm text-bone-50 focus:border-claude-500 focus:outline-none focus:ring-1 focus:ring-claude-500"
              />
            </div>
            <div className="space-y-1">
              <label
                htmlFor="edit-date"
                className="text-xs font-medium text-bone-200"
              >
                Date
              </label>
              <input
                id="edit-date"
                name="date"
                type="date"
                defaultValue={formatDate(entry.date)}
                required
                className="w-full rounded-lg border border-bone-700 bg-bone-950 px-3 py-2 text-sm text-bone-50 focus:border-claude-500 focus:outline-none focus:ring-1 focus:ring-claude-500"
              />
            </div>
            <div className="space-y-1">
              <label
                htmlFor="edit-recurrence"
                className="text-xs font-medium text-bone-200"
              >
                Recurrence
              </label>
              <select
                id="edit-recurrence"
                name="recurrence"
                defaultValue={entry.recurrence}
                className="w-full rounded-lg border border-bone-700 bg-bone-950 px-3 py-2 text-sm text-bone-100 focus:border-claude-500 focus:outline-none focus:ring-1 focus:ring-claude-500"
              >
                <option value="none">One-time</option>
                <option value="annual">Annual</option>
              </select>
            </div>
          </div>

          <div className="space-y-1">
            <label
              htmlFor="edit-tags"
              className="text-xs font-medium text-bone-200"
            >
              Tags (comma-separated)
            </label>
            <input
              id="edit-tags"
              name="tags"
              type="text"
              defaultValue={entry.tags.join(", ")}
              className="w-full rounded-lg border border-bone-700 bg-bone-950 px-3 py-2 text-sm text-bone-200 focus:border-claude-500 focus:outline-none focus:ring-1 focus:ring-claude-500"
            />
          </div>

          <div className="space-y-1">
            <label
              htmlFor="edit-description"
              className="text-xs font-medium text-bone-200"
            >
              Short description{" "}
              <span className="text-bone-500">
                (injected into agent context when the date is near)
              </span>
            </label>
            <input
              id="edit-description"
              name="description"
              type="text"
              defaultValue={entry.description ?? ""}
              className="w-full rounded-lg border border-bone-700 bg-bone-950 px-3 py-2 text-sm text-bone-200 focus:border-claude-500 focus:outline-none focus:ring-1 focus:ring-claude-500"
            />
          </div>

          <div className="space-y-1">
            <label
              htmlFor="edit-body"
              className="text-xs font-medium text-bone-200"
            >
              Body{" "}
              <span className="text-bone-500">
                (markdown — shown on the public detail page, not in agent
                context)
              </span>
            </label>
            <textarea
              id="edit-body"
              name="body"
              rows={8}
              defaultValue={entry.body ?? ""}
              placeholder="What happened, what's planned, who's invited, anything worth remembering…"
              className="w-full rounded-lg border border-bone-700 bg-bone-950 px-3 py-2 font-mono text-xs leading-relaxed text-bone-100 placeholder-bone-500 focus:border-claude-500 focus:outline-none focus:ring-1 focus:ring-claude-500"
            />
          </div>

          <div className="space-y-1">
            <label
              htmlFor="edit-video"
              className="text-xs font-medium text-bone-200"
            >
              Video URL{" "}
              <span className="text-bone-500">
                (YouTube or Vimeo — paste the normal share link)
              </span>
            </label>
            <input
              id="edit-video"
              name="videoEmbedUrl"
              type="url"
              defaultValue={entry.videoEmbedUrl ?? ""}
              placeholder="https://www.youtube.com/watch?v=…"
              className="w-full rounded-lg border border-bone-700 bg-bone-950 px-3 py-2 text-sm text-bone-100 placeholder-bone-500 focus:border-claude-500 focus:outline-none focus:ring-1 focus:ring-claude-500"
            />
          </div>

          <div className="flex items-center justify-between">
            {/* formAction override — same pattern as the list view. Keeps
                the button's submit inside the single outer form so HTML
                stays valid (nested <form> elements are invalid). */}
            <button
              type="submit"
              formAction={deleteCalendarEntry}
              className="text-xs font-medium text-red-300 transition-colors hover:text-red-200"
            >
              Delete this date
            </button>
            <SaveButton label="Save details" />
          </div>
        </form>
      </section>

      {/* --- Media gallery --- */}
      <section>
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-bone-300">
          Photos
        </h2>
        <div className="rounded-2xl border border-bone-700 bg-bone-900 p-4">
          <CalendarEntryMediaSection
            calendarEntryId={entry.id}
            attachments={readyAttachments}
            detachAction={detachMediaFromCalendarEntry}
            setCoverAction={setCalendarEntryCoverMedia}
          />
        </div>
      </section>
    </div>
  );
}
