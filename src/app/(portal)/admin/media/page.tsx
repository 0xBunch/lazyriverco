import { prisma } from "@/lib/prisma";
import { createExternalMedia, updateMedia, deleteMedia } from "./actions";
import { SaveButton } from "@/components/SaveButton";

export const dynamic = "force-dynamic";

const TYPE_LABELS: Record<string, string> = {
  image: "📷 Photo",
  video: "🎬 Video",
  youtube: "▶️ YouTube",
  instagram: "📸 Instagram",
  tweet: "🐦 Tweet",
  link: "🔗 Link",
};

export default async function AdminMediaPage() {
  const media = await prisma.media.findMany({
    where: { status: { not: "DELETED" } },
    orderBy: [{ hallOfFame: "desc" }, { createdAt: "desc" }],
    include: { uploadedBy: { select: { displayName: true } } },
  });

  return (
    <div className="space-y-6">
      <p className="text-sm text-bone-300">
        Photos, videos, links, and social posts. Tagged and captioned so
        agents can reference them when relevant. External links are stored
        directly — no upload needed.
      </p>

      {/* --- Add external link --- */}
      <div className="rounded-2xl border border-dashed border-bone-600 bg-bone-900/50 p-6">
        <h2 className="font-display text-lg font-semibold text-bone-50">
          Add External Link
        </h2>
        <form action={createExternalMedia} className="mt-4 space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1 sm:col-span-2">
              <label htmlFor="new-url" className="text-xs font-medium text-bone-200">
                URL
              </label>
              <input
                id="new-url"
                name="url"
                type="url"
                required
                placeholder="https://youtube.com/watch?v=..."
                className="w-full rounded-lg border border-bone-700 bg-bone-950 px-3 py-2 text-sm text-bone-50 placeholder-bone-500 focus:border-claude-500 focus:outline-none focus:ring-1 focus:ring-claude-500"
              />
            </div>
            <div className="space-y-1">
              <label htmlFor="new-type" className="text-xs font-medium text-bone-200">
                Type
              </label>
              <select
                id="new-type"
                name="type"
                required
                className="w-full rounded-lg border border-bone-700 bg-bone-950 px-3 py-2 text-sm text-bone-100 focus:border-claude-500 focus:outline-none focus:ring-1 focus:ring-claude-500"
              >
                <option value="youtube">YouTube</option>
                <option value="instagram">Instagram</option>
                <option value="tweet">Tweet</option>
                <option value="link">Article / Link</option>
                <option value="image">Photo (external URL)</option>
                <option value="video">Video (external URL)</option>
              </select>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <label htmlFor="new-caption" className="text-xs font-medium text-bone-200">
                Caption
              </label>
              <input
                id="new-caption"
                name="caption"
                type="text"
                placeholder="What is this? (agents see this in their prompt)"
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
                placeholder="joey, draft, espn"
                className="w-full rounded-lg border border-bone-700 bg-bone-950 px-3 py-2 text-sm text-bone-50 placeholder-bone-500 focus:border-claude-500 focus:outline-none focus:ring-1 focus:ring-claude-500"
              />
            </div>
          </div>

          <div className="flex justify-end">
            <SaveButton label="Add Media" />
          </div>
        </form>
      </div>

      {/* --- Existing media --- */}
      {media.length === 0 ? (
        <p className="text-sm italic text-bone-500">No media yet.</p>
      ) : (
        <ul className="space-y-3">
          {media.map((item) => (
            <li
              key={item.id}
              className="rounded-2xl border border-bone-700 bg-bone-900 p-4"
            >
              <form action={updateMedia} className="space-y-3">
                <input type="hidden" name="id" value={item.id} />
                <div className="flex items-start gap-4">
                  <span className="shrink-0 rounded-md bg-bone-800 px-2 py-1 text-xs font-medium text-bone-200">
                    {TYPE_LABELS[item.type] ?? item.type}
                  </span>
                  <div className="min-w-0 flex-1">
                    <a
                      href={item.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block truncate text-sm text-claude-300 underline decoration-claude-500/40 underline-offset-2 hover:text-claude-200"
                    >
                      {item.url}
                    </a>
                    <p className="mt-1 text-[0.65rem] text-bone-500">
                      Added by {item.uploadedBy.displayName}
                    </p>
                  </div>
                  {item.hallOfFame && (
                    <span className="shrink-0 rounded-full bg-amber-500/20 px-2 py-0.5 text-[0.6rem] font-semibold uppercase tracking-wide text-amber-300">
                      Hall of Fame
                    </span>
                  )}
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <input
                    name="caption"
                    defaultValue={item.caption ?? ""}
                    placeholder="Caption"
                    className="rounded-lg border border-bone-700 bg-bone-950 px-3 py-1.5 text-xs text-bone-100 focus:border-claude-500 focus:outline-none focus:ring-1 focus:ring-claude-500"
                  />
                  <input
                    name="tags"
                    defaultValue={item.tags.join(", ")}
                    placeholder="Tags"
                    className="rounded-lg border border-bone-700 bg-bone-950 px-3 py-1.5 text-xs text-bone-100 focus:border-claude-500 focus:outline-none focus:ring-1 focus:ring-claude-500"
                  />
                </div>

                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-2 text-xs text-bone-300">
                    <input
                      type="checkbox"
                      name="hallOfFame"
                      defaultChecked={item.hallOfFame}
                      className="h-4 w-4 rounded border-bone-600 bg-bone-950 text-claude-500 focus:ring-claude-500"
                    />
                    Hall of Fame
                  </label>
                  <div className="flex gap-2">
                    <form action={deleteMedia}>
                      <input type="hidden" name="id" value={item.id} />
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
